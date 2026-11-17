// Runs inside the read-only map app after setup.js. For every timestamp of
// CFG.vod linked to an icon on CFG.map, returns two captioned minimap PNGs (data
// URLs, keyed by timestamp id): `off` with the icon drawn normally and `on` with
// it highlighted. A secondary icon's parent POI is highlighted with it. Output
// size is the viewport times the device pixel ratio, plus the caption area.
(async () => {
  const HILITE = '#f5c518';
  const { W, H } = await mmvSetup();

  let target = null; // { poi, child }
  let hot = false;
  window.drawPois = function (g) {
    const r = settings().iconSize / 2;
    const cr = r * CHILD_SCALE;
    const { poi, child } = target;
    // Context: every other POI, dimmed.
    ctx.globalAlpha = 0.55;
    for (const p of visiblePois()) {
      if (p !== poi) drawIcon(p, poiScreenPos(g, p), r, 'rgba(255,255,255,0.7)', 1.5);
    }
    ctx.globalAlpha = 1;

    // Normal or highlighted (flashing) look of a target icon.
    const mark = (item, base, normalRing) => {
      const s = poiScreenPos(g, item);
      if (hot) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, base * 1.6 + 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(245,197,24,0.28)';
        ctx.fill();
        drawIcon(item, s, base * 1.6, HILITE, 4);
      } else {
        drawIcon(item, s, base * 1.25, normalRing, 2.5);
      }
    };

    // The primary icon flashes too; a secondary icon is drawn last so it stays on top.
    if (child) {
      const sp = poiScreenPos(g, poi);
      const sc = poiScreenPos(g, child);
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = CHILD_COLOR;
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(sc.x, sc.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    mark(poi, r, '#ffffff');
    if (child) mark(child, cr, CHILD_COLOR);
  };

  const dpr = window.devicePixelRatio || 1;
  const FONT_PX = Math.round(24 * dpr), LINE = Math.round(FONT_PX * 1.12), PAD = Math.round(10 * dpr);
  const GAP = Math.round(6 * dpr), MAX_LINES = 5;
  const CAP_H = MAX_LINES * LINE + PAD * 2 + GAP; // caption area reserved above the map
  const font = `italic 800 ${FONT_PX}px "Avenir Next Condensed"`;

  function wrap(g, text, maxW) {
    const lines = [];
    let line = '';
    for (const word of text.toUpperCase().split(/\s+/)) {
      const next = line ? line + ' ' + word : word;
      if (line && g.measureText(next).width > maxW) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    if (lines.length > MAX_LINES) {
      lines.length = MAX_LINES;
      while (g.measureText(lines[MAX_LINES - 1] + '…').width > maxW) lines[MAX_LINES - 1] = lines[MAX_LINES - 1].replace(/\s*\S+$/, '');
      lines[MAX_LINES - 1] += '…';
    }
    return lines;
  }

  // Caption box (bottom-aligned, just above the map) + the map canvas below it.
  // The caption is at least CFG.captionW wide, so narrow (tall) maps keep readable captions.
  function compose(text) {
    const out = document.createElement('canvas');
    out.width = Math.max(canvas.width, Math.round((CFG.captionW || 0) * dpr));
    out.height = canvas.height + CAP_H;
    const g = out.getContext('2d');
    g.font = font;
    const lines = wrap(g, text, out.width - PAD * 2);
    const boxH = lines.length * LINE + PAD * 2;
    const top = CAP_H - GAP - boxH;
    g.fillStyle = 'rgba(17,19,23,0.85)';
    g.fillRect(0, top, out.width, boxH);
    g.fillStyle = '#ffffff';
    g.textBaseline = 'top';
    lines.forEach((l, i) => g.fillText(l, PAD, top + PAD + i * LINE + Math.round(LINE * 0.06)));
    g.drawImage(canvas, out.width - canvas.width, CAP_H); // right-aligned under the caption
    return out.toDataURL('image/png');
  }

  const snap = (text) => {
    draw();
    // Panel border, drawn on top in screen px.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
    return compose(text);
  };

  await document.fonts.load(font);
  const pois = mapData().pois;
  const out = {};
  for (const ts of state.data.vods[CFG.vod].timestamps) {
    const l = ts.link;
    if (!l || l.map !== CFG.map) continue;
    const key = ts.id;
    const poi = pois.find((p) => p.id === l.poi);
    const child = l.child ? children(poi || {}).find((c) => c.id === l.child) : null;
    if (!poi || (l.child && !child)) continue;
    target = { poi, child };
    hot = false; const off = snap(ts.text);
    hot = true; const on = snap(ts.text);
    out[key] = { off, on };
  }
  return { W, H, images: out };
})()
