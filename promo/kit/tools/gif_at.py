# The frame a GIF shows at given times (ms), stacked: python3 tools/gif_at.py <out.png> <a.gif> <ms> [<ms> ...]
import sys
from PIL import Image
out, path = sys.argv[1], sys.argv[2]
times = [float(t) for t in sys.argv[3:]]
gif = Image.open(path)
starts = []
total = 0
n = 0
while True:
    starts.append(total)
    total += gif.info.get("duration", 66)
    n += 1
    try:
        gif.seek(n)
    except EOFError:
        break
tiles = []
for ms in times:
    k = max(i for i, s in enumerate(starts) if s <= ms)
    gif.seek(k)
    tiles.append(gif.convert("RGB"))
W = tiles[0].width
sheet = Image.new("RGB", (W, sum(t.height + 4 for t in tiles)), (60, 60, 60))
y = 0
for t in tiles:
    sheet.paste(t, (0, y))
    y += t.height + 4
sheet.save(out)
print(out, len(starts), "frames", f"{total / 1000:.2f}s")
