# Frames out of a GIF, side by side, for checking its quality: python3 tools/gif_frames.py <out.png> <scale> <a.gif>:<n>[,<n>...] ...
import sys
from PIL import Image
out, scale = sys.argv[1], float(sys.argv[2])
tiles = []
for spec in sys.argv[3:]:
    path, _, nums = spec.rpartition(":")
    gif = Image.open(path)
    for n in [int(x) for x in nums.split(",")]:
        gif.seek(n)
        fr = gif.convert("RGB")
        if scale != 1:
            fr = fr.resize((int(fr.width * scale), int(fr.height * scale)), Image.NEAREST)
        tiles.append(fr)
W = max(t.width for t in tiles); H = sum(t.height for t in tiles) + 4 * len(tiles)
sheet = Image.new("RGB", (W, H), (60, 60, 60))
y = 0
for t in tiles:
    sheet.paste(t, (0, y)); y += t.height + 4
sheet.save(out)
print(out, sheet.size)
