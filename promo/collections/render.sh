#!/bin/bash
# The collections promo, rebuilt in its work folder ($PROMO_WORK/collections). Copy option 1 ships ("New on Grabient"
# over "Collect the palettes you love"), in both themes, into out/:
#   tweet-1.mp4 and tweet-1-light.mp4 (1280x720, 30 fps, H.264, BT.709), email-1.gif and email-1-light.gif (534 px wide,
#   15 fps, looping forever), end-1.png and end-1-light.png (the end card, the loop's first frame), loop-sheet.png and
#   seam.txt (how each file comes round its loop).
#
#   ./render.sh                  from the frames already drawn (frames/: the page's captures and the water runs)
#   ./render.sh --frames         draws them first: the page captured in both themes, the timeline planned from the
#                                dark capture, and the water and wordmark drawn on it, tweet and newsletter
#   ./render.sh --all-options    renders every copy option (copy.ts), not only option 1
#
# --frames needs the site served for the captures (../kit/serve-site.sh, README.md). A capture takes 10 to 40 minutes a
# theme and a water run about 50 at 2x, depending on what else the machine runs; the two themes go side by side.
# render-hd.sh makes the 1920x1080 tweets from the same plan.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
source "$HERE/../env.sh"
KIT=$PROMO/kit
export WORK=${WORK:-$PROMO_WORK/collections}
FRAMES=$WORK/frames
DATA=$WORK/data
BUILD=$WORK/build
OUT=$WORK/out
LOGS=$WORK/logs
TIMELINE=$DATA/timeline.json
FFMPEG=$COMPOSITOR/ffmpeg
DRAW=0
ALL=0
for a in "$@"; do
  case $a in
    --frames) DRAW=1 ;;
    --all-options) ALL=1 ;;
    *) echo "unknown option $a" >&2 && exit 1 ;;
  esac
done
mkdir -p "$FRAMES" "$DATA" "$BUILD/stills" "$OUT" "$LOGS"
RUNS="water-dark water-light water-dark-email water-light-email"

if [ $DRAW = 1 ]; then
  # the page: the real site, transparent, both themes side by side
  (cd "$HERE/capture" && node capture.mjs --theme dark --out "$FRAMES/ui-dark" > "$LOGS/capture-dark.log" 2>&1) &
  (cd "$HERE/capture" && node capture.mjs --theme light --out "$FRAMES/ui-light" > "$LOGS/capture-light.log" 2>&1) &
  wait
  node "$HERE/timeline.mjs" "$FRAMES/ui-dark/frames.json" > "$TIMELINE"
  # the water and the wordmark: the site's own modules in the harness, a frame at a time, on the tweet's loop and on
  # the newsletter's, two runs at a time
  "$KIT/build-harness.sh"
  python3 -m http.server 25361 --bind 127.0.0.1 --directory "$KIT/harness/dist" > "$LOGS/harness-server.log" 2>&1 &
  SERVER=$!
  trap 'kill $SERVER 2>/dev/null || true' EXIT
  for theme in dark light; do
    pids=()
    for variant in tweet email; do
      run=water-$theme$([ $variant = email ] && echo -email || true)
      (cd "$KIT/harness" && node render.mjs --theme $theme --variant $variant --timeline "$TIMELINE" \
        --page "$HERE/data/page.json" --out "$FRAMES/$run" > "$LOGS/$run.log" 2>&1) &
      pids+=($!)
    done
    wait "${pids[@]}"
  done
  kill $SERVER
  trap - EXIT
fi

# for each water run: the seam's dissolve, blended once
for run in $RUNS; do
  python3 "$KIT/tools/dissolve.py" "$FRAMES/$run"
done
cd "$HERE/remotion"
./sync-data.sh "$FRAMES" "$TIMELINE"
sequence() { rm -rf "$2" && "$REMOTION" render "$1" "$2" --props="$3" --sequence --image-format=png --browser-executable="$HEADLESS_SHELL" --concurrency=6 --log=error; }
still() { "$REMOTION" still "$@" --frame=0 --browser-executable="$HEADLESS_SHELL" --log=error; }

