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
vocabularies only (corpus names ∪ registry spoken words ∪ the 8 family-anchor
words), so the crawl frontier is finite by construction.

Two composition rules added by the 2026-08-17 truth-lens pass:

- **Family words are the gate-free eight** (red/orange/yellow/green/cyan/blue/
  violet/magenta — the registry's measured anchors). The original 12-anchor
  list included gold, teal, sky, pink and purple, which are anchor+tone-gate
  NAMES (pink/sky are tint regions, L > 0.75; gold needs L 0.8–0.92) — chosen
  by hue alone they named dark palettes after tints on 29 live pages ("around
  pink" at region L 0.45). Family words name where on the wheel, never how
  light; the gated names remain the color-name corpus's job.
- **`baseTags` defaults inside the module** from the same
  `tagsToArray(analyzeCoefficients(...))` import the server and island pass
  explicitly, so `describePalette`/`paletteProse` produce the page's paragraph
  (journey wording included) for every caller — previously the canonical API
  silently returned a journey-less variant on 71.2% of palettes.

The page ladder drops R4 clauses from the end (least-informative survivor
first), then R2 extras, until the paragraph fits 800. `embedText` is never
trimmed — retrieval wants every true clause — and its ceiling was never
approached (max 1,247 of 1,600).

---

## 2. Measured distributions (867 seeds, default view)

### Lengths (chars) — re-measured after the truth-lens rewording pass

| surface | p5 | p25 | p50 | p75 | p95 | max | bound |
|---|---|---|---|---|---|---|---|
| paragraph | 506 | 594 | 660 | 715 | 777 | 800 | target 350–800; test ≤900 |
| metaDescription | 99 | 111 | 120 | 128 | 147 | 158 | ≤160 |
| embedText | 503 | 617 | 706 | 792 | 936 | 1,142 | ≤1,600 |

Paragraph min 353. The rewording pass (equalC-gated cycles clause, floored
WCAG print, journey-only Tags merge) shortened the over-800 tail to zero —
every paragraph now fits the 350–800 target. embedText shrank ~100 chars at
the tail because the Tags line no longer carries the whole base-tag list
(see §4).

### The templated-page test

| metric | measured | acceptance |
|---|---|---|
| identical paragraphs | 2 pairs, **both are the same palette twice** (applied coeffs differ ≤4e-4, byte-identical renders): `…IVesvowngA`/`…IV` and `…NFdKuu5rgG`/`…NL` | collisions only between identical renders |
| distinct stripped skeletons (digits/hex/color names/family words removed) | **836** of 867 | ≥50 |
| word-trigram Jaccard, 200 LCG-sampled pairs | mean **0.209**, max **0.431** | mean <0.35, max <0.80 |
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

### Island bundle cost (the D10 before/after, recorded late)

The spec required a before/after gzip measurement of the edit island chunk
with a **+4 KB gzip budget**; the measurement was skipped at ship time and is
recorded here from the review pass (vite 7.3.0, `pnpm build` in apps/web):

| build | edit chunk raw | gzip | delta |
|---|---|---|---|
| pre-prose baseline (palette-modifiers.md "Client cost") | 76.11 KB | 25.40 KB | — |
| description system as shipped | 102.64 KB | 35.15 KB | +9.75 KB |
| same build with palette-prose stubbed (review isolation) | 87.06 KB | 29.08 KB | prose graph alone = **+6.07 KB** |
| after the truth-lens fixes (current) | 103.53 KB | **35.51 KB** | +10.11 KB vs baseline |

**The +4 KB budget is exceeded** (~2.5×). Known contributors beyond the prose
string tables: the D8 corpus restore (~+1.3 KiB, separately budgeted), the
palette-tags import that baseTags parity requires (already in the island graph
for other reasons), and the D13 chip-row wiring. The island stays lazy-loaded
and the editor was already shipping the 920-name corpus, but the budget
decision was never put to the owner — **open owner decision**: accept the
overshoot, or diet the prose tables (the only real lever; the module is
~straight string data).

### Truth-lens rewording pass (2026-08-17, after the adversarial review)

Fourteen verified findings were fixed in place; every change is a wording or
gate correction, no detector thresholds moved (measure-first rates pinned by
the test are byte-identical). The load-bearing ones:

- muted/pastel chroma bounds say **"mean chroma"** (the tests bound the mean;
  stops peak past the printed bound on 91 pages).
- static temperature reads **"warm/cool overall"**, never "throughout" (mean-
  hue claim; 124 pages held ≥25% opposite-pole mass).
- bare dark lead reads **"dark overall"** ("throughout" stays with the key
  words, whose tests bound the spread).
- "spanning deep shadow to near-white" now requires both endpoints in their
  bands (L < 0.18 / > 0.87); otherwise "crossing most of the value scale".
- "high-key and soft" / "A soft wash…" gated on chroma (soft is a chroma
  claim); vivid high-key palettes read "brilliant…" / "A bright, even field…".
- ombré's "hue held steady" is monochrome-only; analogous ombrés read "the
  hue confined to its own neighborhood".
- multicolor R2: "Hue **spans** N° in one connected **arc**" (span number
  under a span verb), connected wording only for the single-cluster case;
  multi-cluster palettes read "falls into N separate clusters…".
- rainbow cycles clause requires **equalC** (unequal frequencies are a
  non-repeating Lissajous — nothing repeats).
- grayscale R2's per-stop wording only when chromaticFraction = 0; otherwise
  the measured fraction is stated ("Color registers on only N% of the run…").
- WCAG ratio prints **floored**; clears/short runs on the raw ratio (no false
  conformance at 4.45–4.4999).
- family words = the gate-free eight anchors (see §1).
- embedText Tags line merges only the stored **journey** value from base tags
  (see §4).
- `baseTags` defaults inside the module → `describePalette` = page text.
- exported-API guards: empty `hexColors` renders the two real end stops
  instead of fabricating #000000; `hueBandShare` folds its edges onto the bin
  ring (a band edge in (355, 360] used to loop forever).

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
| `_gA7fche-agS_…` | analogous | PASS | the tension this row originally flagged (ombré's "hue held steady" beside R2's measured drift) is CLOSED: the steady wording is now monochrome-only, analogous ombrés read "the hue confined to its own neighborhood" |
| `_gIogJNgJ2gIP…` | multicolor | PASS | ratio 4.4668 now prints **floored** ("4.4:1, short of") — the earlier round-half-up print ("4.5:1 — clears") was a false AA-conformance claim; floor keeps print, verdict and the wcag-aa tag consistent (floor(x·10)/10 ≥ 4.5 ⟺ x ≥ 4.5) |
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
   composition: prose body (no R6, no hex) + `Tags:` (modifierTags ∪ the
   stored **journey** value ∪ sub-band tail words like sepia/warm-gray) +
   `Colors:` (≤6). From the base tags only journey rides along — the one axis
   the registry lacks; merging the whole list echoed the legacy
   `texture:'monochrome'` (a saturation claim) beside the structural
   vocabulary where monochrome means one hue, reintroducing at index time the
   exact collision this reindex corrects. Base colors are carried by the
   Colors line, warmth/contrast by the registry words. Today's index was
   embedded from `palette-tags` text and has never seen this vocabulary.
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

---

## 7. Visual QA round 1 (2026-08-18) — thirteen defects, fixed at the gate

Three graders read the rendered PNG beside the generated text for a stratified
sample of the fixture and filed 13 failures and 11 minors. Every one was fixed
where the wrong claim is licensed, never on the seed. What moved:

| # | claim the image contradicted | root | fix |
|---|---|---|---|
| F1 | "dark brown (#1c1b24)" on a cold near-black | `nearestNamed` is an unweighted OkLab NN; "dark brown" won by 0.0054, a quarter of a JND | family tie-break inside half a JND (`NAME_TIE`), colour class from both readings |
| F2 | "beige" on a pale yellow-green | same | same (won by 0.0063) |
| F3 | "The red fades from light to dark" over a cream end | `fade` named the family from the MEAN hue while the ends sat in two bands | ends must share a band; else the neighbors row speaks |
| F4 | "one range of magenta" on a lavender-to-plum purple | no `purple` in the family words (sRGB purple IS magenta hue) | `gatedFamily`: purple = dark magenta, per research §1.2 |
| F5 | "It holds one orange" on chocolate-to-cream | brown deliberately excluded from the band vocabulary | `gatedFamily`: brown = dark low-chroma orange |
| F6 | "two colors and skips everything between them" over a 46% white block | hue clustering cannot see achromatic samples; no white twin to `pure-black-plateau` | `pure-white-plateau` descriptor + `white-block` impression + plateau veto on `two-colors` |
| F7 | chips "deep brown / dark brown / dark" on a 69%-black palette | D18's universal demotion inverts when the universal IS the palette | dominant-plateau label leads the row above 40% |
| F8 | "duotone … skips everything between them" over a continuous 7-hue sweep | `DUOTONE_CLUSTER_WIDTH` 60° let a cluster be wider than the gap defining a cluster | width bound is now `CLUSTER_GAP` (40°) |
| F9 | "rainbow" over teal → red → brown with a 161° hole | the ladder fell through to a span test whenever two clusters failed the width bound | `rainbow` is a one-cluster classification |
| F10 | "deep and intense" over periwinkle and light orchid | `isJewel` bounds the MEAN at 0.6; the ramp reached 0.72 | stops must stay under `JEWEL_STOP_CEILING` 0.7 |
| F11 | "neon" from a single electric stop (4.2% of the run) | `maxChroma` is one sample | the loudest tenth (`denseChromaP90`) must clear `NEON_CHROMA` too |
| F12 | "a single orange" on a cream-to-taupe ramp at C 0.034 | a family word was a hue lookup with no floor | `gatedFamily` returns null under `FAMILY_CHROMA`/`FAMILY_SATURATION`; the row stays silent |
| F13 | "sunset" on a cream-to-magenta bubblegum ramp | the 300°-100° band test never checked the warm half was occupied | `SUNSET_WARM_SHARE`: ≥10% of the chromatic mass in 20°-100° |

Minors fixed the same way: the temperature sentence now needs most of the
chromatic mass inside the arc (a purple 5° inside the warm boundary said "the
colors are warm"); `one-color` conflicts with the direction and journey rows
(it claims "only how light it is"); the identity verbs are down to `running`
and `sweeping` (D20.4 — "easing" translates as *to relieve*); the neighbors row
dropped "and stays there", which nothing in its gate established; "macaroni and
cheese" became a lookup alias (a dish, not a colour word); `pink` joined brown
and purple as a tone gate, so a stop the corpus calls "pinkish gray" is no
longer announced as red; and `warm-gray` reached prose because its detector was
carrying the same absolute-chroma ceiling D19 exists to remove (2.0% → 3.6%).

**Not fixed, with evidence.** (a) A turquoise ramp still reads "one green":
h 164 is inside the green band, whose edge is 168.5, and the fix would need the
full gated-name table (turquoise/mint/teal) that the family-word comment
deliberately rejects — a band-edge dispute, not a tone gate. (b) The `pastel`
chip on a palette with a mustard focal stop: a peak-chroma ceiling that catches
it (p90 0.138) also catches the palette the OWNER called pastel (p90 0.121), so
the statistic does not separate them and the mean gate stays as D19.5 recorded
it.

### Re-measured after the round (867 seeds, default view)

| | before | after |
|---|---|---|
| structure: duotone / complementary / rainbow / multicolor | 46 / 47 / 121 / 259 | 30 / 29 / 78 / 336 |
| neon (13 steps) | 85 (9.8%) | 71 (8.2%) |
| sunset (13 steps) | 134 (15.5%) | 117 (13.5%) |
| paragraph length p0 / p50 / p95 / max | 237 / 293 / 327 / 358 | 212 / 291 / 329 / 363 |
| one-impression descriptions | 6 | 22 |
| distinct skeletons | 568 | 581 |
| trigram Jaccard mean / max | 0.285 / 0.550 | 0.299 / 0.545 |
| identical paragraphs (same palette twice) | 3 | 3 |
| form sentence changed across 3/7/13/24 steps | 0 of 2,601 | 0 of 2,601 |
| whole selection step-invariant | 77.0% | 78.2% |
| distinct compound chips / rows carrying one | 34 / 217 | 33 / 172 |

Every impression prevalence and every registry prevalence was re-measured and
re-pinned; `palette-prose.test.js` and `palette-name.test.js` fail on drift.
The rainbow fixture seed in `palette-name.test.js` was replaced (the old one
renders brown → sage → teal → navy, which is why it stopped classifying as a
rainbow).

### Naming: what the tie-break costs

9.9% of the fixture's 5,895 distinct rendered stops get a different name. Nearly
all are lateral ("grayblue" → "bluegray", "terra cotta" → "terracotta", "misty
rose" → "gainsboro" on a warm off-white); the ones that matter are the category
errors the graders caught. At a full JND the churn is 15.7% and starts moving
names that were not in dispute, which is why the window is half.

