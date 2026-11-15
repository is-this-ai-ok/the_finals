#!/bin/bash
# List recordings in screen_recording/ that have no entry in vod_review/edits.tsv,
# with duration and resolution. Run from the repo root.
set -euo pipefail
manifest=vod_review/edits.tsv
[ -f "$manifest" ] || printf 'source\toutput\tsegments\n' > "$manifest"

shopt -s nullglob nocaseglob
for f in screen_recording/*.{mp4,mov,mkv}; do
  name=$(basename "$f")
  cut -f1 "$manifest" | grep -qxF "$name" && continue
  info=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height:format=duration \
    -of default=nw=1:nk=1 "$f" | paste -sd' ' -)
  read -r w h dur <<<"$info"
  printf '%s\t%dx%d\t%ds\n' "$name" "$w" "$h" "${dur%.*}"
done
