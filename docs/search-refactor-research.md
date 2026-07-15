# Search Refactor — Verified Research Findings

Companion to `apps/user-application/FEATURES.md` and `apps/grabient-ops/SYNTHETIC_DATA.md`.
Output of a deep-research pass (multi-source web research with 3-vote adversarial verification per claim) on the planned text→palette search refactor: color index + concept→color KB + RRF fusion + MMR + rerank, on Cloudflare Workers/Vectorize/KV/D1/Workers AI, no LLM in the hot path.

Stats: 108 claims extracted from 22 sources; 15 confirmed (survived 3-vote adversarial verification), 2 refuted, 8 unverified (verification aborted by usage limits — all sourced from official Cloudflare docs or a standard IR paper; re-check against docs during implementation).

---

## Changes to the plan (evidence-driven)

### 1. Rerank: DCCW-style sequence distance instead of Hungarian

**Dynamic Closest Color Warping** (Kim & Choi, SIGGRAPH 2021 — https://dl.acm.org/doi/10.1145/3450626.3459776), verified 3-0:

- Prior palette similarity measures (Hausdorff, bipartite/assignment matching) compare individual colors without modeling the palette's overall combination/progression. DCCW measures distance as the minimum sum of distances between each palette's colors and the **piecewise path (polyline) connecting the other palette's colors** — a flow-aware distance.
- DCCW **outperforms previous palette-similarity methods in both accuracy and computing time** on multiple evaluation datasets.

Grabient palettes are cosine gradients — continuous flows — so a flow-aware distance fits better than assignment-based Hungarian. Hungarian is not wrong: in human-judgment studies it statistically ties the best set-based metric (MICD) and both beat naive mean-of-pairs (Color Research & Application — https://onlinelibrary.wiley.com/doi/10.1002/col.22927, verified 3-0). But DCCW is better-suited to ordered gradients and cheaper.

Implementation sketch (in-Worker JS, trivial at n=5–11 × 50 candidates): sample both palettes, for each color of A take distance to the closest point on B's polyline (and vice versa), sum; take `min(forward, reversed)`. Skip DCCW's palette-sorting preprocessing — gradient order is already given.

### 2. Rerank color difference: CIEDE2000, not plain Lab/OKLab Euclidean

- CIEDE2000 correlates **much more strongly with human palette-similarity judgments than CIELAB Euclidean**, even at large inter-palette distances (means 46–93 CIELAB units) — https://onlinelibrary.wiley.com/doi/10.1002/col.22927, verified 3-0.
- Plain **OKLab Euclidean is substantially worse at discrimination than CIEDE2000**: STRESS 47.35 vs 29.13 on COMBVD; OKLab was optimized for appearance uniformity, not difference discrimination — https://arxiv.org/html/2606.05255v1, verified 3-0.
- **Refuted (1-2, do not rely on)**: the claim that a cheap 3-parameter OKLab transform (L^0.73 + chroma compression) matches CIEDE2000 (STRESS 29.09). Use real CIEDE2000 in the rerank — it is cheap at this scale.

Practical split: **OKLab Euclidean for the ANN index** (recall-only, simplicity wins), **CIEDE2000 inside DCCW for the final rerank** (mandatory, not optional — the index metric demonstrably mis-ranks).

---

## Confirmations of the plan

### 3. Order-preserving concatenated Lab vectors are the right index representation

- PaletteNet represents palettes as a **fixed-order concatenated 18-dim CIELAB vector** (6 colors × Lab) — precedent for low-dim concatenated coordinates over histograms/learned embeddings (https://openaccess.thecvf.com/content_cvpr_2017_workshops/w12/papers/Cho_PaletteNet_Image_Recolorization_CVPR_2017_paper.pdf, verified 3-0).
- Same paper's control experiment: palette **position maps to distinct roles** in output — order carries usable information beyond an unordered color set (verified 3-0).
- The counter-claim ("order does not affect perceived palette difference for small palettes") was **refuted 1-2**.

Recommendation stands: sample the gradient at fixed t positions (≈8 → 24 dims), preserve sequence order, canonicalize **direction only** (e.g. lighter-end-first), Euclidean metric; handle residual direction ambiguity at rerank with min(forward, reversed).

### 4. LLM concept→color KB is viable — with a precise map of where it is weak

From Mukherjee, Rogers & Schloss (https://arxiv.org/abs/2406.17781) and the color-word association study (https://arxiv.org/abs/2411.02116), all verified 3-0:

- GPT-4 color-concept association ratings correlate **r ≈ .67** with human ratings (human split-half reliability r ≈ .93): usefully human-like, measurably noisier.
- GPT-4 estimates **match or beat state-of-the-art image-based methods** (r .80 vs .79 for Rathore et al. image method; .80 vs .71 for Hu et al. colorization-network method) — LLMs are a valid substitute for image-derived concept→color pipelines.
- Alignment varies enormously by concept (max r ≈ .93, min r ≈ .08) and is **predicted by concept specificity** (peakiness of the color distribution), not concreteness. Broad/multimodal concepts are least reliable.
- Category-level: LLMs are **strong on concrete/scene-like categories** (landscape, rhythm/materials), **weakest on emotions**.
- Human–LLM divergence is **systematic, not random noise** → ensembling helps only if it spans **model families** (grabient-ops' 4-provider roster qualifies), not repeated samples of one model.
- LLM color accuracy improves across generations, but even GPT-4o with visual input hits only ~50% median at predicting the top human-voted word per color (10% chance level) — treat LLM colors as a query hint refined by color-space retrieval, never ground truth.

**Design upgrade derived from this**: store a **per-concept confidence score** in the KB — the OKLab spread of the ensemble's outputs (tight cluster = specific concept = trustworthy). Condition fusion on it: color channel dominates for high-confidence concepts; text channel + more target palettes carry low-confidence (mood/abstract) concepts.

### 5. KB prompting format

ColorGPT (ICDAR 2025 — https://arxiv.org/html/2508.08987v1):

- Hex is the best **single** color representation for palette completion: 52.60% 1-color accuracy vs RGB 42.86%, CIELAB 38.78%, words 17.06% (GPT-4o) — verified 2-1.
- For **full palette generation from text**, the combined **"word(hex)"** format beat pure hex (similarity 26.09 vs 34.83, lower better, PAT dataset) — verified 2-0.

→ Prompt KB builders to emit `dusty rose (#c08081)`-style pairs; parse the hexes; keep CIELAB out of prompts entirely.

---

## Unverified (authoritative sources; verification aborted by usage limits — re-check docs at build time, no re-research needed)

- Vectorize: vectors up to **1536 dims, no documented minimum** → a 24–33-dim color index is allowed (https://developers.cloudflare.com/vectorize/platform/limits/).
- Vectorize: **topK ≤ 50 when returning values/metadata**, ≤ 100 without.
- Vectorize: max **10 metadata indexes** per index (string/number/boolean, 64 bytes indexed per field per vector).
- Vectorize metadata filtering **supports range operators `$gt/$gte/$lt/$lte`** in addition to `$eq/$ne/$in/$nin` (https://developers.cloudflare.com/vectorize/reference/metadata-filtering/) → numeric brightness/saturation scores are filterable, not just enum strings.
- RRF with untuned **k=60** was the most effective of seven unsupervised fusion methods (Robust04, ClueWeb12B) and had fewest per-topic losses vs BM25 (Benham & Culpepper, ADCS 2017 — https://rodgerbenham.github.io/bc17-adcs.pdf).
- GPT-4o training-free pipeline exceeded prior supervised models on Crello-v2 palette completion (52.60% vs 47.13%).

## Not covered by this research pass

Verification for these never ran (usage limits) — prior recommendations stand on general grounds: MMR λ choice (~0.7 start, tune against eval set), DPP vs MMR (MMR sufficient at 50-candidate scale), eval-set sizing (50–100 labeled queries; measure precision@10 + mean pairwise Lab distance of top-10), embedding-similarity threshold for fuzzy KB matching (tune empirically per model — embeddinggemma cosine ranges are model-specific), KV write-back stampede protection (a "pending" KV marker suffices).

---

## Ranked do-this list

1. **Eval set first** — 50–100 labeled queries incl. long-tail and compositional; precision@10 + mean pairwise Lab distance of top-10. Every later parameter (fusion weights, MMR λ, DCCW vs Hungarian) is tuned against this.
2. **Color index** — order-preserving, direction-canonicalized concatenated OKLab at ~8 fixed t positions (24 dims), Euclidean, recall-only role (topK≈50).
3. **Rerank** — DCCW closest-point-on-polyline with CIEDE2000 as the color difference, min(forward, reversed). Wire the seed-query path (`/palettes/$seed` currently seed→color-names→text search) straight into this — biggest free relevance win in the refactor.
4. **KB** — multi-family ensemble → OKLab medoid clustering → 3–5 target palettes per concept, `word(#hex)` output format, plus the per-concept ensemble-spread **confidence score**.
5. **Fusion** — RRF k=60 baseline; weight channels by KB confidence (color-dominant for specific concepts, text-dominant for abstract/mood).
6. **Metadata** — computed categoricals as numeric scores (range filters supported); hard-filter only on explicit query constraints, otherwise ranking signals.
7. **Mood/abstract queries** — expect the KB to be weakest here (verified); keep the multi-model tagging ensemble for moods (where voting adds real value) and let the text channel lead these queries.
