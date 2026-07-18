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

## API

All requests: `-H "Authorization: Bearer $DC_API_KEY"` against `$DC_API_URL`,
JSON bodies with `-H "Content-Type: application/json"`. Always pass the
`run_id` you were invoked with as `runId`.

- `GET /api/coverage` → `{tagHistogram, queryCategoryCounts, brightnessBands,
  contrastBands, gaps: [{kind, value, count}]}` — gaps are the 12 least-covered
  buckets, ascending.
- `GET /api/stats` → totals per status.
- `POST /api/palettes/similar` `{coeffs?|hexColors?, topK?}` →
  `{seed, isDuplicate, exactMatch, neighbors: [{seed, distance, reversed}]}`.
  distance is average deltaE; < 8 counts as duplicate.
- `POST /api/palettes/batch` `{runId, source, palettes: [...]}` → per-item
  accepted/rejected with reasons (`duplicate` includes `nearestSeed`/`distance`).
- `POST /api/submit/forward` `{runId, query: {text, category, styleHint?},
  candidates: [...]}` → `{query: outcome, accepted, rejected}`.
  Categories: scene | mood | aesthetic | color-explicit | object | nature |
  abstract | season-weather-time. styleHint: short | verbose | typo | casual.
- `POST /api/caption/lease` `{runId, limit}` → `{palettes: [{seed, hexStops,
  tags, brightness, contrast}]}`.
- `POST /api/caption/submit` `{runId, seed, queries: [{text, category,
  styleHint?}]}` → per-query inserted/duplicate (with existingText).
- `POST /api/judge/lease` `{runId, limit}` → `{pairs: [{queryId, seed,
  queryText, coeffs, hexStops, tags}]}`.
- `POST /api/judge/submit` `{runId, results: [{queryId, seed, score 0-10,
  verdict: ok|bad-match|bad-palette, notes?}]}`.
- `GET /api/judge/audit/sample?n=20` → scored pairs with storedScore/verdict.

## Rules for every skill

- Never write repo files; only call the API (and Read rendered PNGs when told).
- Treat server rejections as information, not errors: a `duplicate` rejection
  tells you what already exists — diverge from it, don't retry cosmetically.
- Finish by printing one summary line: counts of submitted/accepted/rejected.
