"""Training, step 4: the files the Worker reads, written to apps/web/public/search.

  tower.bin            the model: the palette side and the text side for the primary embedder
  tower-fallback.bin   the same palette side with a text side for the fallback embedder
  vocab.json           the vocabulary's phrases, their kinds and the model version
  vocab.bin            one query vector per phrase (float32)
  lex.json             normalized text -> phrase: English first, then every translation

The vocabulary is what people type: the phrases written for training, the XKCD survey's color names and the site's
collection titles. The designer list's color names train the model and stay out, since nobody types them and they would
catch misspellings of real words. The numbers the Worker's arithmetic is held to go to test/fixtures/model-check.json.

  python export.py --primary primary --fallback fallback --version v1

A new version means new palette vectors, so a new base snapshot (apps/web/scripts/search/index.ts build)."""
import argparse
import json
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "..", "apps", "web", "public", "search"))
CHECK = os.path.join(HERE, "..", "test", "fixtures", "model-check.json")
EMBEDDERS = {"gemma": "@cf/google/embeddinggemma-300m", "m3": "@cf/baai/bge-m3"}
VOCABULARY = {"llm", "xkcd", "collection"}
PALETTE = ("pal.net.0.weight", "pal.net.0.bias", "pal.net.2.weight", "pal.net.2.bias")


def cache(name):
    return os.path.join(HERE, "cache", name)


def write_tower(name, file, version):
    """A model file: a JSON header line, then the weights as little-endian float32 (packages/search/src/tower.ts)."""
    m = np.load(cache(f"tower-{name}.npz"))
    parts = [*(m[k] for k in PALETTE), m["txt.lin.weight"], m["txt.lin.bias"], m["mu"].reshape(-1)]
    head = {
        "din": int(parts[0].shape[1]),
        "hid": int(parts[0].shape[0]),
        "d": int(parts[2].shape[0]),
        "demb": int(parts[4].shape[1]),
        "embedder": EMBEDDERS[str(m["embedder"])],
        "version": version,
    }
    blob = json.dumps(head).encode() + b"\n" + b"".join(p.astype("<f4").tobytes() for p in parts)
    open(os.path.join(OUT, file), "wb").write(blob)
    print(file, head, len(blob), "bytes")
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--primary", required=True)
    ap.add_argument("--fallback", required=True)
    ap.add_argument("--version", required=True)
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    primary = write_tower(a.primary, "tower.bin", a.version)
    fallback = write_tower(a.fallback, "tower-fallback.bin", a.version)
    for k in PALETTE:
        assert np.array_equal(primary[k], fallback[k]), "the fallback shares the palette side: train it with --freeze-palette"

    meta = json.load(open(cache("rows.json")))
    texts = json.load(open(cache("texts.json")))
    pairs = json.load(open(os.path.join(HERE, "data", "pairs.json")))
    sources = {}
    for r in meta["rows"]:
        sources.setdefault(r["p"], set()).add(r["source"])
    chosen = [i for i in range(len(meta["phrases"])) if sources.get(i, set()) & VOCABULARY]

    E = np.load(cache(f"phrases-{primary['embedder']}.npy")).astype(np.float32)
    Z = (E[chosen] - primary["mu"]) @ primary["txt.lin.weight"].T + primary["txt.lin.bias"]
    Z /= np.maximum(1e-9, np.linalg.norm(Z, axis=1, keepdims=True))
    open(os.path.join(OUT, "vocab.bin"), "wb").write(Z.astype("<f4").tobytes())

    # each phrase's kind, as runs of [first row, kind]: the category it was written under, or a collection's title.
    # The Popular tags take the kinds in turn.
    category = {}
    for r in pairs:
        category.setdefault(r["phrase"], r["category"])
    kinds = []
    for k, i in enumerate(chosen):
        kind = category.get(meta["phrases"][i], "collection")
        if not kinds or kinds[-1][1] != kind:
            kinds.append([k, kind])
    vocab = {"version": a.version, "d": int(Z.shape[1]), "phrases": [meta["phrases"][i] for i in chosen], "kinds": kinds}
    json.dump(vocab, open(os.path.join(OUT, "vocab.json"), "w"), ensure_ascii=False)

    # texts.json holds every text already normalized by the Worker's own normalizer, so a key here is a key there
    row = {i: k for k, i in enumerate(chosen)}
    lex = {}
    for i in chosen:
        if texts["phrases"][i]:
            lex.setdefault(texts["phrases"][i], row[i])
    for t in texts["translations"]:
        if t["i"] in row and t["text"]:
            lex.setdefault(t["text"], row[t["i"]])
    json.dump(lex, open(os.path.join(OUT, "lex.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"vocabulary: {len(chosen)} phrases, {len(lex)} lexicon keys, version {a.version}")

    X = np.load(cache("features.npy")).astype(np.float64)
    assert len(pairs) <= len(X)

    def palette_side(x):
        h = x @ primary["pal.net.0.weight"].T + primary["pal.net.0.bias"]
        h = 0.5 * h * (1 + np.vectorize(math.erf)(h / np.sqrt(2)))
        z = h @ primary["pal.net.2.weight"].T + primary["pal.net.2.bias"]
        return z / np.linalg.norm(z)

    rounded = lambda values: [round(float(v), 6) for v in values]
    check = {
        "version": a.version,
        "palettes": [
            {"colors": pairs[i]["colors"], "vector": rounded(palette_side(X[i]))}
            for i in (0, 1, 4000, 8227, 9000, len(pairs) - 1)
        ],
        "phrases": [
            {"phrase": meta["phrases"][chosen[k]], "index": k, "embedding": rounded(E[chosen[k]]), "vector": rounded(Z[k])}
            for k in (0, 500, len(chosen) - 1)
        ],
    }
    json.dump(check, open(CHECK, "w"))
    print("model-check.json written")


if __name__ == "__main__":
    main()
