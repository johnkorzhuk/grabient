# The seam: the frame-to-frame change from a loop's last frame back to its first, against the change between any two
# frames of the end card's hold, on the frames a viewer sees: the lossless frames Remotion rendered, the decoded tweet
# MP4 (ffmpeg, BT.709) or the decoded GIF (Pillow).
#   python3 tools/seam.py frames <dir with element-NNN.png> <data/timeline.json> <step: 1 for 30 fps, 2 for 15> [email]
#   python3 tools/seam.py mp4 <file.mp4> <data/timeline.json> <ffmpeg>
#   python3 tools/seam.py gif <file.gif> <data/timeline.json> <first: the GIF frame of the loop the GIF starts on>
#     [step: 3 for 10 fps, the newsletter's; 2 for 15]
# Each step is measured as the mean absolute change of all pixels and channels (0 to 255), the share of pixels that
# change by 6 levels or more and by 10 or more in any channel, and the largest change.
import io
import json
import subprocess
import sys

import numpy as np
from PIL import Image

kind, src, tl_path = sys.argv[1], sys.argv[2], sys.argv[3]
tl = json.load(open(tl_path))
p = tl["parts"]


def held(f):
    """the end card's hold: the words whole, from their arrival to the loop's end and from 0 to their going"""
    return f >= p["copyIn"][1] or f < p["copyOut"][0]


def step(a, b):
    d = np.abs(a.astype(np.int16) - b.astype(np.int16))
    px = d.max(axis=2)
    return {"mean": float(d.mean()), "6": float((px >= 6).mean()), "10": float((px >= 10).mean()), "max": int(px.max())}


def frames_of(kind):
    """the frames, in order, and the loop frame each shows"""
    if kind == "frames":
        stride = int(sys.argv[4])
        email = len(sys.argv) > 5 and sys.argv[5] == "email"
        loop_of = tl["email"]["map"] if email else list(range(tl["length"]))
        shown = list(range(0, len(loop_of), stride))
        load = lambda i: np.asarray(Image.open(f"{src}/element-{i:03d}.png").convert("RGB"))  # noqa: E731
        return (load(i) for i in shown), [loop_of[i] for i in shown], f"every {stride} of {len(loop_of)} rendered frames"
    if kind == "mp4":
        # ffmpeg (Remotion's has no raw muxer) hands the frames over as a stream of PNGs, read one at a time
        run = subprocess.Popen(
            [sys.argv[4], "-v", "error", "-i", src, "-vf", "scale=in_color_matrix=bt709:in_range=tv,format=rgb24"]
            + ["-f", "image2pipe", "-c:v", "png", "-compression_level", "1", "-"],
            stdout=subprocess.PIPE,
        )

        def read():
            buf = b""
            end = b"IEND\xaeB`\x82"
            while True:
                chunk = run.stdout.read(1 << 20)
                buf += chunk
                while (k := buf.find(end)) >= 0:
                    yield np.asarray(Image.open(io.BytesIO(buf[: k + len(end)])).convert("RGB"))
                    buf = buf[k + len(end) :]
                if not chunk:
                    return

        return read(), list(range(tl["length"])), "the decoded MP4"
    cut = int(sys.argv[4])
    stride = int(sys.argv[5]) if len(sys.argv) > 5 else 2
    im = Image.open(src)
    loop_of = tl["email"]["map"]
    n = len(loop_of)

    def read():
        for g in range(im.n_frames):
            im.seek(g)
            yield np.asarray(im.convert("RGB"))

    return (
        read(),
        [loop_of[stride * (cut + g) % n] for g in range(-(-n // stride))],
        f"the decoded GIF ({im.n_frames} frames from newsletter frame {stride * cut})",
    )


stream, loops, what = frames_of(kind)
first = prev = None
steps = []
for i, frame in enumerate(stream):
    if first is None:
        first = frame
    else:
        steps.append((i - 1, i, step(prev, frame)))
    prev = frame
last = len(steps)
seam = step(prev, first)
if last + 1 != len(loops):
    raise SystemExit(f"{src}: {last + 1} frames, the loop has {len(loops)}")
hold = [s for a, b, s in steps if held(loops[a]) and held(loops[b])]


def line(rows, key, fmt):
    v = [r[key] for r in rows]
    return f"{fmt.format(min(v))} to {fmt.format(max(v))}, mean {fmt.format(float(np.mean(v)))}"


print(f"{src.rsplit('/', 1)[-1]}: {what}")
print(
    f"  seam, frame {last} to frame 0 (loop {loops[last]} to {loops[0]}): mean |change| {seam['mean']:.3f}, pixels changed "
    f"by 6 or more {100 * seam['6']:.2f}%, by 10 or more {100 * seam['10']:.2f}%, largest {seam['max']}"
)
print(f"  the hold's {len(hold)} steps: mean |change| {line(hold, 'mean', '{:.3f}')}")
print(f"    pixels changed by 6 or more  {line([{'v': 100 * h['6']} for h in hold], 'v', '{:.2f}%')}")
print(f"    pixels changed by 10 or more {line([{'v': 100 * h['10']} for h in hold], 'v', '{:.2f}%')}")
print(f"    largest change               {line(hold, 'max', '{:.0f}')}")
after = steps[0][2]
print(
    f"  the step after the seam, frame 0 to 1: mean |change| {after['mean']:.3f}, by 6 or more {100 * after['6']:.2f}%, "
    f"by 10 or more {100 * after['10']:.2f}%, largest {after['max']}"
)
outside = [k for k in ("mean", "6", "10", "max") if seam[k] > max(h[k] for h in hold)]
names = {"mean": "the mean change", "6": "the pixels changed by 6", "10": "the pixels changed by 10", "max": "the largest"}
print(
    "  the seam's step is inside the hold's range on every measure"
    if not outside
    else f"  the seam's step is inside the hold's range except on {', '.join(names[k] for k in outside)}"
)
