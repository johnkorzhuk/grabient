# The seam's dissolve, blended here: a water run's last frames (the tweet's loop, or the newsletter's shorter one, each
# drawn on its own schedule) mixed into the run's frames from before the first, rounded once. Stacked with a fractional
# opacity in the browser the mix comes out a level darker everywhere (each blend truncates), which would show as a step
# where the dissolve starts and where the loop comes round; blended here it is exact. Writes <run>/dissolve/w<i>.png (the
# water) and m<i>.png (the wordmark, premultiplied), i being the run's own frame.
#   python3 tools/dissolve.py <frames/water-<theme>[-email]>
import json
import os
import sys

import numpy as np
from PIL import Image

water = sys.argv[1]
meta = json.load(open(f"{water}/meta.json"))
F, n = meta["fade"], meta["length"]
clips = {f["k"]: f["clip"] for f in meta["frames"]}


def smooth(t):
    c = min(max(t, 0.0), 1.0)
    return c * c * (3 - 2 * c)


def load(path):
    return np.asarray(Image.open(path), dtype=np.float64)


out = f"{water}/dissolve"
os.makedirs(out, exist_ok=True)
for i in range(n - F, n):
    w = smooth((i - (n - F) + 1) / F)
    # this frame, and the frame drawn as long before the first as this one is before the end
    k, k2 = i + F, i - n + F
    a = load(f"{water}/w{k:05d}.png")
    b = load(f"{water}/w{k2:05d}.png")
    Image.fromarray(np.rint(a * (1 - w) + b * w).astype(np.uint8)).save(f"{out}/w{i:05d}.png")
    if clips[k] != clips[k2]:
        raise SystemExit(f"the wordmark moved across the dissolve: {clips[k]} {clips[k2]}")
    # the wordmark's two pictures, mixed with their alpha: premultiplied, then back
    ma, mb = load(f"{water}/m{k:05d}.png"), load(f"{water}/m{k2:05d}.png")
    pa, pb = ma[..., :3] * ma[..., 3:] / 255, mb[..., :3] * mb[..., 3:] / 255
    alpha = ma[..., 3:] * (1 - w) + mb[..., 3:] * w
    color = (pa * (1 - w) + pb * w) / np.maximum(alpha / 255, 1e-9)
    rgba = np.concatenate([np.clip(np.rint(color), 0, 255), np.clip(np.rint(alpha), 0, 255)], axis=2)
    Image.fromarray(rgba.astype(np.uint8), "RGBA").save(f"{out}/m{i:05d}.png")
print(f"{out}: frames {n - F} to {n - 1}")
