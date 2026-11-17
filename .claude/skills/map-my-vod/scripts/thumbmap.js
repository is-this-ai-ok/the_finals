// Runs inside the read-only map app after setup.js. Draws every POI with all of
// its secondary icons and tethers (the app normally shows a POI's secondary
// icons only while it's selected). The page screenshot is the thumbnail map.
(async () => {
  await mmvSetup();
  window.drawPois = function (g) {
    const r = settings().iconSize / 2;
    const cr = r * CHILD_SCALE;
    const pois = visiblePois();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = CHILD_COLOR;
    ctx.beginPath();
    for (const p of pois) {
      const sp = poiScreenPos(g, p);
      for (const c of children(p)) {
        const sc = poiScreenPos(g, c);
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(sc.x, sc.y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of pois) drawIcon(p, poiScreenPos(g, p), r, 'rgba(255,255,255,0.85)', 2);
    for (const p of pois) for (const c of children(p)) drawIcon(c, poiScreenPos(g, c), cr, CHILD_COLOR, 2);
  };
  draw();
  const pois = mapData().pois;
  return { pois: pois.length, children: pois.reduce((n, p) => n + children(p).length, 0) };
})()
