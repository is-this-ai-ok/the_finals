---
name: edit-match-recordings
description: Find new THE FINALS screen recordings in screen_recording/ and cut them down to match-only videos in vod_review/ (keep loadout screen + all-team scoreboard + gameplay; drop menus, intros, and end-of-match summary). Use when the user says they have new recordings, asks to edit/trim/cut recordings, or invokes /edit-match-recordings.
---

# Edit match recordings

Turn raw OBS recordings into match-only videos for VOD review. Run all commands
from the repo root. Scripts live in `.claude/skills/edit-match-recordings/scripts/`.

## What to keep and cut

**Keep**, in order:
1. **Loadout screen**: blue screen with the big countdown (`0:25` → `0:00`),
   "KNOCKOUT ROUND N" top-left, our three players and loadout cards along the bottom.
   Keep the whole countdown, including moments where the user toggles team loadouts
   or opens the scoreboard over it.
2. **All-team scoreboard**: the TAB scoreboard listing every team's players with
   class letters (L/M/H). This is the only place other teams' compositions show up.
   The user often holds TAB during the team introductions, or over the red bracket
   screen just before the loadout. Keep those stretches even though intros
   are faintly visible behind them. If it was never opened, say so in the report.
3. **Gameplay**: from the first in-game HUD frame (usually spawning in near a
   "VAULT" marker) to the **"KNOCKED OUT" / "QUALIFIED" / win banner**, inclusive.
   Keep everything in between (deaths, respawn timers, instant replays).

**Cut**:
- Anything before the loadout: desktop, OBS, main menu / customization, queue
  ("waiting for other contestants"), map info card, red tournament bracket.
  The desktop can show personal photos, so never keep it.
- Contestant introduction: red logo flash → big map name splash ("MONACO") →
  "READY" → tunnel/boots walk-in → each team posing with its name ("THE RETROS")
  → our team walking out → brief black. Exception: scoreboard overlays (above).
- End of match: red logo flash → SUMMARY (best combat/objective/support cards,
  team performance, qualified/knocked-out table) → bracket → DEFEATED/stats
  screens → OBS/desktop.

**Multi-round recordings** (tournament knockout round 1 → round 2 → final):
produce **one output file per recording**. Each round gets its own loadout +
scoreboard + gameplay. Cut the between-round summary, bracket, and intros.

## Steps

1. **Find new recordings**
   ```bash
   bash .claude/skills/edit-match-recordings/scripts/find_new.sh
   ```
   This lists sources not yet in `vod_review/edits.tsv`. If the user named
   specific files, use those. If the list includes old ones they never mentioned
   (e.g. the 2026-11-05 `.mov` files, 2064x864, not edited as of 2026-11-12),
   ask before processing them.

2. **Overview sheets** (one frame every 5 s, 150 s per sheet; can run in parallel for several files):
   ```bash
   bash .claude/skills/edit-match-recordings/scripts/sheets.sh overview "screen_recording/<file>" /tmp/finals_sheets/<tag>
   ```
   Read every sheet. Cell time = `(sheet-1)*150 + (row*6 + col)*5` s. Note rough
   times for: loadout start/end, scoreboard-over-intro, gameplay start, banner,
   and any second round. Also look out for alt-tabs to the desktop mid-match, and
   cut those as well.

3. **Pin exact boundaries** with 1 fps sheets (40 s each, starting a few seconds
   before each rough transition):
   ```bash
   bash .claude/skills/edit-match-recordings/scripts/sheets.sh dense "screen_recording/<file>" /tmp/finals_sheets/<tag> <start_sec>
   ```
   Cell time = `start + row*8 + col`. To read small text (e.g. whether a scoreboard
   shows all teams), grab one full frame:
   `ffmpeg -v error -y -ss <t> -i <file> -frames:v 1 /tmp/finals_sheets/f.png`.
   Typical boundaries: loadout ends right before the red logo flash; gameplay
   starts the second after the black frame following the walk-out; end ~1–2 s
   into the KNOCKED OUT/QUALIFIED banner, before the red logo flash.

4. **Name outputs** `YYYY-MM-DD_N_Map-Name.mp4`. Use the recording date. `N`
   continues the count from existing `vod_review/` files for that date, in
   recording-time order. The map name is in hyphenated title case, from the
   loadout screen's top-right or the map splash (e.g. `Las-Vegas-Stadium`).

5. **Show the plan, then cut.** Show the user a table of output names and kept
   segments (as m:ss) first. Then run one cut per file. The cuts can run in
   parallel, in the background, because they take a few minutes:
   ```bash
   bash .claude/skills/edit-match-recordings/scripts/cut.sh "<source file name>" "<output name>" 12:33 46:54 58:648
   ```
   Segments are `start:end` in source seconds. The script re-encodes with
   VideoToolbox (~6 Mbps) for frame-accurate cuts and appends the row to
   `vod_review/edits.tsv`.

6. **Verify.** Output duration should equal the sum of the segments (the script
   prints it). Render a dense sheet from each output across the joins to confirm
   there are no leftover intro/summary frames. Then report per file: length,
   size, what was kept, and anything missing (e.g. no all-team scoreboard).

Never modify or delete the source recordings. Video files are gitignored.
`edits.tsv` is tracked, so it can be committed if the user asks.
