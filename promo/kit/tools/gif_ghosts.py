# Where a GIF strays from every nearby source frame: for each GIF frame, the source frame (within +-3) it matches best,
# and how far it still is from it in a region. Ghosts of things that have left stay far from all of them.
#   python3 tools/gif_ghosts.py <a.gif> <rendered frames dir> <x0,y0,x1,y1 in GIF pixels> <from s,to s>
import sys
import numpy as np
from PIL import Image
gif_path, src = sys.argv[1], sys.argv[2]
x0, y0, x1, y1 = (int(v) for v in sys.argv[3].split(","))
s0, s1 = (float(v) for v in sys.argv[4].split(","))
gif = Image.open(gif_path)
W, H = gif.size
cache = {}
def source(k):
    if k not in cache:
        cache[k] = np.asarray(Image.open(f"{src}/element-{k:03d}.png").convert("RGB").resize((W, H), Image.LANCZOS), dtype=np.int16)[y0:y1, x0:x1]
    return cache[k]
t = 0.0
n = 0
rows = []
while True:
    dur = gif.info.get("duration", 66)
    if s0 <= t / 1000 <= s1:
        g = np.asarray(gif.convert("RGB"), dtype=np.int16)[y0:y1, x0:x1]
        k0 = int(round(t / 1000 * 30))
        best = None
        for k in range(max(0, k0 - 3), min(403, k0 + 3) + 1):
            d = np.abs(g - source(k)).max(axis=2)
            score = d.mean()
            if best is None or score < best[0]:
                best = (score, k, d)
        score, k, d = best
        # a ghost is a patch that is off: the 99.9th percentile of the difference after a 3x3 box average
        pad = np.pad(d.astype(np.float32), 1, mode="edge")
        box = sum(pad[i:i + d.shape[0], j:j + d.shape[1]] for i in range(3) for j in range(3)) / 9
        rows.append((float(np.percentile(box, 99.9)), t / 1000, k))
    t += dur
    n += 1
    try:
        gif.seek(n)
    except EOFError:
        break
rows.sort(reverse=True)
print(f"{gif_path}: worst frames (patch error, time, best source frame):")
for e, sec, k in rows[:5]:
    print(f"  {e:5.1f} at {sec:5.2f}s ~ source {k}")
print(f"  median {np.median([r[0] for r in rows]):.1f}")