# The tweet: H.264 from the lossless frames, BT.709 as Remotion tags it (the matrix, primaries and transfer, limited
# range). The water's grain changes a little every frame, which x264 lets drift through its predicted frames until a
# keyframe snaps it back: tuned for grain, the predicted frames keep it (and the words' and the wordmark's edges hold
# still), the end card's hold is coded at one high quality from a few frames into the zoom out to a few frames before
# the zoom in ends, so its edges sit where the picture moves, and no keyframe falls inside the hold
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
# The newsletter's GIF: 534 pixels wide from frames drawn at twice that, every third frame (10 fps), its own shorter
# loop (timeline.mjs, EMAIL), starting on the end card as the tweet does. The stretch from the zoom in's fastest frame
# round the loop's seam to the zoom out's fastest frame is one gifski run with one palette, so the GIF comes round inside
# the encoder too and its first frame is written whole and exact (kit/tools/gifloop.py; the frames from the timeline's
# email.gif). gifski holds a pixel while its change is small, which saves bytes but leaves faint ghosts where something
# fades out over the dark list; motion quality 95 keeps them too faint to see at this size. Quality 70, its lossy
# compression at 50, brings each theme's loop to about 2 MB, which a reader's mail app loads in two thirds of the time
# the 3.3 MB of 15 fps at quality 80 took; quality 60 or lossy 40 bands the dark gradients
read -r FIRST START STOP < <(python3 -c "
import json; g = json.load(open('$TIMELINE'))['email']['gif']
# the timeline counts the loop's frames at 15 fps, every other one
print(*(round(g[k] * 2 / 3) for k in ('first', 'start', 'stop')))")
every_third() { ls "$1"/element-*.png | sort | awk 'NR % 3 == 1'; }
gif() {
  python3 "$KIT/tools/gifloop.py" "$2" "$GIFSKI" 10 534 "${GIF_QUALITY:-70}" "${GIF_MOTION:-95}" "${GIF_LOSSY:-50}" \
    "$FIRST" "$START" "$STOP" $(every_third "$1")
}

options=1
[ $ALL = 1 ] && options="1 2 3 4 5 6"
for n in $options; do
  props="{\"option\":$n}"
  sequence Tweet "$BUILD/tweet-$n" "$props"
  mp4 "$BUILD/tweet-$n" "$OUT/tweet-$n.mp4"
  sequence Email "$BUILD/email-$n" "$props"
  gif "$BUILD/email-$n" "$OUT/email-$n.gif"
  still Tweet "$OUT/end-$n.png" --props="$props"
  cp "$OUT/end-$n.png" "$BUILD/stills/end-$n-dark.png"
  still TweetLight "$BUILD/stills/end-$n-light.png" --props="$props"
  [ $n = 1 ] || rm -rf "$BUILD/tweet-$n" "$BUILD/email-$n"
done
sequence TweetLight "$BUILD/tweet-1-light" '{"option":1}'
mp4 "$BUILD/tweet-1-light" "$OUT/tweet-1-light.mp4"
sequence EmailLight "$BUILD/email-1-light" '{"option":1}'
gif "$BUILD/email-1-light" "$OUT/email-1-light.gif"
cp "$BUILD/stills/end-1-light.png" "$OUT/end-1-light.png"

# the checks and sheets
seam() { LD_LIBRARY_PATH=$COMPOSITOR python3 "$KIT/tools/seam.py" "$@"; }
{
  echo "The seam of the loop: the step from the loop's last frame back to its first against every step between two frames"
  echo "of the end card's hold, by kit/tools/seam.py, on the frames Remotion rendered (lossless) and on the delivered files"
  echo "as a viewer's player decodes them (the MP4s through ffmpeg as BT.709, the GIFs through Pillow). Each step is the"
  echo "mean absolute change of all pixels and channels (0 to 255), the share of pixels that change by 6 levels or more and"
  echo "by 10 or more in any channel, and the largest change. The hold is every frame on which the words stand whole: from"
  echo "the zoom in's end to the loop's end and from frame 0 to the zoom out."
  echo
  echo "How each part comes round. The water's last 30 frames dissolve into the frames its run drew just before frame 0,"
  echo "on the same schedule (the tweet's run on the loop, the newsletter's on its own shorter loop), blended once by"
  echo "kit/tools/dissolve.py, so the last frame leads into the first as any frame leads into the next."
  echo
  echo "The tweet's MP4 opens on a keyframe, as any H.264 file must, and x264 lets the water's fine grain drift through the"
  echo "frames it predicts, so a keyframe that follows them shows the grain afresh. Tuned for grain, the predicted frames"
  echo "keep it, the words' and the wordmark's edges hold still, and the whole hold is coded at one high quality (its"
  echo "edges a few frames into each zoom, where the picture moves); no other keyframe falls in the hold, since one there"
  echo "pulses where the source barely moves. The source's own step at the seam is a step of the water's grain, at the top"
  echo "of the hold's range, and the keyframe's fresh grain adds a little to it: on the decoded file its mean change sits"
  echo "just above the hold's largest step, while on the other measures it falls inside."
  echo
  echo "The GIF's stretch from the zoom in's fastest frame round the seam to the zoom out's fastest is one encoder run"
  echo "with one palette, so its last frame leads into its first inside the encoder as any frame leads into the next, and"
  echo "its first frame, the end card, is written whole with its exact colors (kit/tools/gifloop.py). gifski holds a pixel"
  echo "while its change is small, so the GIF's own steps are smaller than the frames' they come from."
  echo
  seam frames "$BUILD/tweet-1" "$TIMELINE" 1
  seam mp4 "$OUT/tweet-1.mp4" "$TIMELINE" "$FFMPEG"
  seam mp4 "$OUT/tweet-1-light.mp4" "$TIMELINE" "$FFMPEG"
  seam frames "$BUILD/email-1" "$TIMELINE" 3 email
  seam gif "$OUT/email-1.gif" "$TIMELINE" "$FIRST" 3
  seam gif "$OUT/email-1-light.gif" "$TIMELINE" "$FIRST" 3
} > "$OUT/seam.txt"
python3 "$KIT/tools/sheets.py" loop "$BUILD/tweet-1" "$TIMELINE" "$OUT/loop-sheet.png"
if [ $ALL = 1 ]; then python3 "$KIT/tools/sheets.py" options "$BUILD/stills" "$OUT/options.png"; fi
ls -la "$OUT"
