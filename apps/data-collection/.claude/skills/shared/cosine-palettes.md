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

`style`/`steps`/`angle` are properties of the PALETTE — how it renders best on
grabient.com. Choose them from how the palette itself reads, **never from the
query**, and never put rendering *parameters* in query text: "radial",
"angular", "swatches", "conic", step counts, angle talk must not appear in any
query. The bare nouns "gradient"/"palette" are ordinary user vocabulary and
are allowed. If you send no values the server derives sensible defaults from
palette complexity; send them when you have a better read:

- `style` — `linearGradient | linearSwatches | angularGradient |
  angularSwatches | radialGradient | radialSwatches`. Smooth atmospheric
  blends → gradients; discrete stripe-like color schemes → swatches; palettes
  with a strong center-out or glow character → radial; busy multi-hue cycles →
  angular.
- `angle` — integer 0–360, CSS convention (0 = bottom→top, 90 = left→right,
  180 = top→bottom); pick what flatters the palette's flow.
- `steps` — integer 2–50 (site default 7); swatch styles read best at 3–8,
  gradients at 6–16. For gradient styles the server enforces a minimum of
  ~10 steps per frequency cycle (banding guard) — a high-frequency palette
  is welcome, it just renders with more steps; don't fight the floor.

## Themes (caption only)

When captioning, also send `themes`: 3–5 free-form lowercase phrases naming
what the palette evokes ("rainy harbor", "70s kitchen", "citrus"). They steer
semantic coverage and slice evals — they are never a training target, so favor
honest associations over creative writing. Distinct from the deterministic
`tags` (those measure visual properties).

## API

All requests go through the pre-authenticated wrapper `harness/dc-api.sh` —
first argument is the API path, remaining arguments are extra curl flags:

    harness/dc-api.sh /api/coverage
    harness/dc-api.sh /api/submit/forward -X POST \
      -H "Content-Type: application/json" -d '{"runId": "...", ...}'

Do NOT construct curl commands with `$DC_API_URL`/`$DC_API_KEY` — env vars are
not readable in this session. Always pass the `run_id` you were invoked with
as `runId` in JSON bodies.

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
  Candidates may carry `style`/`steps`/`angle` — the best-fit presentation for
  that palette (see Presentation).
  Categories: scene | mood | aesthetic | color-explicit | object | nature |
  abstract | season-weather-time. styleHint: short | verbose | typo | casual |
  emoji.

## Emoji queries

Real users type emoji into search boxes — it is a language-independent color
register. Rules for authoring them (styleHint: "emoji"):
- **Sequence = gradient order**: ⚫🟣🔴 reads dark → purple → red.
- **Repetition = proportion**: ⚫⚫⚫🟣🍎 means more than half dark, then
  purple, ending in apple-red. Palettes for it should honor the weighting,
  not just the hue list.
- Object/nature emoji mean their characteristic color or scene: 🍎 red,
  🌊 ocean blues, 🌅 sunrise, 🌿 leaf green, 🍑 peach, 🔥 fire.
- Mixes with text are natural too: "🌊 sunset", "cozy 🍂".
- Keep sequences 2–6 emoji; never use skin-tone or flag emoji.
- `POST /api/caption/lease` `{runId, limit}` → `{palettes: [{seed, hexStops,
  tags, brightness, contrast, style, steps, angle, themes}]}`.
- `POST /api/caption/submit` `{runId, seed, themes?: [string], presentation?:
  {style?, steps?, angle?}, queries: [{text, category, styleHint?}]}` →
  per-query inserted/duplicate (with existingText). Send `presentation` when
  the leased palette's current values don't fit how it actually reads (common
  for sampler-created palettes).
- `POST /api/judge/lease` `{runId, limit}` → `{pairs: [{queryId, seed,
  queryText, coeffs, hexStops, tags}]}`.
- `POST /api/judge/submit` `{runId, results: [{queryId, seed, score 0-10,
  verdict: ok|bad-match|bad-palette, ambiguity?: low|medium|high, notes?}]}`.
- `POST /api/judge/golden` `{runId, pairs: [{queryId, seed}]}` — audit only:
  flags independently re-confirmed pairs as golden eval-set members.
- `GET /api/judge/audit/sample?n=20` → scored pairs with storedScore/verdict.

## Rules for every skill

- Call the API ONLY via `harness/dc-api.sh` (pre-authenticated). Never probe
  or read env vars (`echo $VAR`, `env`, `printenv` — blocked, and there is no
  human to approve anything). If a call fails, retry it once; do not fall
  back to environment debugging or asking for approval.
- Never write repo files; only call the API (and Read rendered PNGs when told).
- Treat server rejections as information, not errors: a `duplicate` rejection
  tells you what already exists — diverge from it, don't retry cosmetically.
- Finish by printing one summary line: counts of submitted/accepted/rejected.
