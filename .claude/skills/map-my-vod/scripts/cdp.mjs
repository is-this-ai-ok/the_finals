// Minimal headless-Chrome driver over the DevTools protocol (no dependencies).
//   const value = await render({ url, w, h, dpr, scripts, cfg, screenshot })
// Opens `url` at a w x h viewport, sets window.CFG = cfg, evaluates each script
// file in order (the last one's result is returned), and optionally saves a PNG.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function render({ url, w, h, dpr = 1, scripts = [], cfg = {}, screenshot }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mmv-chrome-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--hide-scrollbars', '--no-first-run', 'about:blank',
  ], { stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      await sleep(200);
      try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    }
    if (!target) throw new Error('Chrome did not start');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    };
    const send = (method, params = {}) => new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });

    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
    await send('Page.enable');
    await send('Page.navigate', { url });
    await sleep(2500);

    let value;
    const sources = [`window.CFG = ${JSON.stringify(cfg)};`, ...scripts.map((f) => fs.readFileSync(f, 'utf8'))];
    for (const expression of sources) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
      value = r.result?.result?.value;
    }
    if (screenshot) {
      await sleep(1000);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(screenshot, Buffer.from(shot.result.data, 'base64'));
    }
    ws.close();
    return value;
  } finally {
    chrome.kill();
    await sleep(300);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
