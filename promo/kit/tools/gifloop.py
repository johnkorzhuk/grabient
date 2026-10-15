# A GIF that loops with no seam through the encoder too. gifski keeps a pixel from the frame before while its change is
# small, which saves most of the bytes, so over a still stretch the picture drifts from a fresh encoding of the same
# frame; a GIF's first frame is always fresh, so a GIF whose loop comes round on a still stretch would redraw every
# pixel's dither there at once. Here the stretch around the loop's seam (from `start`, the zoom in's fastest frame,
# through the end card's hold and the seam, to `stop`, the zoom out's fastest frame) is encoded as one run, so the seam
# lies inside it, with one palette for all of its frames (fitted to them by gifski's own quantizer on a sheet of them),
# so that any picture the run shows has at most that palette's colors. The rest is a second run. The GIF starts on
# `first`, a frame of the first run (the loop's frame 0, the end card), written whole with the palette's colors; each
# run begins whole on a zoom's fastest frame, where every pixel changes anyway, and every other frame is gifski's own.
#   python3 tools/gifloop.py <out.gif> <gifski> <fps> <width> <quality> <motion quality> <lossy quality> <first>
#     <start> <stop> <frame.png>...   (the loop's frames in order, all three counted in them: start on the zoom in, stop
#     on the zoom out, and first from start round the seam to stop)
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image


def blocks(data):
    """The file's head (header, screen, global table), its application extensions, and each frame as its graphic
    control extension and image block, with the frame's delay."""
    flags = data[10]
    i = 13 + (3 * 2 ** ((flags & 7) + 1) if flags & 0x80 else 0)
    head, apps, frames, gce = data[:i], [], [], None
    while data[i] != 0x3B:
        start = i
        if data[i] == 0x21:
            i += 2
            while data[i]:
                i += data[i] + 1
            i += 1
            if data[start + 1] == 0xF9:
                gce = data[start:i]
            elif not frames:
                apps.append(data[start:i])
        elif data[i] == 0x2C:
            lf = data[i + 9]
            i += 10 + (3 * 2 ** ((lf & 7) + 1) if lf & 0x80 else 0) + 1
            while data[i]:
                i += data[i] + 1
            i += 1
            delay = int.from_bytes(gce[4:6], "little") if gce else 0
            frames.append({"gce": gce or b"", "image": data[start:i], "delay": delay})
            gce = None
        else:
            raise SystemExit(f"unexpected block {data[i]:#x} at {i}")
    return head, apps, frames


def shown(path, index):
    im = Image.open(path)
    im.seek(index)
    return np.asarray(im.convert("RGB"), dtype=np.int16)


def lzw(index, min_size=8):
    """GIF's LZW code stream for these color indices, in sub-blocks of at most 255 bytes."""
    clear, eoi = 1 << min_size, (1 << min_size) + 1
    out, acc, nbits = bytearray(), 0, 0
    size, nxt, table = min_size + 1, eoi + 1, {}

    def emit(code):
        nonlocal acc, nbits
        acc |= code << nbits
        nbits += size
        while nbits >= 8:
            out.append(acc & 0xFF)
            acc >>= 8
            nbits -= 8

    emit(clear)
    run = int(index[0])
    for k in index[1:].tolist():
        key = (run << 8) | k
        code = table.get(key)
        if code is not None:
            run = code
            continue
        emit(run)
        if nxt == 4096:
            emit(clear)
            size, nxt, table = min_size + 1, eoi + 1, {}
        else:
            # the encoder knows the wider code before the decoder needs it, hence >=
            if nxt >= (1 << size):
                size += 1
            table[key] = nxt
            nxt += 1
        run = k
    emit(run)
    emit(eoi)
    if nbits:
        out.append(acc & 0xFF)
    chunks = b"".join(bytes([len(out[i : i + 255])]) + out[i : i + 255] for i in range(0, len(out), 255))
    return bytes([min_size]) + chunks + b"\x00"


def whole(rgb):
    """A picture of at most 256 colors as one GIF image block with its own color table."""
    h, w, _ = rgb.shape
    colors, index = np.unique(rgb.reshape(-1, 3), axis=0, return_inverse=True)
    if len(colors) > 256:
        raise SystemExit(f"the first frame shows {len(colors)} colors, more than one palette holds")
    table = np.zeros((256, 3), dtype=np.uint8)
    table[: len(colors)] = colors
    head = bytes([0x2C, 0, 0, 0, 0]) + w.to_bytes(2, "little") + h.to_bytes(2, "little") + bytes([0x87])
    return head + table.tobytes() + lzw(index.reshape(-1).astype(np.uint8))


def gifski(tool, out, pngs, fps, width, quality, motion, lossy, extra=()):
    subprocess.run(
        [tool, "--quiet", "--no-sort", "--fps", str(fps), "--width", str(width), "--quality", str(quality)]
        + ["--motion-quality", str(motion), "--lossy-quality", str(lossy), *extra, "--output", out]
        + pngs,
        check=True,
    )
    return blocks(open(out, "rb").read())


