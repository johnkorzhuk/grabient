# Cosine palettes + harness API reference

Shared reference for the generate-forward / caption / judge / audit skills.

## The palette formula

A palette is `color(t) = a + b * cos(2π * (c*t + d))` evaluated per RGB channel
for t in [0,1]. The training target is 12 floats in row order:
`[a.r, a.g, a.b, b.r, b.g, b.b, c.r, c.g, c.b, d.r, d.g, d.b]`, 3 decimals.

Intuition per row:
- **a (offset)** — the base color the gradient oscillates around. Keep ~0.2–0.8.
- **b (amplitude)** — how far each channel swings. `a ± b` outside [0,1] clips
  to mud/blowout; keep |b| ≤ min(a, 1-a) + ~0.15.
- **c (frequency)** — cycles across the gradient. 0.25–1.25 is the sweet spot;
  above ~1.5 you get candy-cane banding, near 0 the channel goes flat.
- **d (phase)** — where in the cycle each channel starts (0–1 wraps). Phase
  offsets between channels are what create hue movement.

Failure modes to avoid/flag: near-black or flat palettes, heavy clipping
(consecutive identical stops at #000000/#ffffff), stripey high-frequency
palettes, gray mud (all channels nearly equal everywhere).

You may author palettes either as `{"coeffs": [12 floats]}` or as
`{"hexColors": ["#aabbcc", ...]}` (3–8 colors — the server fits coeffs and
rejects `bad-fit` when the colors don't follow a smooth cosine-like path;
smooth transitions fit well, hard neon jumps don't).

## Presentation (style / steps / angle)

Every palette automatically gets a **derived** `style`/`steps`/`angle`
(computed server-side from its complexity — do not send these for the palette).
You only act when **the query text itself dictates presentation** — then send
**overrides on the pair**: `styleOverride`, `stepsOverride`, `angleOverride`.

- Send an override ONLY for explicit signals: "5 color palette" →
  `stepsOverride: 5`; "swatches" / "color scheme" → a `*Swatches` style;
  "radial glow" / "sunburst" → `radialGradient`; "horizontal fade" →
  `angleOverride: 90`. No signal → omit all three (most queries).
- `styleOverride` — `linearGradient | linearSwatches | angularGradient |
  angularSwatches | radialGradient | radialSwatches`.
- `angleOverride` — integer 0–360, CSS convention (0 = bottom→top,
  90 = left→right, 180 = top→bottom).
- `stepsOverride` — integer 2–50 (site default 7); swatch styles read best
  with the count the query implies (3–8).

## Themes (caption only)

When captioning, also send `themes`: 3–5 free-form lowercase phrases naming
what the palette evokes ("rainy harbor", "70s kitchen", "citrus"). They steer
semantic coverage and slice evals — they are never a training target, so favor
honest associations over creative writing. Distinct from the deterministic
`tags` (those measure visual properties).

## API

All requests: `-H "Authorization: Bearer $DC_API_KEY"` against `$DC_API_URL`,
JSON bodies with `-H "Content-Type: application/json"`. Always pass the
`run_id` you were invoked with as `runId`.

- `GET /api/coverage` → `{tagHistogram, queryCategoryCounts, brightnessBands,
  contrastBands, themes: {top, palettesWithoutThemes}, gaps: [{kind, value,
  count}]}` — gaps are the 12 least-covered buckets, ascending (plus a
  `themes` sparsity entry when palettes lack themes).
- `GET /api/stats` → totals per status.
- `POST /api/palettes/similar` `{coeffs?|hexColors?, topK?}` →
  `{seed, isDuplicate, exactMatch, neighbors: [{seed, distance, reversed}]}`.
  distance is average deltaE; < 8 counts as duplicate.
- `POST /api/palettes/batch` `{runId, source, palettes: [...]}` → per-item
  accepted/rejected with reasons (`duplicate` includes `nearestSeed`/`distance`).
- `POST /api/submit/forward` `{runId, query: {text, category, styleHint?},
  candidates: [...]}` → `{query: outcome, accepted, rejected}`.
  Candidates may carry `styleOverride`/`stepsOverride`/`angleOverride` (see
  Presentation — only when the query dictates).
  Categories: scene | mood | aesthetic | color-explicit | object | nature |
  abstract | season-weather-time. styleHint: short | verbose | typo | casual.
- `POST /api/caption/lease` `{runId, limit}` → `{palettes: [{seed, hexStops,
  tags, brightness, contrast, style, steps, angle, themes}]}`.
- `POST /api/caption/submit` `{runId, seed, themes?: [string], queries:
  [{text, category, styleHint?, styleOverride?, stepsOverride?,
  angleOverride?}]}` → per-query inserted/duplicate (with existingText).
- `POST /api/judge/lease` `{runId, limit}` → `{pairs: [{queryId, seed,
  queryText, coeffs, hexStops, tags}]}`.
- `POST /api/judge/submit` `{runId, results: [{queryId, seed, score 0-10,
  verdict: ok|bad-match|bad-palette, ambiguity?: low|medium|high, notes?}]}`.
- `POST /api/judge/golden` `{runId, pairs: [{queryId, seed}]}` — audit only:
  flags independently re-confirmed pairs as golden eval-set members.
- `GET /api/judge/audit/sample?n=20` → scored pairs with storedScore/verdict.

## Rules for every skill

- Never write repo files; only call the API (and Read rendered PNGs when told).
- Treat server rejections as information, not errors: a `duplicate` rejection
  tells you what already exists — diverge from it, don't retry cosmetically.
- Finish by printing one summary line: counts of submitted/accepted/rejected.
