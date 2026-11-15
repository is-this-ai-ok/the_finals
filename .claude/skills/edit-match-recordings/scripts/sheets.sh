#!/bin/bash
# Contact sheets for scanning a recording.
#   sheets.sh overview <video> <outdir>          1 frame / 5s, 6x5 grid => 150s per sheet
#   sheets.sh dense <video> <outdir> <start>     1 frame / 1s, 8x5 grid => 40s from <start>
# Cell timestamp: overview  t = (sheet-1)*150 + (row*6+col)*5
#                 dense     t = start + row*8 + col
set -euo pipefail
mode=$1; src=$2; out=$3
mkdir -p "$out"
case $mode in
  overview)
    # Decoding only keyframes keeps this fast on long recordings.
    ffmpeg -v error -y -skip_frame nokey -i "$src" \
      -vf "fps=1/5,scale=320:180,tile=6x5" -fps_mode vfr "$out/overview_%03d.jpg"
    ls "$out"/overview_*.jpg ;;
  dense)
    start=$4
    ffmpeg -v error -y -ss "$start" -t 40 -i "$src" \
      -vf "fps=1,scale=240:135,tile=8x5" -frames:v 1 "$out/dense_$start.jpg"
    echo "$out/dense_$start.jpg" ;;
  *) echo "unknown mode: $mode" >&2; exit 1 ;;
esac
