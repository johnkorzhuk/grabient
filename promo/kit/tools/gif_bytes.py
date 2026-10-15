# How a GIF's bytes fall across its frames: each frame's compressed image data and its area.
#   python3 tools/gif_bytes.py <a.gif> [bucket size in frames]
import sys

data = open(sys.argv[1], "rb").read()
bucket = int(sys.argv[2]) if len(sys.argv) > 2 else 20
i = 13
flags = data[10]
if flags & 0x80:
    i += 3 * (2 ** ((flags & 7) + 1))
frames = []
while i < len(data):
    b = data[i]
    if b == 0x21:  # extension
        i += 2
        while data[i]:
            i += data[i] + 1
        i += 1
    elif b == 0x2C:  # image
        x, y, w, h = (int.from_bytes(data[i + k : i + k + 2], "little") for k in (1, 3, 5, 7))
        lf = data[i + 9]
        i += 10
        if lf & 0x80:
            i += 3 * (2 ** ((lf & 7) + 1))
        i += 1  # LZW min code size
        n = 0
        while data[i]:
            n += data[i]
            i += data[i] + 1
        i += 1
        frames.append((n, w * h))
    elif b == 0x3B:
        break
    else:
        raise SystemExit(f"unexpected byte {b:#x} at {i}")
total = sum(n for n, _ in frames)
print(f"{len(frames)} frames, {total / 1e6:.2f} MB of image data")
for s in range(0, len(frames), bucket):
    chunk = frames[s : s + bucket]
    print(f"frames {s:3d}-{s + len(chunk) - 1:3d}: {sum(n for n, _ in chunk) / 1e3:7.0f} kB, mean area {sum(a for _, a in chunk) / len(chunk) / 1e3:6.1f} kpx")
