#!/bin/bash
# Keep only the given segments of a recording, join them, and record the edit.
#   cut.sh <source in screen_recording/> <output name in vod_review/> start:end [start:end ...]
# Times are in source seconds (decimals ok). Run from the repo root.
set -euo pipefail
src=$1; dst=$2; shift 2
fc=""; inputs=""; i=0
for seg in "$@"; do
  s=${seg%:*}; e=${seg#*:}
  fc+="[0:v]trim=start=$s:end=$e,setpts=PTS-STARTPTS[v$i];"
  fc+="[0:a]atrim=start=$s:end=$e,asetpts=PTS-STARTPTS[a$i];"
  inputs+="[v$i][a$i]"; i=$((i+1))
done
fc+="${inputs}concat=n=$i:v=1:a=1[v][a]"

# Re-encode (not stream copy) so cuts land on exact frames, not keyframes.
ffmpeg -v error -y -i "screen_recording/$src" -filter_complex "$fc" -map "[v]" -map "[a]" \
  -c:v h264_videotoolbox -b:v 6M -c:a aac -b:a 192k -movflags +faststart "vod_review/$dst"

printf '%s\t%s\t%s\n' "$src" "$dst" "$*" >> vod_review/edits.tsv
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "vod_review/$dst")
echo "vod_review/$dst ${dur%.*}s $(du -h "vod_review/$dst" | cut -f1)"