def palette(tool, pngs, width, tmp):
    """255 colors for these frames (a GIF frame with transparency has one place fewer), chosen by gifski's own
    quantizer from a sheet of them; the least used of its 256 gives way."""
    tiles = [Image.open(p).convert("RGB") for p in pngs]
    w = int(width)
    tiles = [t.resize((w, round(t.height * w / t.width)), Image.LANCZOS) for t in tiles]
    cols = 6
    th = tiles[0].height
    sheet = Image.new("RGB", (w * cols, th * ((len(tiles) + cols - 1) // cols)))
    for k, t in enumerate(tiles):
        sheet.paste(t, ((k % cols) * w, (k // cols) * th))
    sheet.save(f"{tmp}/sheet.png")
    # gifski wants two frames at least: the sheet twice
    gifski(tool, f"{tmp}/sheet.gif", [f"{tmp}/sheet.png"] * 2, 1, sheet.width, 100, 100, 100)
    pic = shown(f"{tmp}/sheet.gif", 0).reshape(-1, 3)
    colors, counts = np.unique(pic, axis=0, return_counts=True)
    return colors[np.argsort(-counts)[:255]]


def encode(out, tool, fps, width, quality, motion, lossy, first, start, stop, pngs):
    n = len(pngs)
    if not (stop < start < n and (first >= start or first <= stop)):
        raise SystemExit("expected stop before start, and first from start round the loop's seam to stop")
    with tempfile.TemporaryDirectory(dir=os.path.dirname(os.path.abspath(out))) as tmp:
        # the run around the seam, from start to the loop's end and on from frame 0 to stop, with one palette
        around = list(range(start, n)) + list(range(0, stop + 1))
        fixed = palette(tool, [pngs[k] for k in around[::3]], width, tmp)
        extra = [a for c in fixed for a in ("--fixed-color", "%02x%02x%02x" % tuple(int(v) for v in c))]
        _, _, run1 = gifski(tool, f"{tmp}/around.gif", [pngs[k] for k in around], fps, width, quality, motion, lossy, extra)
        # and the rest, from just after stop to just before start
        rest = list(range(stop + 1, start))
        head, apps, run2 = gifski(tool, f"{tmp}/rest.gif", [pngs[k] for k in rest], fps, width, quality, motion, lossy)

        def frames_of(run, order):
            """each frame of a run with the loop frame it starts on: gifski starts a frame at that frame's time rounded
            up to a hundredth, and folds a frame that repeats the one before into it"""
            t, found = 0, []
            for f in run:
                found.append((order[round(t * fps / 100)], f))
                t += f["delay"]
            return found

        a1, a2 = frames_of(run1, around), frames_of(run2, rest)
        if first not in [k for k, _ in a1]:
            raise SystemExit(f"gifski folded frame {first} into the one before; start the GIF on another")
        at = [k for k, _ in a1].index(first)
        sequence = a1[at:] + a2 + a1[:at]
        # each frame's delay again, from where it falls in the GIF, so the loop keeps time across the runs' joins
        place = {k: (k - first) % n for k in range(n)}
        starts = [place[k] for k, _ in sequence] + [n]
        cs = [int(np.ceil(s * 100 / fps - 1e-9)) for s in starts]
        body = b""
        for j, (k, f) in enumerate(sequence):
            delay = (cs[j + 1] - cs[j]).to_bytes(2, "little")
            if j == 0:
                # the first frame whole, kept in place as gifski keeps every frame (disposal 1), with no transparency
                picture = shown(f"{tmp}/around.gif", at)
                body += bytes([0x21, 0xF9, 0x04, 0x04]) + delay + bytes([0, 0]) + whole(picture)
            else:
                gce = bytearray(f["gce"])
                gce[4:6] = delay
                body += bytes(gce) + f["image"]
        open(out, "wb").write(head + b"".join(apps) + body + b"\x3b")
        # the GIF, as shown, against the runs as they showed the same frames
        check = [float(np.abs(shown(out, 0) - picture).mean())]
        for j, src, idx in ((1, "around", at + 1), (len(a1) - at, "rest", 0), (len(a1) - at + len(a2), "around", 0)):
            check.append(float(np.abs(shown(out, j) - shown(f"{tmp}/{src}.gif", idx)).mean()))
        return {
            "frames": len(sequence),
            "seconds": cs[-1] / 100,
            "bytes": len(open(out, "rb").read()),
            "colors": len(np.unique(picture.reshape(-1, 3), axis=0)),
            "delays": sorted({cs[j + 1] - cs[j] for j in range(len(sequence))}),
            "check": check,
            "runs": (len(run1), len(run2)),
        }


if __name__ == "__main__":
    out, tool, fps, width, quality, motion, lossy, first, start, stop = sys.argv[1:11]
    r = encode(out, tool, int(fps), width, quality, motion, lossy, int(first), int(start), int(stop), sys.argv[11:])
    print(
        f"{out}: {r['frames']} frames ({r['seconds']:.2f} s, delays {r['delays']} cs) from frame {first}, "
        f"{r['bytes'] / 1e6:.2f} MB; runs of {r['runs'][0]} and {r['runs'][1]} frames; the first frame's {r['colors']} "
        "colors written whole; mean difference from the runs at the first frame, the next, and each run's start: "
        + ", ".join(f"{c:.3f}" for c in r["check"])
    )
