# Bytes per GIF frame with its start time and its rectangle: python3 tools/gif_sizes.py <a.gif> [bucket seconds]
import sys
data = open(sys.argv[1], "rb").read()
bucket = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
i = 13
flags = data[10]
if flags & 0x80:
    i += 3 * (2 ** ((flags & 7) + 1))
t = 0
delay = 0
frames = []
while i < len(data):
    b = data[i]
    if b == 0x21:  # extension
        label = data[i + 1]
        j = i + 2
        if label == 0xF9:
            delay = int.from_bytes(data[j + 2:j + 4], "little") * 10
        while data[j] != 0:
            j += data[j] + 1
        i = j + 1
    elif b == 0x2C:  # image
        x, y, w, h = (int.from_bytes(data[i + k:i + k + 2], "little") for k in (1, 3, 5, 7))
        f = data[i + 9]
        j = i + 10
        if f & 0x80:
            j += 3 * (2 ** ((f & 7) + 1))
        j += 1  # LZW min code size
        start = i
        while data[j] != 0:
            j += data[j] + 1
        i = j + 1
        frames.append((t, i - start, (x, y, w, h)))
        t += delay
    elif b == 0x3B:
        break
    else:
        raise SystemExit(f"unexpected byte {b} at {i}")
total = sum(s for _, s, _ in frames)
print(f"{len(frames)} frames, {total / 1e6:.2f} MB, {t / 1000:.2f} s")
buckets = {}
for t0, s, r in frames:
    k = int(t0 / 1000 / bucket)
    buckets[k] = buckets.get(k, 0) + s
for k in sorted(buckets):
    print(f"{k * bucket:5.1f}s {buckets[k] / 1e3:7.1f} KB " + "#" * int(buckets[k] / 1e4))
