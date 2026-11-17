#!/usr/bin/env node
// Builds the "Map My VOD" YouTube files for a reviewed VOD.
//   node .claude/skills/map-my-vod/scripts/map-my-vod.mjs <vod file> [thumbnail|video|description|all] [--title "<video title>"]
// <vod file> is a vod_review/ file name that has timestamps in app/data/map-data.json.
// Writes to vod_review/youtube/: <name>_thumbnail.png, <name>_map-my-vod.mp4 and
// <name>.txt (YouTube description: title, credits, timestamps).
// Per-map layout (official title crop, visible map area) lives in ../maps.json.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './cdp.mjs';

// Minimap timing (seconds): the icon flashes for FLASH, stays highlighted for
// HOLD, then the map hides. A new timestamp cuts the previous one short.
const FLASH = 3, HOLD = 1, BLINK = 0.3;
const MINIMAP_W = 380, MINIMAP_DPR = 1.4; // 532 px wide on the 1080p video
const MINIMAP_MAX_H = 400;                // CSS px; tall maps get a narrower minimap
const MARGIN = 28;                        // minimap distance from the bottom-right corner
const SERVER_PORT = 5199;
const CREDIT_LOGO = 'maps/ape_squad_map/ape_squad_logo.png'; // the high-res map art is by Ape Squad
const CREDITS = [
  'high-res map made by https://apesquad.org/maps',
  'tool used for mapping https://is-this-ai-ok.github.io/the_finals/',
];

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const args = process.argv.slice(2);
const titleAt = args.indexOf('--title');
const title = titleAt >= 0 ? args.splice(titleAt, 2)[1] : null;
const [vodFile, mode = 'all'] = args;
if (!vodFile || !['thumbnail', 'video', 'description', 'all'].includes(mode)) {
  console.error('usage: map-my-vod.mjs <vod file in vod_review/> [thumbnail|video|description|all] [--title "<video title>"]');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/data/map-data.json'), 'utf8'));
const vod = data.vods?.[vodFile];
if (!vod) throw new Error(`no timestamps for ${vodFile} in app/data/map-data.json`);
const layout = JSON.parse(fs.readFileSync(path.join(HERE, '../maps.json'), 'utf8'))[vod.map];
if (!layout) throw new Error(`no entry for "${vod.map}" in .claude/skills/map-my-vod/maps.json (see SKILL.md)`);

const base = vodFile.replace(/\.[^.]+$/, '');
const OUT_DIR = path.join(ROOT, 'vod_review/youtube'); // kept apart from the original VOD files
fs.mkdirSync(OUT_DIR, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'map-my-vod-'));
const cfg = { map: vod.map, vod: vodFile, view: layout.view };
// Without a "view" in maps.json, show the whole (north-up) map image.
const grid = data.maps[vod.map]?.gridSize || { width: 1, height: 1 };
const view = layout.view || { x0: -grid.width / 2, x1: grid.width / 2, y0: -grid.height / 2, y1: grid.height / 2 };
const aspect = (view.x1 - view.x0) / (view.y1 - view.y0); // width / height of the visible map
const script = (f) => path.join(HERE, f);

// Serve a read-only build of the app, so nothing here can write to map-data.json.
execFileSync('node', [path.join(ROOT, 'app/build-static.js'), path.join(tmp, 'site')], { stdio: 'ignore' });
const server = spawn('python3', ['-m', 'http.server', String(SERVER_PORT)], { cwd: path.join(tmp, 'site'), stdio: 'ignore' });
const url = `http://localhost:${SERVER_PORT}/`;
await new Promise((r) => setTimeout(r, 800));

try {
  if (mode === 'all' || mode === 'description') description();
  if (mode === 'all' || mode === 'thumbnail') await thumbnail();
  if (mode === 'all' || mode === 'video') await video();
} finally {
  server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}

