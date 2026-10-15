#!/bin/bash
# Hands the composition its data: the loop's plan (timeline.json), each theme's UI capture (frames.json, less its
# per-frame records) and each water run (meta.json: the tweet's water-<theme>, the newsletter's water-<theme>-email,
# where it was drawn); the frames themselves are read through public/frames, a link to the frames folder.
#   ./sync-data.sh <frames folder> <timeline.json>          (../render.sh runs it)
# A run that is missing is skipped: the composition keeps what it had for it, and only its own renders need it.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
FRAMES=$(cd "$1" && pwd)
mkdir -p "$HERE/src/data"
cp "$2" "$HERE/src/data/timeline.json"
for theme in dark light; do
  python3 - "$FRAMES/ui-$theme/frames.json" "$HERE/src/data/ui-$theme.json" <<'PY'
import json, os, sys
if os.path.exists(sys.argv[1]):
    d = json.load(open(sys.argv[1]))
    json.dump({k: d[k] for k in ("theme", "count", "marks", "rects", "painted", "events")}, open(sys.argv[2], "w"))
PY
  for run in "water-$theme" "water-$theme-email"; do
    python3 - "$FRAMES/$run" "$HERE/src/data/$run.json" <<'PY'
import json, os, sys
meta = f"{sys.argv[1]}/meta.json"
if os.path.exists(meta):
    d = json.load(open(meta))
    frames = [{"k": f["k"], "clip": f["clip"]} for f in d["frames"]]
    json.dump({"theme": d["theme"], "fade": d["fade"], "frames": frames}, open(sys.argv[2], "w"))
PY
  done
done
ln -sfn "$FRAMES" "$HERE/public/frames"
echo "data synced from $FRAMES: $(ls "$HERE/src/data" | tr '\n' ' ')"
