---
name: map-my-vod
description: Make the "Map My VOD" YouTube thumbnail, minimap video and description for a VOD the user has finished reviewing in the map tool (timestamps linked to map icons in app/data/map-data.json). Use when the user says they're done reviewing/marking a VOD, asks for a thumbnail or the minimap/highlight video, or invokes /map-my-vod.
---

# Map My VOD

Run this after the user has finished reviewing a VOD in the map tool: timestamps
recorded and linked to POIs / secondary icons. Run it from the repo root. It
makes three files in `vod_review/youtube/`, kept apart from the original VODs:

- `<name>_thumbnail.png`: a 1280×720 YouTube thumbnail. The official
  "THE FINALS | <MAP>" title, "MAP MY VOD", and a smaller "HIGH-RES MAP MADE BY
  [Ape Squad logo]" credit are stacked and vertically centred on the left. The
  map, with every POI and secondary icon, fills the right half (640×720). It's
  scaled to cover that area and centred on `view`, so the top and bottom of tall
  maps are clipped, and the sides of near-square ones.
- `<name>_map-my-vod.mp4`: the VOD with a minimap in the bottom-right
  corner at each linked timestamp. The minimap shows the timestamp's text in
  a caption box above the map, and the linked icon flashes for 3 s and is held
  for 1 s (4 s total). A secondary icon flashes together with its parent POI and
  is drawn on top of it. A timestamp less than 4 s after the previous one cuts it short.
- `<name>.txt`: the YouTube description. It holds the video title, then
  `high-res map made by https://apesquad.org/maps` and
  `tool used for mapping https://is-this-ai-ok.github.io/the_finals/`, a blank
  line, and the timestamps, built from `map-data.json` in the same format as
  `vod_review/<name>.txt`. Don't add lines to `vod_review/<name>.txt` itself:
  the app server rewrites that file on every save.

Fonts: the title is cropped from the official map image. "MAP MY VOD" and
captions use Avenir Next Condensed Heavy Italic, uppercase, as a stand-in for
the official face.

## Steps

1. **Pick the VOD.** It's the `vod_review/` file name the user reviewed, and the
   key under `vods` in `app/data/map-data.json`, e.g.
   `2026-11-13_1_Las-Vegas-Stadium.mp4`. Confirm that it has timestamps linked
   to icons. If the user is still marking it, wait.

2. **Check the map's layout entry** in `.claude/skills/map-my-vod/maps.json`,
   keyed by the map id (`vods[<file>].map`, e.g. `Las Vegas.webp`):
   - `official`: the official overview image in `maps/official/`.
   - `titleCrop`: `{x, y, w, h}` in that image's pixels, around the
     "THE FINALS | <MAP>" title. The crop's edges are feathered into a panel
     coloured from its top-left pixel, so leave about 30–40 px of margin left and
     right of the text. Keep other artwork out, such as the arena outline under
     the title. View the image to find it, since layouts differ between official images.
   - `view` (optional): `{x0, x1, y0, y1}`, the visible map area in frame px
     (north-up, origin at the image centre, y down). Leave it out at first to
     show the whole image (±gridSize/2). Then render the thumbnail, look at
     it, and tighten the view to cut fog or empty edges. Keep edge spawns inside.

3. **Title and description.** Come up with the title yourself; don't ask the
   user for one. Use the form `Map My VOD: <Map Name> | <role> <what happened> – THE FINALS`,
   for example `Map My VOD: Fortune Stadium | Heavy Tournament Win – THE FINALS`.
   Use the map name from the file name. Take the role and the result from the
   notes: gadget names show the class, and "Final Round Spawn" or a winners
   banner shows how far the run went. Only state a result you can see; if
   unsure, use something like "Tournament Run to the Final". Keep it under 100
   characters, which is YouTube's limit.
   ```bash
   node .claude/skills/map-my-vod/scripts/map-my-vod.mjs "<vod file>" description --title "<title>"
   ```

4. **Thumbnail** (about 15 s), then show it to the user:
   ```bash
   node .claude/skills/map-my-vod/scripts/map-my-vod.mjs "<vod file>" thumbnail
   ```

5. **Video** (about 2 min for a 30-min VOD):
   ```bash
   node .claude/skills/map-my-vod/scripts/map-my-vod.mjs "<vod file>" video
   ```
   Check a few frames, e.g. `ffmpeg -ss <t> -i <out> -frames:v 1 f.png`: one
   frame just before a timestamp, one during the flashing, and one after it
   hides. Also check one secondary-icon timestamp.

6. **Report.** Give the three paths, the title, and the number of minimap events. Name any
   timestamps without an icon, since they get no minimap. Remind the user that
   re-uploading gives a new YouTube ID, so `vods[<file>].youtube` in
   `map-data.json` needs updating for the site's embed. If only the thumbnail
   changed, they can swap it in YouTube Studio without re-uploading.

The script reads `map-data.json` through a temporary read-only build of the app,
so it never writes to it. It needs Google Chrome, ffmpeg, and Node 22+.
Timing, minimap size and margin are constants at the top of
`scripts/map-my-vod.mjs`. Highlight and caption styling are in `scripts/minimap.js`.
