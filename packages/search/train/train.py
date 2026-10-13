"""Training, step 3: the two sides of the search model, trained together.

  palette side  281 features -> Linear(384) -> GELU -> Linear(64) -> unit vector
  text side     a text embedding minus its mean -> Linear(64) -> unit vector

A row is one (phrase, palette) pair. The loss pulls a phrase toward every palette written for it and away from the rest
of the batch, both ways (supervised contrastive InfoNCE). Half the rows of a batch use a random translation of their
phrase, so the 19 languages land on one vector. The pairs made by formula from color names are many and alike, so each
epoch takes a share of them.

  python train.py --embedder gemma --name primary
  python train.py --embedder m3 --name fallback --freeze-palette primary     # the same palette side: switching needs no new vectors
  python train.py --embedder gemma --name primary --freeze-palette deployed  # new phrases only: keep the shipped palette side

Reads cache/features.npy, rows.json, texts.json, phrases-<embedder>.npy and translations-<embedder>.npy (written by
apps/web/scripts/search/train-features.ts and train-texts.ts). Writes cache/tower-<name>.npz."""
import argparse
import json
import os

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

HERE = os.path.dirname(os.path.abspath(__file__))
SHIPPED = os.path.join(HERE, "..", "..", "..", "apps", "web", "public", "search", "tower.bin")
BATCH = 512


def cache(name):
    return os.path.join(HERE, "cache", name)


def arguments():
    ap = argparse.ArgumentParser()
    ap.add_argument("--embedder", default="gemma", choices=["gemma", "m3"])
    ap.add_argument("--name", required=True)
    ap.add_argument("--freeze-palette", default="", help="reuse a palette side: a trained model's name, or 'deployed'")
    ap.add_argument("--d", type=int, default=64)
    ap.add_argument("--hid", type=int, default=384)
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--formula-share", type=float, default=0.35, help="share of the formula pairs each epoch takes")
    ap.add_argument("--holdout-fold", type=int, default=-1, help="measurement only: leave out the site rows of this fold")
    return ap.parse_args()


class PaletteSide(nn.Module):
    def __init__(self, din, d, hid):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(din, hid), nn.GELU(), nn.Linear(hid, d))

    def forward(self, x):
        return F.normalize(self.net(x), dim=-1)


class TextSide(nn.Module):
    def __init__(self, din, d):
        super().__init__()
        self.lin = nn.Linear(din, d)

    def forward(self, x):
        return F.normalize(self.lin(x), dim=-1)


def shipped_palette_side(din, hid, d):
    """The palette side the app ships (public/search/tower.bin), so a text side can be retrained on a fresh clone."""
    raw = open(SHIPPED, "rb").read()
    nl = raw.index(b"\n")
    head = json.loads(raw[:nl])
    assert (head["din"], head["hid"], head["d"]) == (din, hid, d), "the shipped model has another shape"
    floats = np.frombuffer(raw[nl + 1 :], dtype="<f4")
    state, at = {}, 0
    for key, shape in [("net.0.weight", (hid, din)), ("net.0.bias", (hid,)), ("net.2.weight", (d, hid)), ("net.2.bias", (d,))]:
        n = int(np.prod(shape))
        state[key] = torch.tensor(floats[at : at + n].reshape(shape).copy())
        at += n
    return state


def main():
    a = arguments()
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    rng = np.random.default_rng(a.seed)
    torch.manual_seed(a.seed)

    meta = json.load(open(cache("rows.json")))
    texts = json.load(open(cache("texts.json")))
    X = np.load(cache("features.npy")).astype(np.float32)
    E = np.load(cache(f"phrases-{a.embedder}.npy")).astype(np.float32)
    Ei = np.load(cache(f"translations-{a.embedder}.npy")).astype(np.float32)
    assert len(meta["rows"]) == len(X) and len(meta["phrases"]) == len(E) == len(texts["phrases"])
    assert len(texts["translations"]) == len(Ei)

    keep = np.array([r.get("fold", -2) != a.holdout_fold for r in meta["rows"]])
    phrase = np.array([r["p"] for r in meta["rows"]])[keep]
    formula = np.array([r["source"] in ("xkcd", "meodai") for r in meta["rows"]])[keep]
    mu = E[sorted(set(phrase.tolist()))].mean(0, keepdims=True)
    translations = {}
    for k, t in enumerate(texts["translations"]):
        translations.setdefault(t["i"], []).append(k)

    Xp = torch.tensor(X[keep], device=dev)
    Xt = torch.tensor(E - mu, device=dev)
    Xi = torch.tensor(Ei - mu, device=dev)
    ph = torch.tensor(phrase, device=dev)
    is_formula = torch.tensor(formula, device=dev)
    others = {k: torch.tensor(v, device=dev) for k, v in translations.items()}

    pal = PaletteSide(X.shape[1], a.d, a.hid).to(dev)
    txt = TextSide(E.shape[1], a.d).to(dev)
    scale = nn.Parameter(torch.tensor(np.log(20.0), device=dev))
    if a.freeze_palette:
        if a.freeze_palette == "deployed":
            state = shipped_palette_side(X.shape[1], a.hid, a.d)
        else:
            saved = np.load(cache(f"tower-{a.freeze_palette}.npz"))
            state = {k[4:]: torch.tensor(saved[k]) for k in saved.files if k.startswith("pal.")}
        pal.load_state_dict(state)
        pal.to(dev)
        for p in pal.parameters():
            p.requires_grad = False

    trained = [p for p in [*pal.parameters(), *txt.parameters(), scale] if p.requires_grad]
    opt = torch.optim.AdamW(trained, lr=2e-3, weight_decay=0.05)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=2e-3, total_steps=a.epochs * (len(ph) // BATCH + 1))
    for _ in range(a.epochs):
        order = torch.randperm(len(ph), device=dev)
        if a.formula_share < 1:
            order = order[~is_formula[order] | (torch.rand(len(order), device=dev) < a.formula_share)]
        for b in range(0, len(order), BATCH):
            rows = order[b : b + BATCH]
            xt = Xt[ph[rows]].clone()
            # half the rows read their phrase in another language
            for r in range(len(rows)):
                k = int(ph[rows[r]])
                if k in others and rng.random() < 0.5:
                    xt[r] = Xi[others[k][rng.integers(len(others[k]))]]
            logits = scale.exp().clamp(max=100) * txt(F.dropout(xt, 0.1)) @ pal(Xp[rows]).T
            same = (ph[rows][:, None] == ph[rows][None, :]).float()
            target = same / same.sum(1, keepdim=True)
            loss = 0.5 * (
                -(target * F.log_softmax(logits, 1)).sum(1).mean() - (target.T * F.log_softmax(logits.T, 1)).sum(1).mean()
            )
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()

    state = {f"pal.{k}": v.cpu().numpy() for k, v in pal.state_dict().items()}
    state |= {f"txt.{k}": v.cpu().numpy() for k, v in txt.state_dict().items()}
    np.savez(cache(f"tower-{a.name}.npz"), mu=mu.astype(np.float32), d=a.d, embedder=a.embedder, **state)
    print(f"{a.name}: {len(ph)} pairs, {len(set(phrase.tolist()))} phrases, {a.embedder}, final loss {loss.item():.3f}, {dev}")


if __name__ == "__main__":
    main()