// YouTube description: title, credits, then the timestamps in the same format as
// the vod_review/<name>.txt the app server writes (that file is regenerated on
// every save, so the extra lines live here instead).
function description() {
  const fmt = (t) => {
    const s = Math.floor(t);
    const mmss = String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    return vod.duration >= 3600 ? Math.floor(s / 3600) + ':' + mmss : mmss;
  };
  const mapName = base.replace(/^\d{4}-\d{2}-\d{2}_\d+_/, '').replace(/-/g, ' ');
  const stamps = [...vod.timestamps]
    .sort((a, b) => a.t - b.t)
    .map((ts) => `${fmt(ts.t)} ${(ts.text || '').replace(/\s+/g, ' ').trim()}`);
  const txt = [title || `Map My VOD: ${mapName} | THE FINALS VOD Review`, ...CREDITS, '', `${fmt(0)} Start`, ...stamps].join('\n') + '\n';
  fs.writeFileSync(path.join(OUT_DIR, `${base}.txt`), txt);
  console.log(`description: vod_review/youtube/${base}.txt (${stamps.length} timestamps)`);
}

// #rrggbb of one pixel of an image.
function pixelColor(file, x, y) {
  const rgb = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `crop=1:1:${x}:${y},format=rgb24`,
    '-frames:v', '1', '-f', 'rawvideo', '-']);
  return '#' + [...rgb.subarray(0, 3)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function imageSize(file) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  return { w: +/pixelWidth: (\d+)/.exec(out)[1], h: +/pixelHeight: (\d+)/.exec(out)[1] };
}

// 1280x720: official "THE FINALS | <MAP>" title, "MAP MY VOD" and the map-art
// credit stacked and vertically centred on the left, the map with every icon on the right.
async function thumbnail() {
  const mapH = 720, mapW = 640; // the map fills the right half; top/bottom may be clipped
  // Render at a smaller CSS size and higher pixel ratio so icons come out
  // THUMB_ICON_SCALE times their in-app size, still sharp.
  const THUMB_ICON_SCALE = 1.6;
  const counts = await render({ url, w: Math.round(mapW / THUMB_ICON_SCALE), h: Math.round(mapH / THUMB_ICON_SCALE),
    dpr: 2 * THUMB_ICON_SCALE, cfg: { ...cfg, fit: 'cover' }, scripts: [script('setup.js'), script('thumbmap.js')], screenshot: path.join(tmp, 'map.png') });

  const official = path.join(ROOT, layout.official);
  fs.copyFileSync(official, path.join(tmp, 'official' + path.extname(official)));
  const { w: officialW } = imageSize(official);
  const bg = pixelColor(official, layout.titleCrop.x + 2, layout.titleCrop.y + 2); // blend the title crop into the panel
  fs.copyFileSync(path.join(ROOT, CREDIT_LOGO), path.join(tmp, 'credit-logo.png'));
  const c = layout.titleCrop, TITLE_W = 486, s = TITLE_W / c.w;
  const html = `<!doctype html><html><head><style>
  html, body { margin: 0; width: 1280px; height: 720px; overflow: hidden; background: ${bg}; }
  .left { position: absolute; left: 40px; top: 0; width: 500px; height: 720px;
    display: flex; flex-direction: column; justify-content: center; gap: 14px; }
  .title { position: relative; width: ${TITLE_W}px; height: ${Math.round(c.h * s)}px; overflow: hidden; }
  /* Feather the crop's edges so the official background's texture doesn't show a box. */
  .title { -webkit-mask-image: linear-gradient(to right, transparent, #000 3%, #000 97%, transparent),
      linear-gradient(to bottom, transparent, #000 6%, #000 94%, transparent);
    -webkit-mask-composite: source-in; mask-composite: intersect; }
  .title img { position: absolute; width: ${Math.round(officialW * s)}px; left: ${-Math.round(c.x * s)}px; top: ${-Math.round(c.y * s)}px; }
  /* Stand-in for the official title face: bold, condensed, italic, uppercase. */
  .series { margin: 0 0 0 4px; color: #fff; text-transform: uppercase; white-space: nowrap;
    font-family: 'Avenir Next Condensed'; font-weight: 800; font-style: italic;
    font-size: 87px; line-height: 0.95; letter-spacing: -1px; }
  /* Map-art credit, about two lines of its own text below the series name. */
  .credit { display: flex; align-items: center; gap: 10px; margin: 56px 0 0 6px; color: #fff;
    text-transform: uppercase; white-space: nowrap; font-family: 'Avenir Next Condensed';
    font-weight: 800; font-style: italic; font-size: 30px; }
  .credit img { height: 192px; }
  .map { position: absolute; right: 0; top: 0; width: ${mapW}px; height: ${mapH}px; }
  .map img { width: 100%; height: 100%; }
</style></head><body>
  <div class="left">
    <div class="title"><img src="official${path.extname(official)}"></div>
    <div class="series">Map My VOD</div>
    <div class="credit">High-res map made by <img src="credit-logo.png"></div>
  </div>
  <div class="map"><img src="map.png"></div>
</body></html>`;
  fs.writeFileSync(path.join(tmp, 'thumb.html'), html);
  const out = path.join(OUT_DIR, `${base}_thumbnail.png`);
  await render({ url: 'file://' + path.join(tmp, 'thumb.html'), w: 1280, h: 720, screenshot: out });
  console.log(`thumbnail: vod_review/youtube/${base}_thumbnail.png (${counts.pois} POIs, ${counts.children} secondary icons)`);
}

