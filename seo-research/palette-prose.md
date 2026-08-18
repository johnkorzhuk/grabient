# Palette prose

Status: implemented, 2026-08-17 (naming system in cd3827e; the prose module
landed via the dd9be6c working-tree snapshot).
Companion to [palette-modifiers.md](./palette-modifiers.md) (the descriptor
registry underneath) and [color-corpus.md](./color-corpus.md) (the name corpus,
restored the same day).

Every seed page used to describe itself in one sr-only line; two pages differed
by ~45 tokens out of ~1,100 ([indexing-and-ai-visibility.md](./indexing-and-ai-visibility.md)
§5.6), and half the corpus sits at "Discovered – currently not indexed". This
replaces that line with a visible, deterministic paragraph in which every clause
is a `(predicate, template)` pair over measured features — no free-text path —
plus a related-searches chip row derived from the same facts.

Everything below is measured over the **867 seeds in the live sitemap**
(fixture: `apps/web/test/prose-corpus.js`), rendered at the default view
(linearGradient, 7 steps, 90°) through the exact production wiring
(`seedPaletteText`'s calls). The measurement harness was a scratch vitest file;
the numbers that gate the build are pinned permanently in
`apps/web/test/palette-prose.test.js`.

---

## 1. Architecture

**`apps/web/src/palette-prose.ts`** — pure function of
`(coeffs, hexColors, view)`, beside `palette-name.ts` for the same reason:
shared by the server render and the edit island, so crawler and live DOM cannot
disagree. Banned inside: `Math.random`, `Date`, seed hashing, locale
formatting. One analysis pass (`paletteFeatures` dense 48-sample) feeds name,
prose, and related labels.

Four outputs per palette (`PaletteProse`):

| output | composition | consumer |
|---|---|---|
| `identity` | R1 without hexes | meta opener, JSON-LD `abstract` |
| `paragraph` | R1(end hexes) + R2..R5 + [R7] + R6, ladder-trimmed to ≤800 | visible `<p id="palette-description">`, JSON-LD `description`, `/{seed}.json` |
| `metaDescription` | identity + action clause, ladder-trimmed ≤160 | `<meta name="description">` |
| `embedText` | R1(no hex) + body + `Tags:` + `Colors:`; no R6, no hex, never trimmed | future Vectorize index text (reindex-gated) |

Sentence roles: **R1** identity (modifier phrase + "gradient color palette" +
ramp-ordered names, journey verb keyed to turns/ΔL), **R2** hue geometry — one
sentence shape per structure class, dense-derived, byte-identical at every step
count, **R3** tone (banded adjectives + measured numbers, direction verbs keyed
to value), **R4** 0–3 conditional clauses tried rarity-first, **R5** WCAG ratio
always + seam when it closes, **R7** usage close (first true gate), **R6** the
view sentence — the only sentence that may say steps/style/angle, and it never
enters `embedText`. R2/R3 order is earned by `descriptorScore` comparison
(fixture split: 415 tone-led / 452 geometry-led = 47.9% / 52.1%).

`describePalette()` is the canonical triple (title / description / tags) for
future consumers; `relatedSearches()` produces the chip-row labels from bounded
vocabularies only (corpus names ∪ registry spoken words ∪ 12 family anchors),
so the crawl frontier is finite by construction.

The page ladder drops R4 clauses from the end (least-informative survivor
first), then R2 extras, until the paragraph fits 800. `embedText` is never
trimmed — retrieval wants every true clause — and its ceiling was never
approached (max 1,247 of 1,600).

---

## 2. Measured distributions (867 seeds, default view)

### Lengths (chars)

| surface | p5 | p25 | p50 | p75 | p95 | max | bound |
|---|---|---|---|---|---|---|---|
| paragraph | 505 | 591 | 658 | 712 | 779 | 875 | target 350–800; test ≤900 |
| metaDescription | 99 | 111 | 120 | 128 | 147 | 158 | ≤160 |
| embedText | 539 | 650 | 738 | 819 | 955 | 1,247 | ≤1,600 |

Paragraph min 353; sentences per paragraph p50 6, range 4–9. Three seeds
(0.35%) exceed the 800 target after the ladder exhausts its droppable clauses
— their base sentences alone run long; the hard test bound (900) still holds
with 25 chars of headroom.

### The templated-page test

| metric | measured | acceptance |
|---|---|---|
| identical paragraphs | 2 pairs, **both are the same palette twice** (applied coeffs differ ≤4e-4, byte-identical renders): `…IVesvowngA`/`…IV` and `…NFdKuu5rgG`/`…NL` | collisions only between identical renders |
| distinct stripped skeletons (digits/hex/color names/family words removed) | **833** of 867 | ≥50 |
| word-trigram Jaccard, 300 LCG-sampled pairs | mean **0.210**, max **0.423** | mean <0.35, max <0.80 |
| "gradient color palette" in every R1 | 867/867 | required |

### R2 template census (the seven structure shapes)

| structure | seeds | share |
|---|---|---|
| analogous | 252 | 29.1% |
| multicolor | 238 | 27.5% |
| monochrome | 144 | 16.6% |
| rainbow | 117 | 13.5% |
| complementary | 46 | 5.3% |
| duotone | 46 | 5.3% |
| grayscale | 24 | 2.8% |

Every one of the seven sentence shapes is exercised; the test asserts each
structure's R2 matches its signature.

### Measure-first vocabulary (detectors in palette-prose.ts, house 2%–60% band)

| word | fires | rate | placement |
|---|---|---|---|
| opponent-axis | 370 | 42.7% | prose (further gated to duotone/complementary R2) |
| warm–cool contrast | 200 | 23.1% | prose (R4) |
| ombré | 167 | 19.3% | prose (R2 extra) |
| jewel | 106 | 12.2% | prose (R3 chroma) |
| saturation-contrast | 92 | 10.6% | prose (R4) |
| brilliant | 72 | 8.3% | prose (R3 lead) |
| deep | 47 | 5.4% | prose (R3 lead) |
| warm-gray | 28 | 3.2% | prose (grayscale R2) |
| sepia | 9 | **1.0%** | embedding tail only — under the 2% floor |

The research predicted ombre/sepia/jewel/deep as survivors; the fixture
overturned two calls — **brilliant survived** (8.3%; the corpus is lighter and
more vivid than the chroma p50 suggested) and **sepia died** (1.0%; brown
monochromes narrow enough for the gate are rarer live than on paper). Rates
are pinned to ±0.05pp by the test, same drift contract as the registry.

### New tag descriptors (motion + channel axes, tags/embedding/prose only — never spoken)

| word | axis | fires | rate | registry prevalence |
|---|---|---|---|---|
| brightening | motion | 298 | 34.4% | 34.5% |
| darkening | motion | 156 | 18.0% | 17.9% |
| hue-advancing | motion | 151 | 17.4% | 17.4% |
| hue-reversing | motion | 143 | 16.5% | 16.6% |
| bright-middle | motion | 111 | 12.8% | 12.8% |
| dark-middle | motion | 65 | 7.5% | 7.5% |
| hue-wandering | motion | 41 | 4.7% | 4.7% |
| full-wheel | motion | 19 | 2.2% | 2.2% |
| clipped-highlights | channel | 214 | 24.7% | 24.7% |
| crushed-shadows | channel | 161 | 18.6% | 18.6% |
| unclipped | channel | 155 | 17.9% | 17.9% |
| flat-channel | channel | 95 | 11.0% | 11.0% |
| pure-black-plateau | channel | 21 | 2.4% | 2.4% |
| solid | channel | 1 | 0.1% | 0.1% |

All within 0.2pp of the registry's recorded prevalences (the residue is the
7-step default view vs the registry's 13-step measurement pass).

### Related-searches chip row (the crawl frontier this creates)

Labels per page: p50 **4**, min 2, max 6. **668 distinct labels** across the
corpus — 668 potential `/palettes/{querySlug(label)}` targets, every one from a
bounded vocabulary (no free-text compounds), so the frontier cannot grow past
the vocabularies. Top 20 by page count:

| label | pages | | label | pages |
|---|---|---|---|---|
| monochrome | 144 | | pastel | 71 |
| sunset | 124 | | complementary | 46 |
| rainbow | 116 | | duotone | 46 |
| dark | 97 | | dark blue gray | 35 |
| earthy | 94 | | almost black | 30 |
| muted | 89 | | black | 26 |
| ocean | 84 | | grayscale | 24 |
| neon | 81 | | autumn | 23 |
| | | | marine | 21 |
| | | | charcoal gray | 21 |
| | | | dark brown | 20 |
| | | | midnight | 19 |

Head labels are the spoken registry words (already hub/footer vocabulary —
duplication is deliberate: in-content links carry relevance the boilerplate
row does not); the long tail is per-palette color names, indexable by design
(indexableQuery way #2).

### Step stability (100 seeds × 3/7/13/24 steps)

| comparison | changed | verdict |
|---|---|---|
| **structure word + R2 sentence** | **0/100** | the byte-identical contract holds (also asserted by the test on 22 seeds) |
| R1 (color names) | 56/100 | documented name-system behavior: at 3 steps you genuinely see different colors |
| tone-block printed numbers | 66/100 | rendered-stop statistics move with sampling; every number is true at its own render |
| tone-block **wording** (digits stripped) | 23/100 incl. the 3-step render; **9/100 at 13/24 only** | band flips at boundaries |
| per-fact flip rate | 2.67% incl. 3-step; **1.68% at 13/24 only** | consistent with the registry's measured 98.6%+ per-fact step stability (worst descriptor, `vivid`, was 98.6% at 7v13) |
| full paragraph minus R6 | 76/100 | union of the three legitimate churn sources above |

The wording flips concentrate at 3 steps (three samples of a continuous curve:
mean chroma crosses `muted`, the min/max stops move the WCAG ratio across 4.5,
`high-key`/`deep` leads flip). Bands are worded so a boundary value is
truthfully described by either side — a flip is a rewording, never a lie —
and the sentence with the number in it is correct for the render it describes.

---

## 3. Truth spot-check (10 LCG-chosen seeds, every claim recomputed)

Ten seeds drawn with the harness LCG (seed 7), each paragraph audited clause by
clause against the raw feature values. All claims verified at stated precision;
three cases worth recording:

| seed | structure | verdict | notes |
|---|---|---|---|
| `_f9KgH-gB7f5c…` | rainbow | PASS | 237°=round(236.75); reverse (net −132°, consistency 1.0); climbs 0.24→0.81; "while" connective correct (same-direction) |
| `_gM4gNQgLAgC5…` | rainbow | PASS | high-key lead (L̄ 0.876, range 0.119); 40%=round(0.3958); advance (net +219°) |
| `_gAdgH1gIagIj…` | complementary | PASS | 163° apart; green–red axis (159° vs 352° poles); falls 0.92→0.18 spanning; 38% bottom-pinned |
| `_gMrgLHgJcgBA…` | monochrome | PASS | tone leads (pastel 5.03 > monochrome 3.11); no lead adjective at L̄ 0.784 < 0.80 — correct; 21° arc of orange (h̄ 65.6) |
| `_gAAgCngTtgAA…` | monochrome | PASS | deep+jewel gates verified; **ladder case**: 3 clauses selected, page trims the clip clause (756 chars final), embedText keeps it (953 chars) — by design |
| `_gJOgHUgHfgIR…cr5WxzjG` | rainbow | PASS | saturation-contrast exact (black stop beside C 0.26); R4 cap 3 spends budget on rarer facts, generic clip clause never selected |
| `_gA7fche-agS_…` | analogous | PASS | one wording tension: ombré's "hue held steady" beside R2's "drifts 36°" — the gate admits analogous by design (research-colorTheory §7); flagged, not a falsehood (36° across 0.71 of lightness travel) |
| `_gIogJNgJ2gIP…` | multicolor | PASS | **boundary-honesty case**: ratio 4.4668 prints 4.5, clears/short computed on the printed value so the sentence can never read "4.5:1, short of 4.5:1" |
| `_gH1gIagAdgL4…` | complementary | PASS | 158° apart; opponent-axis correctly silent (mass off-axis); 12.2:1 clears |
| `_gD5f4jgKCgLr…` | monochrome | PASS | 20° arc of yellow (h̄ 119.9: yellow 108 beats green 142); "most vivid mid-ramp" (denseChromaRange 0.044 ≥ 0.04, peak t 0.57); zero R4 clauses — correctly empty |

Conflation-law scan across all ten: no "out of gamut", no luma/luminosity, no
"hotter", no metallic claims, no "clockwise", no hue word for sub-floor chroma,
"complementary" spelled correctly, violet/purple assigned by their own anchors.
Corpus color names ("ugly blue", "very dark brown") are exempt from the family
gates by construction — they are nearest-corpus-name lookups, not generated
hue words.

---

## 4. Reindex-gated items — one reindex, three riders

Everything in this system is serve-time additive **except** retrieval. Three
changes are staged and must ship together on ONE Vectorize rebuild:

1. **Index text → `paletteEmbedText()`** (`palette-prose.ts`). The canonical
   composition: prose body (no R6, no hex) + `Tags:` (modifierTags ∪ stored
   base tags ∪ sub-band tail words like sepia/warm-gray) + `Colors:` (≤6).
   Today's index was embedded from `palette-tags` text and has never seen this
   vocabulary.
2. **Query-side mirror** (`semantic-search.ts`, `normalizeSemanticQuery` seed
   branch). Stays names-only until #1 ships — enriching only the query side
   degrades matching (index/query asymmetry). At cutover: names + spoken
   modifiers + structure word, mirroring the head of the index text.
3. **`texture:'monochrome'` → `'grayscale'` correction** (palette-tags), the
   headline finding of [palette-modifiers.md](./palette-modifiers.md) §0 —
   already queued for the same reindex.

Until then the page paragraph, meta, JSON-LD, `/{seed}.json` and the chip row
are all live and true; only *retrieval* waits. Code comments at both sites
state the gate.

Related but not gated: the temperature-journey wording ("warming as it runs")
is read ONLY from the caller's stored `analyzeCoefficients` tags, never
recomputed with a different formula, so prose and the live index can never
disagree about a journey the index already carries.

---

## 5. The restored corpus shows up in the prose

The 2026-08-17 corpus restoration ([color-corpus.md](./color-corpus.md);
843→920 display entries) feeds directly into R1 and the chip labels: a
restored name is now the nearest name for **5.5% of colours** (measured in the
color-utils.ts header). It is visible in this sample of ten: spot-check #1
names its second stop **"ugly blue"** (`#31668a`, xkcd survey, restored from
the taste filter) — "A rainbow gradient color palette running from dark brown
through ugly blue and sea to turquoise". That is the owner's stated intent
("unfiltered survey vocabulary"): the survey words people actually use are
back in headlines, descriptions, and the related-search frontier.

---

## 6. Verification

Full `apps/web` suite, 2026-08-17, working tree with the complete description
system: **38 files passed, 311 tests passed**; the only failures are the three
files that were failing before this work began and are out of scope
(`analytics.test.js` ×1, `export.test.js` ×1, `fit-bench.test.js` ×4 —
pre-existing, recorded in the spec as known failures).

`palette-prose.test.js` pins, permanently: byte determinism, R2/structure
byte-equality at 3/7/13/24 steps, number round-trip (every printed digit
claimed by a recompute rule — an unclaimed digit fails), solid-color veto,
no hex/view tokens in embedText, the length bands, per-structure template
coverage, the measure-first rates (±0.05pp), paragraph collisions only between
identical renders, skeleton floor, Jaccard bounds, relatedSearches
determinism/bounds/vocabulary membership, slug parity with `querySlug` over
every possible label (>900), and the one-analysis-pass contract of
`describePalette`.
