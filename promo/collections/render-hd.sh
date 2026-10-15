#!/bin/bash
# The collections promo's tweet at 1920x1080 in both themes, from the same plan as render.sh's 1280x720 files, into
# out/tweet-1-1080p.mp4 and out/tweet-1-light-1080p.mp4. A 720p frame already uses the page's 2x capture at its full
# sharpness in the closest shot, so 1080p needs its own sources, in frames-hd/:
#   the page captured at 3x, and the wordmark drawn at 3x (its letters and bar alone: --marks-only);
#   the water of the 2x runs in frames/, which the site never draws finer (its canvas caps the device ratio at 2).
# Remotion renders the same composition at scale 1.5, and x264 codes it as render.sh does. The composition is handed
# back the 2x data at the end, so render.sh's files render as before.
#
#   ./render-hd.sh               from the 3x sources already drawn
#   ./render-hd.sh --frames      draws them first (the site served as for render.sh --frames: ../kit/serve-site.sh)
#
# The 3x captures must be the 2x ones' frames, which the timeline was planned from: the script stops where their count,
# marks, events or layout differ.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
source "$HERE/../env.sh"
KIT=$PROMO/kit
export WORK=${WORK:-$PROMO_WORK/collections}
FRAMES=$WORK/frames
HD=$WORK/frames-hd
BUILD=$WORK/build
OUT=$WORK/out
LOGS=$WORK/logs
TIMELINE=$WORK/data/timeline.json
FFMPEG=$COMPOSITOR/ffmpeg
mkdir -p "$HD" "$OUT" "$LOGS"

if [ "${1:-}" = "--frames" ]; then
  (cd "$HERE/capture" && node capture.mjs --theme dark --dsf 3 --out "$HD/ui-dark" > "$LOGS/capture-hd-dark.log" 2>&1) &
  (cd "$HERE/capture" && node capture.mjs --theme light --dsf 3 --out "$HD/ui-light" > "$LOGS/capture-hd-light.log" 2>&1) &
  "$KIT/build-harness.sh"
  python3 -m http.server 25361 --bind 127.0.0.1 --directory "$KIT/harness/dist" > "$LOGS/harness-server.log" 2>&1 &
  SERVER=$!
  trap 'kill $SERVER 2>/dev/null || true' EXIT
  for theme in dark light; do
    (cd "$KIT/harness" && node render.mjs --theme $theme --variant tweet --dsf 3 --marks-only --timeline "$TIMELINE" \
      --page "$HERE/data/page.json" --out "$HD/marks-$theme" > "$LOGS/marks-hd-$theme.log" 2>&1) &
  done
  wait $(jobs -p | grep -v "^$SERVER$")
  kill $SERVER
  trap - EXIT
fi

for theme in dark light; do
  python3 - "$FRAMES/ui-$theme/frames.json" "$HD/ui-$theme/frames.json" <<'PY'
import json, sys
a, b = (json.load(open(p)) for p in sys.argv[1:])
for key in ("count", "marks", "events", "painted"):
    assert a[key] == b[key], f"the 3x capture's {key} differ from the 2x capture's"
assert a["rects"].keys() == b["rects"].keys(), "the 3x capture measured other things"
off = max(abs(a["rects"][n][c] - b["rects"][n][c]) for n in a["rects"] for c in a["rects"][n])
assert off <= 1, f"the 3x capture's layout is {off} CSS px off the 2x capture's"
print(sys.argv[2], "matches the 2x capture:", a["count"], "frames, layout within", off, "CSS px")
PY
done

# each theme's water run for the large frames: the 2x run's water and the 3x run's wordmark, its seam dissolved
for theme in dark light; do
  python3 - "$FRAMES/water-$theme/meta.json" "$HD/marks-$theme/meta.json" <<'PY'
import json, sys
a, b = (json.load(open(p)) for p in sys.argv[1:])
assert (a["length"], a["fade"], a["start"]) == (b["length"], b["fade"], b["start"]), "the runs are of different loops"
assert [f["k"] for f in a["frames"]] == [f["k"] for f in b["frames"]], "the runs keep different frames"
assert [f["clip"] for f in a["frames"]] == [f["clip"] for f in b["frames"]], "the wordmark stands elsewhere"
PY
  W=$HD/water-$theme
  rm -rf "$W" && mkdir -p "$W"
  # hard links: Remotion's server follows no link out of its public folder
  find "$FRAMES/water-$theme" -maxdepth 1 -name 'w*.png' -exec ln {} "$W/" \;
  find "$HD/marks-$theme" -maxdepth 1 -name 'm*.png' -exec ln {} "$W/" \;
  cp "$HD/marks-$theme/meta.json" "$W/meta.json"
  python3 "$KIT/tools/dissolve.py" "$W"
done

cd "$HERE/remotion"
./sync-data.sh "$HD" "$TIMELINE"
trap './sync-data.sh "$FRAMES" "$TIMELINE" > /dev/null' EXIT

sequence() { rm -rf "$2" && "$REMOTION" render "$1" "$2" --props="$3" --sequence --image-format=png --scale=1.5 --browser-executable="$HEADLESS_SHELL" --concurrency=6 --log=error; }
read -r ZONE_OUT ZONE_IN LAST < <(python3 -c "
import json; t = json.load(open('$TIMELINE')); p = t['parts']
print(p['pull'][0] + 8, p['morph'][1] - 11, t['length'] - 1)")
X264="keyint=infinite:zones=0,$ZONE_OUT,q=13/$ZONE_IN,$LAST,q=13"
mp4() {
  LD_LIBRARY_PATH=$COMPOSITOR "$FFMPEG" -v error -y -framerate 30 -i "$1/element-%03d.png" \
    -vf "zscale=matrix=709:range=limited:primariesin=709:primaries=709:transferin=709:transfer=709,format=yuv420p" \
    -c:v libx264 -preset slow -crf 18 -tune grain -x264-params "$X264" -colorspace:v bt709 -color_primaries:v bt709 \
    -color_trc:v bt709 -color_range tv -movflags +faststart -an "$2"
}
sequence Tweet "$BUILD/tweet-1-hd" '{"option":1}'
mp4 "$BUILD/tweet-1-hd" "$OUT/tweet-1-1080p.mp4"
sequence TweetLight "$BUILD/tweet-1-light-hd" '{"option":1}'
mp4 "$BUILD/tweet-1-light-hd" "$OUT/tweet-1-light-1080p.mp4"
ls -la "$OUT/tweet-1-1080p.mp4" "$OUT/tweet-1-light-1080p.mp4"