async function video() {
  const w = Math.min(MINIMAP_W, Math.round(MINIMAP_MAX_H * aspect)), h = Math.round(w / aspect);
  const res = await render({ url, w, h, dpr: MINIMAP_DPR, cfg: { ...cfg, captionW: MINIMAP_W }, scripts: [script('setup.js'), script('minimap.js')] });
  const dir = path.join(tmp, 'mini');
  fs.mkdirSync(dir);
  const idx = {};
  Object.entries(res.images).forEach(([id, v], i) => {
    idx[id] = String(i).padStart(3, '0');
    for (const k of ['off', 'on']) fs.writeFileSync(path.join(dir, `${idx[id]}_${k}.png`), Buffer.from(v[k].split(',')[1], 'base64'));
  });
  const first = Object.values(idx)[0];
  if (!first) throw new Error(`no timestamps of ${vodFile} are linked to icons on ${vod.map}`);
  const size = imageSize(path.join(dir, `${first}_on.png`));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black@0.0:s=${size.w}x${size.h},format=rgba`,
    '-frames:v', '1', path.join(dir, 'blank.png')]);

  const events = vod.timestamps
    .filter((t) => idx[t.id])
    .map((t) => ({ t: t.t, n: idx[t.id] }))
    .sort((a, b) => a.t - b.t);
  fs.writeFileSync(path.join(dir, 'timeline.ffconcat'), timeline(events, vod.duration));

  const src = path.join(ROOT, 'vod_review', vodFile);
  const out = path.join(OUT_DIR, `${base}_map-my-vod.mp4`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'timeline.ffconcat'),
    '-filter_complex', `[1:v]fps=30,format=rgba[ov];[0:v][ov]overlay=x=W-w-${MARGIN}:y=H-h-${MARGIN}:eof_action=pass:format=auto[v]`,
    '-map', '[v]', '-map', '0:a', '-c:v', 'h264_videotoolbox', '-b:v', '6M', '-c:a', 'copy', '-movflags', '+faststart', out], { stdio: 'inherit' });
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).trim();
  const skipped = vod.timestamps.length - events.length;
  console.log(`video: vod_review/youtube/${base}_map-my-vod.mp4 (${Math.round(dur)}s, ${events.length} minimap events, ${skipped} timestamps without an icon)`);
}

// ffconcat list of minimap frames: blank between events; at each event the
// icon flashes (on/off every BLINK s) for FLASH s, then stays on for HOLD s.
function timeline(events, duration) {
  const cues = [{ at: 0, file: 'blank.png' }];
  events.forEach((e, i) => {
    const end = Math.min(e.t + FLASH + HOLD, events[i + 1]?.t ?? Infinity);
    for (let s = e.t, on = true; s < Math.min(e.t + FLASH, end); s += BLINK, on = !on) {
      cues.push({ at: s, file: `${e.n}_${on ? 'on' : 'off'}.png` });
    }
    if (e.t + FLASH < end) cues.push({ at: e.t + FLASH, file: `${e.n}_on.png` });
    cues.push({ at: end, file: 'blank.png' });
  });
  // Cues at the same time (an event cut short by the next one): keep the last.
  const merged = [];
  for (const c of cues) {
    if (merged.length && Math.abs(merged.at(-1).at - c.at) < 1e-6) merged[merged.length - 1] = c;
    else merged.push(c);
  }
  let out = 'ffconcat version 1.0\n';
  merged.forEach((c, i) => {
    const next = merged[i + 1]?.at ?? duration + 5;
    out += `file ${c.file}\nduration ${(next - c.at).toFixed(3)}\n`;
  });
  return out + `file ${merged.at(-1).file}\n`;
}
