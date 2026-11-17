// Runs inside the read-only map app (headless Chrome), before thumbmap.js or
// minimap.js. Opens CFG.map with all UI hidden and points the view at CFG.view.
window.mmvSetup = async () => {
  await selectMap(CFG.map);
  for (let i = 0; i < 100 && !state.img; i++) await new Promise((r) => setTimeout(r, 100));
  if (!state.img) throw new Error('map image did not load: ' + CFG.map);
  for (const sel of ['#sidebar', '#vod-panel']) document.querySelector(sel)?.style.setProperty('display', 'none');
  for (const el of document.querySelectorAll('#stage > *:not(canvas)')) el.style.setProperty('display', 'none');
  state.showGrid = false;
  // Fixed look, independent of the app's display toggles: no zone overlay.
  settings().showZones = false;
  await new Promise((r) => setTimeout(r, 300));

  // CFG.view is a rect in frame px (north-up, origin at the image centre).
  // Without one, show the whole image.
  const g = geometry();
  const v = CFG.view || { x0: -g.gridW / 2, x1: g.gridW / 2, y0: -g.gridH / 2, y1: g.gridH / 2 };
  const W = canvas.clientWidth, H = canvas.clientHeight;
  // 'contain' (default) fits the whole view. 'cover' fills the viewport and clips
  // whichever dimension overflows (top/bottom for tall maps), keeping the centre.
  const zoom = CFG.fit === 'cover'
    ? Math.max(W / (v.x1 - v.x0), H / (v.y1 - v.y0))
    : Math.min(W / (v.x1 - v.x0), H / (v.y1 - v.y0));
  state.view = { zoom, panX: W / 2 - zoom * (v.x0 + v.x1) / 2, panY: H / 2 - zoom * (v.y0 + v.y1) / 2 };
  return { W, H };
};
