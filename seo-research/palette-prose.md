# Palette prose

Status: implemented, 2026-08-17 (naming system in cd3827e; the prose module
landed via the dd9be6c working-tree snapshot); consolidated 2026-08-18 after
five rounds of visual QA, the D19 colour-science correction and the D16/D20
human-register rewrite.

**Read §11 first.** It is the current state: the final measured distributions,
the vocabulary a translator has to carry, the chip ranking, the bundle cost and
the open decisions. §2's tables predate D19 and D20 and are kept only as the
record of what the first implementation measured. §7–§11 are the QA rounds in
order, each one recording what an image contradicted and which gate was moved.
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

> **SUPERSEDED by §11.5.** Everything in this section was measured before the
> D19 relative-saturation correction and before the D16/D20 human-register
> rewrite cut the paragraph from p50 660 to p50 292. It is kept as the record
> of the first implementation, not as current numbers.

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
| after the truth-lens fixes | 103.53 KB | **35.51 KB** | +10.11 KB vs baseline |
| after visual-QA round 2 (current) | 108.17 KB | **36.50 KB** | +11.10 KB vs baseline |

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


## 8. Visual QA round 2 (2026-08-18) — eighteen defects, fixed at the gate

Three graders read the rendered PNG beside the generated text again, on a
different slice of the fixture, and filed 18 failures (3 critical) and 11
minors. Same discipline: fix the rule that licenses the wrong claim, never the
seed. What moved:

| # | claim the image contradicted | root | fix |
|---|---|---|---|
| F1 | "It becomes warmer" on a blue → cyan → green ramp with red pinned at 0 | the stored `journey` tag reads temperature as red minus blue on the raw channels, which is not a direction on the hue circle | the journey rows need the run to ARRIVE: last chromatic hue inside the warm (or cool) arc |
| F2 | "The colors are dark and change little" beside "It travels the whole color wheel" | `low-key` is a claim about the VALUE range; the sentence said "colors" | says brightness now, and conflicts with the two motion rows that say the same thing |
| F3 | "dull red" for #bb401a, a burnt orange | the round-1 family tie-break moved the name across a band edge (h 36.6, 4.4° inside red) | a promotion must improve the HUE agreement, not merely match a band (see color-corpus §10) |
| F4 | "holds one red and changes ONLY how light it is" over a ramp that halves its colourfulness | `one-color` had no saturation-stability test | `denseSaturationRange < 0.35` (new feature) |
| F5 | chip "yellow" on a teal → green → olive palette | the family backfill called the hue-only `familyWord` | it calls `gatedFamily`, which converts (brown/purple/pink) or returns null |
| F6, F7 | "It jumps between separate groups of color" on two continuous sweeps | a gap in the hue histogram is not a break: the run crossed near-BLACK (L 0.08, C 0.05, 100% saturation, its own cluster) or simply moved fast | the `groups` row is RETIRED; all 6 fixture firings were continuous fades, and a visible-run guard leaves 0 |
| F8 | "dark yellow" for the brightest stop in its palette | a name's value word was never held against the stop | value-word gate at OkLab mid-gray (color-corpus §10) |
| F9 | chip "magenta" on a palette that never leaves L 0.85 | `gatedFamily`'s tint rung covered the red band only | the pink rung covers the magenta band too |
| F10 | "held within lavender blush" on a pastel wheel | `getUniqueColorNames` separations are OkLab distances, and hue differences vanish at low chroma | a family no chosen stop has is admitted whatever the distance (color-corpus §10) |
| F11 | "built on two opposite colors: almost black against faded orange" over one warm ramp | a near-black (L 0.203, C 0.023) was admitted as a cyan through the saturation branch of hue validity | the branch needs light: `SATURATION_BRANCH_LIGHTNESS` 0.5 |
| F12 | "two colors that meet through a gray middle" where the grays are the ENDS | the gate read `chromaticFraction`, a share of the whole run, and then asserted a position | `chromaValleyT` (new feature) decides which of two sentences |
| F13 | "lavender" for a plain gray-blue, beside "The colors are cool grays" | corpus entries were filed by absolute chroma only | the name side gets the D19 dual reading (color-corpus §10) |
| F14 | "Monochrome lavender to light gray" over a baby blue | the nearest BLUE name was three times the tie-break's reach away | reach 0.01 → 0.04, gated on improvement |
| F15 | "rainbow" on a purple → clay → green arc with no blue and no cyan | `RAINBOW_SPAN` was tuned for how FAR the hue travels, not where | a rainbow needs colour at both spectrum poles (`RAINBOW_POLE_SHARE` 0.10) |
| F16 | "It moves from blue into cyan" on an all-blue ramp | the end sits 1.5° inside cyan, and the eight families partition every hue | both ends must be confidently inside one band (`colorFamilies`, 8° margin) |
| F17 | "loops with no visible break" at a seam of 0.0398 (2.5 JND) | the registry's `SEAM_TOLERANCE` answers a conic-render question | the sentence takes one JND (`LOOP_SEAM` 0.02) |
| B01, B02 | "dark blue gray" on a 93%-saturated teal; "evergreen" on a dark olive | the same two naming roots as F3/F14 | color-corpus §10 |

Minors fixed the same way: the chip row demotes any name for a stop under
L 0.1 (a visually pure black measures C 0.053, so the D18 test never saw it);
a compound chip RETIRES its parts ("rainbow | dark rainbow | muted rainbow" was
three suggestions pretending to be six); "The colors move back and forth instead
of forward" lost a referent no reader has ("forward" meant spectral hue order)
and became "It returns to colors it has already passed through"; "All the colors
are blue" is vetoed when the identity sentence already said blue three times;
"It passes through several colors between its ends" is vetoed when the identity
already lists three names; the identity sentence names the END stop when the
endpoint rule had covered both ends with one name (it used to point "to" an
interior colour and shipped one hex instead of two); `strong` gained a relative
door, so a palette at 100% of its achievable chroma at every lightness is no
longer described as nothing at all; and `brightens`/`darkens` accept a ramp with
one small turn in it (`ARCH_DOMINANT` 0.8), which is how the widest fall in the
fixture (0.587) had gone undescribed.

**Not fixed, with evidence.** The `pastel` chip on the palette with a mustard
focal stop, again: the same statistic that would drop it (loudest tenth 0.138)
drops the owner's own pastel example (0.121), so there is no threshold between
them. Round 1 recorded the same finding; it stays recorded rather than forced.

### Re-measured after the round (867 seeds, default view)

| | round 1 | round 2 |
|---|---|---|
| structure: mono / duo / complementary / rainbow / analogous / multicolor / gray | 132 / 30 / 29 / 78 / 243 / 336 / 19 | 137 / 32 / 29 / 75 / 247 / 328 / 19 |
| paragraph length p0 / p50 / p95 / max | 212 / 291 / 329 / 363 | 200 / 295 / 330 / 363 |
| body (identity + impressions) p0 / p50 / max | 107 / 186 / 258 | 95 / 190 / 258 |
| one-impression descriptions | 22 | 52 (49 with one, 3 with none) |
| distinct skeletons | 581 | 581 |
| trigram Jaccard mean / max | 0.299 / 0.545 | 0.298 / 0.656 |
| identical paragraphs (same palette twice) | 3 | 3 |
| form sentence changed into a different one, 3/7/13/24 steps | 0 of 2,601 | 6 of 2,601, all inside the series family (50 appear/vanish) |
| whole selection step-invariant | 78.2% | 76.6% |
| distinct compound chips / rows carrying one | 33 / 172 | 34 / 178 |
| rendered stops renamed (cumulative, vs pre-QA) | 9.9% | 14.2% |
| palette names changed (vs round 1) | — | 343 of 867 |

Every impression prevalence, every measure-first rate and every registry
prevalence was re-measured and re-pinned; `palette-prose.test.js` and
`palette-name.test.js` fail on drift. Two registry-level notes: the D19 property
test now reads "never calls a LIGHT stop near its gamut ceiling achromatic",
with the dark half pinned by example (#00000f, #040000, #091a19), and
`several-colors` keeps the prevalence of the fact it states (37.8%) while its
redundancy rule lives in a new `restates` veto — putting the rule in the gate
made it a 5.75-bit rarity that outranked every other form row and changed which
form sentence a palette got between 3 and 13 steps.

## 9. Visual QA round 3 (2026-08-18) — ten defects, fixed at the gate

Three graders read the rendered PNG beside the generated text on a third slice
of the fixture and filed 10 majors and 11 minors. Same discipline: fix the rule
that licenses the wrong claim, never the seed.

| # | claim the image contradicted | root | fix |
|---|---|---|---|
| F1 | "brightest in the middle and darker at both ends" on a ramp that stays bright to its right edge | the `bright-middle` tag tested peak POSITION only; it never asked the ends | both dense ends must sit `MIDDLE_END_DROP` (0.25) of the palette's own range from the extreme, on the new `denseFirstLightness`/`denseLastLightness` features (dense, so the tag stays step-invariant) |
| F2 | "pastel red" on a vivid sunset, one sentence before "strong and clear" | the corpus is a survey vocabulary: xkcd's `pastel red` is #db5856, chroma 0.165, so a per-stop gate would delete the entry itself | `toneNameVeto` — a fired `vivid`/`neon` rules out pale name words and a fired `pastel`/`muted` rules out loud ones, through a new `veto` hook in `nearestNamed`. 12 fixture palettes carried one |
| F3 | "azure" for #ecffff, a white with a cyan tint | BASIC_COLORS claims its 41 names before the survey merge, so the corpus holds CSS azure (#f0ffff) and not the survey's #069af3, and the word could only ever name near-whites | `LOOKUP_ONLY` in color-utils: the entry still answers `colorNameToHex`/`isColorName` (the "teal, azure, navy" popular search and palette-tags both resolve it to #f0ffff) and never labels a stop. #ecffff names as "light cyan". Criterion, not instance: of the 17 near-white entries it is the only bare hue word |
| F4 | "Ivory to midnight to aqua marine" over an image whose middle is a bright orange and a deep red | farthest-point selection maximises OkLab distance and lightness dominates it, so an interior black wins every race | `edgeOfScale` demotion inside `getUniqueColorNames`: when the farthest candidate is only the edge of the value scale and a coloured stop also clears `minSeparation`, the coloured one wins. Ends are chosen before this runs, so "White to navy" is untouched |
| F5 | "the brightness barely changes" across 0.195 of lightness | the row was gated on `low-key`, which allows 0.3; its sibling `steady` correctly needs 0.12 | the row says what the tag establishes: "The colors stay dark from end to end." Gating on low-contrast instead would have retired it (5 of 48 low-key palettes qualify) |
| F6 | "The colors are warm grays" on a ramp whose ends are a cool lavender-white and a cool sage | `grayLean` read `meanHue` alone, and a chroma-weighted circular mean has a value even where the vectors cancel (this one: 50.8° out of stop hues 303, 329, 24, 75, 97, 124, 177) | new `hueConcentration` feature (circular R) with a 0.6 floor, a circular SD of ~58°, so the chromatic mass fits the 150° arc the lean names. Rate 3.58% → 2.88%, still inside the band |
| F7 | "It moves from pink into violet" on one purple ramp | `neighbors` asked only whether the two band WORDS differ, and two hues 30° apart can differ by straddling a line | the anchors must be one family apart (`NEIGHBOR_TRAVEL` = 360/8). Also a restatement veto: where the printed corpus name already commits to a family, the family word defers to it ("neon blue" vs "cyan") |
| F8a | "Its two colors sit on opposite sides of the color wheel" after "built on two opposite colors" | the R1 template and the form row never compared notes | `restates` on `opposite-colors`, keyed to the template's own condition (exactly two names). 28 fixture paragraphs said it twice |
| F8b | "Earthy" leading the title of a deep indigo against a lemon yellow at 93.5% of its achievable chroma | `EARTHY_CHROMA` bounds the MEAN, and a neutral middle (chroma 0.010) dragged it under | a stop at `VIVID_CHROMA` vetoes the word. 97 → 86 of 867. (`muted` needs no such veto: 0 of its 91 hold a stop that loud) |
| F9 | chips "red \| sun yellow \| yellow" on a palette whose left half is mint, cyan and cobalt | `relatedSearches` ranked inside `named.colorNames`, the two-to-four names the TITLE could fit | the row runs its own farthest-point selection over the stops with no ceiling, ranks by stop chroma, and spends what the structure can carry (`NAMES_FOR_STRUCTURE`). 623 of 867 palettes had a distinct stop name that could never reach the row |

Minors fixed the same way: `dark-strong` gained the per-stop FLOOR its sibling
`rich` got in round 2 (two stops rendering flat black are not "dark and
strong"), and `dark` picks up the fall-through through one shared `deepSpeaks`
predicate; the plateau rows band by share at `PLATEAU_DOMINANT` ("Most of it is
solid black" at 68.8%, "Part of it" at 12.5%); two compound chips may no longer
share a head word ("dark monochrome | muted monochrome"); a color chip that is
only a qualified form of another is dropped ("peach" beside "pale peach",
"yellow" beside "sun yellow"), with the MODIFIER words exempt because "pastel"
beside "pastel purple" is a tone hub beside a colour query; `hasColour` moved to
the dense sample so it cannot disagree with the `isGrayscale` it negates (the
same constant was answering yes and no 0.031 apart on one palette, which chipped
"pastel grayscale"); and three D20.4 repairs — the verb gap in the most common
sentence in the system ("Dark text works on its light end, and light text works
on its dark end", 52.3% of pages), the present-perfect stranded-preposition
clause ("It repeats colors from earlier in the gradient"), and the three
coordinating "and"s in the return-to-start identity ("through rust, eggplant
purple, and sapphire, and back to hospital green").

**Not fixed, with evidence.** One minor asked for a mint at 12.0% chroma to be
chipped on a seven-colour rainbow. The reported CAUSE is fixed (an off-white
cream at 7.3% was chipped while the mint was unavailable), and the mint now
reaches the row because the rainbow's name budget is four; but on a palette
where it ranked fifth the chroma ranking would still cut it, and that is the
ranking D18 asked for working correctly rather than a defect.

### Re-measured after the round (867 seeds, default view)

| | round 2 | round 3 |
|---|---|---|
| structure: mono / duo / complementary / rainbow / analogous / multicolor / gray | 137 / 32 / 29 / 75 / 247 / 328 / 19 | unchanged |
| paragraph length p0 / p50 / p95 / max | 200 / 295 / 330 / 363 | 200 / 294 / 333 / 367 |
| body (identity + impressions) p0 / p50 / max | 95 / 190 / 258 | 95 / 189 / 262 |
| one-impression descriptions | 52 | 58 (55 with one, 3 with none) |
| distinct skeletons | 581 | 593 |
| trigram Jaccard mean / max (200 LCG pairs) | 0.298 / 0.656 | 0.315 / 0.683 |
| identical paragraphs (same palette twice) | 3 | 3 |
| form sentence changed into a different one, 3/7/13/24 steps | 6 of 2,601 | 6 of 2,601 (35 appear/vanish) |
| whole selection step-invariant | 76.6% | 77.5% |
| distinct compound chips / rows carrying one | 34 / 178 | 30 / 169 |
| chip-row label count p50 / max | — | 4 / 6 (16 rows at the cap) |

Registry prevalences that moved: `bright-middle` 0.128 → 0.115, `dark-middle`
0.075 → 0.070, `earthy` 0.111 → 0.099, `muted` 0.110 → 0.108 (all at 13 steps,
the registry's own measurement view). Impression prevalences that moved: `gray`,
`tinted-gray`, `pale-soft`, `dark-strong`, `dark-even`, `dark`, `earthy`,
`light`, `neighbors`, `bright-middle`, `dark-middle`. `warm-gray`'s measure-first
rate 0.0358 → 0.0288, still above the 2% speaking floor. Every one is re-pinned
by `palette-prose.test.js` / `palette-name.test.js`, which fail on drift, and a
new suite (`visual QA round 3`) holds one regression assertion per finding
against the seed a grader looked at.

## 10. Visual QA round 4 (2026-08-18) — ten defects, fixed at the gate

Three graders read the rendered PNG beside the generated text on a fourth slice
of the fixture and filed 10 majors and 11 minors. Same discipline: fix the rule
that licenses the wrong claim, never the seed.

| # | claim the image contradicted | root | fix |
|---|---|---|---|
| X1 | "The colors are pale" on a saturated coral (#fda373, 97% of its achievable chroma) into a solid steel blue | `pastel` is a MEAN test and a near-white middle dragged the mean 0.001 under the bound; the `pale` row had no per-stop guard at all, and its sibling `pale-soft` had one whose ceiling sat at `NEON_CHROMA`, 2.7x the pastel line | `softChroma`'s max-stop ceiling becomes `PASTEL_CHROMA` (a claim about every stop takes the bound the mean has to clear) and `pale` takes the same guard. `pale-soft` 66 → 36 palettes, `pale` 5 → 1 |
| X2 | "The colors are light and strong at the same time" over three L 0.64 fire reds | `isBrilliant` carried a private bar of `meanLightness ≥ 0.7` while the registry's `LIGHT_LIGHTNESS` is 0.8, so the page said "light" on a palette whose own `light` tag had not fired | the detector takes the registry constant, and `bright-strong` gains a per-stop lightness FLOOR (`BRILLIANT_STOP_FLOOR` 0.65), the mirror of the ceiling `rich` took in round 2. Measure-first rate 8.3% → 2.19% |
| X3 | "It stays pale and soft from end to end" on a near-white that intensifies into a hot candy pink (C 0.202) | same `softChroma` ceiling | same fix |
| X4 | "It moves from yellow into pink" on a white → cream → peach → blush ramp with no yellow in it | D19's relative reading has no absolute floor beneath it: at L 0.9992 the gamut ceiling collapses, so C 0.0039 measures 100% saturation and cleared `FAMILY_SATURATION` | new `FAMILY_MIN_CHROMA` (0.01) under the saturation branch of the family gate. Swept over the fixture's 319 saturation-branch admissions it removes 5/8/8/14/23 at 0.005/0.008/0.01/0.015/0.02, and every stop it removes sits at L ≥ 0.98 |
| X5 | "from night blue (#000044) … to dark navy (#00003f)" one sentence before "Its two ends match" | the identity sentence's return branch tested NAME equality, so a colour-identity question was answered by a corpus lookup (the two ends measure 0.0104 apart) | `endsMatch` — the same `LOOP_SEAM` (one JND) the seam sentence already promises the eye. 20 fixture palettes have ends inside it and 5 were being given two names and two hex codes |
| X6 | "It is a single orange softened with gray" over a tan-to-mauve-gray ramp the paragraph itself called pinkish brown | the brown rung required L < 0.55 and an ABSOLUTE chroma window, which is the D19 conflation one level down: at L 0.35 chroma 0.13 is the whole gamut and at L 0.63 four fifths of it | a second rung on the relative reading: orange, below the registry's `LIGHT_LIGHTNESS`, under `BROWN_MAX_SATURATION` (0.6). Checked against the corpus, which is the survey's record of what people call these colours: of 586 orange-band stops the rung calls 174 brown and the corpus independently uses a brown/tan word for 139 (80%, against 78% for the dark rung alone), and every distinct stop it adds is named mocha, tan brown, light brown, adobe, mushroom, camel, taupe, peru or pinkish brown — none of them orange |
| X7 | "Dark text works on its light end" on a palette whose ends are a medium iris purple (3.46:1 under black text) and a near-black, with its only light stop in the middle | `darkInkReads`/`lightInkReads` read the extremes over ALL stops while the sentence attributes them to the ENDS | `endDarkInkReads`/`endLightInkReads` on the two end stops. The most common sentence in the system falls 453 → 371 palettes (52.3% → 42.8%) |
| X8 | "It repeats colors from earlier in the gradient" on a single continuous denim → periwinkle → orchid → electric violet sweep | the row spoke the `hue-wandering` tag, which measures the hue ANGLE turning back: this run returns to h 283 at C 0.247 where it had been at C 0.082 | new `colorReturn` feature — the smallest OkLab distance between dense samples a third of the ramp apart with a visible excursion (`RETURN_EXCURSION` 0.1) between them — and the row is gated on it, not on the tag. The excursion conjunct is what keeps a plateau from qualifying (a 46%-white duotone reads exactly 0 without it). 48 licensed palettes → 39 |
| X9 | "The colors are deep and intense" with a grayed denim teal at one end and a dull cocoa (C 0.052) at the other | `rich` bounded the stops' LIGHTNESS and left their chroma to a mean four saturated reds could carry | a per-stop chroma floor at the registry's `MUTED_CHROMA`: "deep and intense" and "muted" cannot both be true of one colour. 42 → 32 palettes |
| X10 | "purple brown (#6d3a33)" as title, meta, paragraph and top chip on a brick red-brown | nothing gated a hue WORD inside a corpus name; "purple brown" #673a3f measures h 13.2, in the RED band | `MISNAMED_LABEL` in color-utils, the `azure` mechanism with its own criterion: the three entries pairing a purple word with a brown one (#673a3f, #6b4247, #76424e) all sit in the red band, too orange-ward for purple and too red-ward for brown. The four entries pairing purple with RED stay, because their name names the band they are in. Closed on the LABEL side only; `colorNameToHex` still resolves all three, and `palette-name.test.js` re-derives the criterion from the corpus |

Minors fixed the same way. `PLATEAU_DOMINANT` moves to a majority (0.5): "Most
of it is solid white" was being said of a palette that is 45.8% white, and the
same constant decides whether the universal leads the chip row, so both stop at
the same line. `full-range` and `wavy` become the FLOOR of the motion slot,
deferring to `bright-middle`/`dark-middle` on the registry's own `implies`
argument — a symmetric arch was told "It uses the full range from dark to light"
because rarity puts that at 5.06 bits against the shape row's 3.12, and rarity
cannot express containment. The `loops` sentence drops its first clause ("Its
two ends match, so …"), which the X5 fix turned into a restatement of the
identity sentence on all 19 of its palettes. `wavy` is reworded from a turn count
("The brightness changes direction more than once") to what a viewer sees.

**The selection rule changed once, for the four minors that reported the same
shape**: a paragraph spending both sentences on ramp geometry while a true tone
impression went unsaid. One slot is now RESERVED for the tone slot (D20.5: "one
or two character sentences: what it feels like and how it moves"), because
rarity measures how often a fact is TRUE and not how much of the image it
describes. The three TEMPERATURE rows are excluded from the reserve: `warm` and
`cool` were already documented as the floor of the tone slot, and `warm-and-cool`
belongs with them by measurement (2.13 bits, the least informative row in the
table — reserving for it cost a rainbow "It travels the whole color wheel").
Measured before the reserve, 141 of 867 palettes (16.3%) had a true non-floor
tone impression that never reached the page; after, 0.

**Not fixed, with evidence.** Two minors are corpus-vocabulary defects of a kind
this round's machinery does not reach. "greenish beige" for #c9e276 (L 0.871,
C 0.137, a clear light lime) and "deep aqua" for #597475 (C 0.031 against the
entry's 0.087) are TONE words buried inside corpus names; `toneNameVeto` reads
the palette's tone and `valueWordFits` reads lightness, and neither asks whether
a name's saturation word survives the transfer to the stop. Fixing it needs a
saturation-word gate on the corpus, measured the way the value-word gate was —
it is a round of its own, not a threshold move. The third, a duotone whose cyan
half never chips (structure caps colour names at 2 and chroma rank spends both on
the magenta corner), is `NAMES_FOR_STRUCTURE` working as designed; giving the
chip row a hue-diversity rule is a change to what the cap means.

### Re-measured after the round (867 seeds, default view)

| | round 3 | round 4 |
|---|---|---|
| structure: mono / duo / complementary / rainbow / analogous / multicolor / gray | 137 / 32 / 29 / 75 / 247 / 328 / 19 | unchanged |
| paragraph length p0 / p50 / p95 / max | 200 / 294 / 333 / 367 | 198 / 292 / 328 / 351 |
| body (identity + impressions) p0 / p50 / max | 95 / 189 / 262 | 93 / 187 / 246 |
| one-impression descriptions | 58 (55 with one, 3 with none) | 81 (76 with one, 5 with none) |
| distinct skeletons | 593 | 586 |
| trigram Jaccard mean / max (200 LCG pairs) | 0.315 / 0.683 | 0.318 / 0.683 |
| identical paragraphs (same palette twice) | 3 | 3 |
| whole selection step-invariant (100 seeds × 3/7/13/24) | 77.5% | 77.0% (4 form flips, 4 appear/vanish in 300 re-renders) |
| chip-row label count p50 / max / rows at the cap | 4 / 6 / 16 | 4 / 6 / 16 |
| `paletteFeatures` cost | — | 104.3 µs per palette, of which `colorReturn` is 4.5 µs (49.3 µs before the squared-distance rewrite: `Math.hypot` carries overflow-safe scaling three small components do not need) |

Impression prevalences that moved: `pale-soft` 0.0761 → 0.0415, `pale` 0.0058 →
0.0012, `bright-strong` 0.0773 → 0.0219, `rich` 0.0484 → 0.0369, `strong` 0.0796
→ 0.1153 (the tightened `isBrilliant` no longer shadows it), `one-color` 0.0588 →
0.06, `back-and-forth` 0.0554 → 0.045, `neighbors` 0.0588 → 0.0577, `full-range`
0.03 → 0.015, `wavy` 0.0946 → 0.0611, `light-background` 0.0854 → 0.0484,
`text-both-ends` 0.5225 → 0.4279. Measure-first: `brilliant` 0.083 → 0.0219,
which is a seat at the very bottom of the 2%–60% band and is recorded as such —
if a re-measure takes it under, the word becomes embedding-tail vocabulary and
`bright-strong` retires with it, which is the band contract working. Every one is
re-pinned by `palette-prose.test.js`, and a new suite (`visual QA round 4`) holds
one regression assertion per finding against the seed a grader looked at, each
generalised over the whole fixture where the rule is a general one.

---

## 11. Final consolidation (2026-08-18)

Round 5 of visual QA plus the full re-measure at the live wiring. **Everything
in §2 is superseded by the tables here**: those numbers were taken before the
D19 colour-science correction and before the D16/D20 human-register rewrite,
and both moved the corpus substantially. §2 is kept as the record of what the
first implementation measured.

Measurement harness: `seedPaletteText(renderPalette(seed))` over all 867
fixture seeds — the exact production call the seed page makes, `baseTags`
included. Earlier rounds measured `paletteProse` directly; the difference is
the journey wording, which is read only from the stored `analyzeCoefficients`
tags, so measuring without them described 71.2% of the corpus with the wrong
sentence.

### 11.1 The root colour-science bug: absolute chroma where relative saturation was required

The owner reported a palette the system called grayscale and a human would not:

```
#ceeaff #fcd3d4 #ffffed #ffffff #deffff #d5e3f6
```

Rendered, it is plainly blue, pink, cream and cyan. Classified, it was
`grayscale`: mean chroma 0.029, under `GRAYSCALE_CHROMA`, with half its stops
under `CHROMA_FLOOR` (0.03).

**The gamut-ceiling evidence.** Measured against the maximum chroma sRGB can
physically produce at each stop's own lightness and hue:

| stop | L | C | ceiling at (L, h) | share of ceiling |
|---|---|---|---|---|
| `#ceeaff` | 0.923 | 0.0412 | 0.0412 | **100%** |
| `#deffff` | 0.977 | 0.0340 | 0.0340 | **100%** |
| `#ffffed` | 0.995 | 0.0235 | 0.0235 | **100%** |
| `#fcd3d4` | 0.902 | 0.0461 | 0.0511 | **90%** |
| `#d5e3f6` | 0.911 | 0.0300 | 0.0435 | **69%** |
| `#ffffff` | 1.000 | 0 | 0 | white holds no chroma at any hue |

Four of the six stops sit **at** the sRGB boundary: there is no more colour to
be had at that lightness, and the palette is as saturated as a display can make
it. Absolute chroma saw 0.02–0.05 and called it gray. The
error is the saturation-vs-chroma conflation `research-colorTheory.md` §3/§9
warned about: the sRGB gamut is a lopsided solid — at L 0.92 it holds barely
C 0.04 in the blues, at L 0.5 it holds C 0.14, at the primaries' cusps more
than 0.3 — so one absolute threshold cannot serve both ends of the value scale.
Reading absolute chroma as "how much colour is here" calls every light tint gray.

**What moved.** `maxChromaFor(L, hue)` in `color-utils.ts` (binary search on the
OkLab → linear-sRGB matrices already there) and `relativeSaturation(color)` on
top of it; per-stop `S` attached in `paletteFeatures`, with
`meanSaturation` / `denseMeanSaturation` / `maxSaturation` and a
saturation-aware `chromaticFraction`. Then, descriptor by descriptor, on the
rule *identity questions take saturation, loudness questions take chroma*:

| gate | reading | why |
|---|---|---|
| hue validity (`stopHasHue`) | `C ≥ CHROMA_FLOOR` **OR** `S ≥ SATURATION_FLOOR` (0.35) above `SATURATION_BRANCH_LIGHTNESS` (0.5) | "is there colour here" is an identity question |
| `isGrayscale` | **both** `denseMeanChroma < GRAYSCALE_CHROMA` **and** `denseMeanSaturation < GRAYSCALE_SAT` (0.25) | a palette is neutral only when there is little chroma *and* little to be had |
| family gates | saturation branch, floored by `FAMILY_MIN_CHROMA` (0.01) | at L 0.999 the ceiling collapses and C 0.0039 measures 100% |
| brown rung | second rung on relative reading, `BROWN_MAX_SATURATION` 0.6 | at L 0.35 chroma 0.13 is the whole gamut; at L 0.63 it is four fifths |
| `pastel` | stays **absolute** | "light and low chroma" is the definition of the word |
| `vivid` / `neon` | stay **absolute** | "how loud is it" is a chroma question |

`SATURATION_BRANCH_LIGHTNESS` exists because the relative reading is wrong in
the dark too, symmetrically: a near-black `#091a19` measures 66% of its own
ceiling and reads as black beside a neutral of the same lightness. Below L 0.5
the ceiling is under `CHROMA_FLOOR` for 20 of 36 hues, so the floor removes the
dark half of the branch and keeps the light half, which is the half the bug
was in.

**No lookup table, deliberately.** Measured against exact bisection over 6,960
real stops: a 32×36 grid costs 14.2 ms to build and is 48% wrong at L 0.992
h 113 — it fails exactly at the cusps where this bug lives, because the ceiling
is a sharp tent in L there. Exact bisection is 360 ns per lookup, 61 lookups per
palette = 22 µs, nothing at load. `paletteFeatures` measures 81.2 µs per palette
with the lookups against 59.5 µs stubbed out, and the *pre-fix* module measured
78–83 µs: attaching saturation to the stops also removed a duplicate
hex → OkLCh conversion, which paid for the gamut work.

**Prevalences re-measured after it** (the registry contract says measured,
never estimated). Structure census, before → after the correction and the five
QA rounds:

| structure | §2 (pre-D19) | now | |
|---|---|---|---|
| multicolor | 238 (27.5%) | **328 (37.8%)** | tints that were grayscale/monochrome now carry hue |
| analogous | 252 (29.1%) | **247 (28.5%)** | |
| monochrome | 144 (16.6%) | **137 (15.8%)** | |
| rainbow | 117 (13.5%) | **75 (8.7%)** | dark stops no longer admitted as spurious clusters |
| duotone | 46 (5.3%) | **32 (3.7%)** | same |
| complementary | 46 (5.3%) | **29 (3.3%)** | the `almost black against faded orange` class |
| grayscale | 24 (2.8%) | **19 (2.2%)** | the reported bug |

`GRAYSCALE_SAT` swept over the fixture: 0.15 → 13, 0.20 → 18, **0.25 → 19**,
0.30 → 22, 0.35 → 23, 0.40 → 23. 0.25 sits in the flat middle; by 0.40 the
rescue is undone, below 0.20 it starts taking real grays.

### 11.2 The human-register rewrite (D16, then D20)

The owner read the live output and rejected it: *"way too technical … what i had
in mind a human readable description about the characters and make up of the
actual palette. and man i hate em dashes."* The paragraph he quoted:

> It is dark overall: lightness bends once between 0.08 and 0.68, warming as it
> runs, with mean chroma 0.07, most vivid mid-ramp. 48% of the run is pinned at
> the bottom of a channel … covers 209° of the hue circle — hues advance …
> 7.2:1 — clears the 4.5:1 WCAG AA threshold.

**D16 was not enough.** It removed the numbers but kept one clause per
technical fact, so the paragraph became a checklist of *translated*
measurements: "It is light. Hue spans a broad arc. Highlights clip." That is
still the analysis showing through, and the owner said so: *"the description
needs to be more like name in that the super technical stuff should inform the
simple language used and not be directly in the output"*, plus *"i have a global
audience it should use language that can be easily translated"*.

**D20: the name is the model.** `describePaletteName` works because it is
radically selective — dozens of facts computed, at most two spoken, the rest
only deciding which two. The description is the same discipline with a slightly
larger budget. Concretely:

- **Budget, not coverage.** 2 to 4 sentences. 49 IMPRESSION rows over 4 slots
  (tone 18, form 15, motion 12, use 4); at most one row per slot; at most two
  impressions spoken. A palette with nothing unusual gets a short description,
  which is correct rather than a failure.
- **Fuse facts into impressions.** A row is `{phrase, the conjunction of
  predicates that licenses it, its measured information}`. One human sentence
  may rest on five predicates at once. Ranking is `descriptorScore` — the same
  self-information the name ranks by.
- **Ban the analysis vocabulary outright.** 47 banned tokens, scanned over
  every paragraph, meta and embed body in the fixture.
- **Translation-friendly English.** Short common concrete words, simple present,
  SVO, one idea per clause, sentences under 15 words, no phrasal verb where a
  single verb exists, no idiom that does not travel. When a vivid phrase and a
  plain phrase are both true, the plain one ships.

Same palette, same facts, after:

> A muted gradient color palette running from dark maroon (#2a161b) through
> black to deep brown (#420000). The colors stay dark from end to end. Most of
> it is solid black. Shown here as a linear gradient in 7 steps at 90°, with the
> hex codes, CSS, and SVG ready to copy below.

Every fact in the original is still *computed*; "48% of the run is pinned at the
bottom of a channel" is still what licenses "Most of it is solid black", and the
`crushed-shadows` / `low-key` / `hue-reversing` tags still ride the embedding.
None of it reaches the reader as a measurement.

The identity sentence kept its shape (the owner approved it live and objected
only to what followed) and kept the end hex codes, which are demand-bearing
named-hex text.

**What translatability cost, concretely.** The identity verb was four words
keyed to ramp shape: *easing, arcing, weaving, winding, circling*. Every one is
an English motion idiom whose dictionary translation means something else —
"easing from marine to soft blue" comes back as *aliviar* / *soulager* /
*erleichtern*, i.e. "relieving". It is now two words, `sweeping` and `running`,
split on whether the ramp travels the value scale. The shape those verbs encoded
is not lost; the motion impressions say it in words a translator can carry.

### 11.3 The translation surface

The full distinct vocabulary of all 867 descriptions, with the palettes' own
colour names removed (those come from the corpus and localize separately).
**167 words.** This is the entire surface a translator has to handle:

```
a against all almost an and are areas as at autumn back background barely
becomes behind below between black blue both break bright brightest brightness
brown built change changes clear codes color colorless colors cool cooler copy
css cyan dark darkened darker darkest deep duotone earlier earthy end ends
enough every export fade fades from full gets gradient gray grays grayscale
green held here hex holds how in intense into is it its light lightened lighter
like linear little look loops magenta many middle monochrome more most mostly
moves muted nearly neon next no ocean of on once one only opposite or orange
other pairing pale palette part passes pastel pink png purple rainbow range
ready red renders repeats return running runs same several shown sides single
sit sits soft softened solid start stay stays steps stop strong strongest
sunset svg sweeping text than that the them through time to travels two under
uses very violet visible warm warmer wheel while white whole with within works
yellow
```

451 distinct words including colour names; **635 distinct colour names** are
used across the corpus, all from `color-utils.ts`'s 919-entry display corpus.
The test pins this: every word a description can contain must appear in a
reviewed `ALLOWED_WORDS` list, so a new phrasing is a deliberate act rather than
a drive-by.

### 11.4 Tag ranking and compounds (D18, D17)

The owner's report: *"white isnt a good suggested tag for this palette. this
system needs work"* — a pastel white → warm gray → peach palette chipping
`white / warm gray / peach / pastel / rainbow`.

Diagnosis: labels were ranked colour-names-first in **ramp order**, so an
achromatic endpoint outranked everything while carrying almost no information.
Huge shares of the corpus pass through white and black; an extreme-lightness
achromatic stop describes the *edge* of the run, not the palette.

Ranking now:

1. **Colour names by the chroma of the stop each one names**, descending, ties
   by ramp order. Identity lives in the chromatic stops. Capped by structure
   (`NAMES_FOR_STRUCTURE`: 2 for monochrome/duotone, 3 for analogous/multicolor,
   4 for rainbow) — without a cap, six near-synonyms from one ramp fill the row.
2. **Compounds** (D17), at most 2 of the 6.
3. **Single modifier words** by `descriptorScore`.
4. **Family words** as backfill below three labels.

Demoted to last resort (used only when fewer than two better labels exist):
a name whose stop is achromatic *and* extreme in lightness (`C < CHROMA_FLOOR`
with `L > 0.9` or `L < 0.1`), and the four bare universals `white / black /
gray / grey`. The exception is `PLATEAU_DOMINANT` (0.5): when a majority of the
run renders pure black or pure white, the universal stops being the ramp's edge
and becomes its subject — the palette whose run is mostly `#000000` (5 of its 7
rendered stops) correctly leads with `black`. That constant also decides "Most of it is solid black" vs "Part of it",
so the word and the chip cannot disagree.

A compound also **retires its parts**: a row reading `rainbow | dark rainbow |
dark` spends three of six chips on two words, which is three suggestions
pretending to be three ideas. And no two compounds
may share a head, which stopped `dark monochrome | muted monochrome`.

Measured over the fixture:

| | value |
|---|---|
| chips per page | min 2, p50 **4**, max 6, mean 3.66 |
| distinct chip labels | **688** (= the whole crawl frontier this creates) |
| distinct compounds | **30**, appearing on 169 of 867 rows |

The 30 compounds, in full — the bounded grammar is (tone ∪ temperature) ×
(family ∪ structure), never three words, never a colour name, never free text,
with `CONTRADICTED_BY` pairs excluded by construction:

```
dark autumn        dark complementary  dark duotone      dark grayscale
dark monochrome    dark ocean          dark rainbow      dark sunset
earthy autumn      earthy complementary earthy duotone   earthy monochrome
earthy rainbow     earthy sunset       muted complementary muted duotone
muted monochrome   muted rainbow       neon autumn       neon duotone
neon monochrome    neon ocean          neon rainbow      neon sunset
pastel complementary pastel duotone    pastel monochrome pastel ocean
pastel rainbow     pastel sunset
```

Top 20 chips by page count:

| label | pages | | label | pages |
|---|---|---|---|---|
| sunset | 83 | | pastel | 42 |
| monochrome | 82 | | dark indigo | 22 |
| ocean | 66 | | sapphire | 20 |
| muted | 65 | | autumn | 18 |
| rainbow | 53 | | charcoal gray | 17 |
| earthy | 52 | | warm blue | 17 |
| dark | 47 | | dark blue gray | 15 |
| neon | 42 | | dark monochrome | 15 |
| | | | indigo | 15 |
| | | | muted duotone | 15 |
| | | | sand | 15 |
| | | | twilight | 15 |

Compared with the pre-D18 row (§2), the head thinned considerably —
`monochrome` fell 144 → 82, `dark` 97 → 47 — and `black` and `almost black`
left the top 20 entirely. That is the demotion working: generic labels now
appear only where they are the palette's subject.

### 11.5 Final measured distributions (867 seeds, live wiring)

| surface | min | p10 | p25 | p50 | p75 | p90 | p95 | p99 | max | mean |
|---|---|---|---|---|---|---|---|---|---|---|
| paragraph | 198 | 261 | 275 | **292** | 309 | 323 | 328 | 338 | 351 | 290.9 |
| body (identity + impressions, no view sentence) | 93 | 156 | 170 | **187** | 204 | 218 | 223 | 233 | 246 | 185.9 |
| metaDescription | 97 | 107 | 115 | **121** | 127 | 136 | 143 | 152 | 159 | 121.6 |
| embedText | 158 | 264 | 293 | **328** | 363 | 397 | 407 | 447 | 469 | 328.4 |

The paragraph fell from p50 660 (§2) to p50 292. D20's target is "roughly 150 to
400 characters"; the body — which is what that target is about, since the view
sentence is a page surface that never reaches `embedText` — sits at p50 187,
max 246. Bounds asserted by the test: paragraph 180–420, meta ≤160, embed ≤1600.

| shape | measured |
|---|---|
| sentences per paragraph | 2 → 5 seeds, 3 → 76, 4 → 786; mean **3.90** |
| impressions spent | 0 → 5 seeds, 1 → 76, 2 → **786** |

Five palettes say nothing beyond their identity and view sentence, and that is
the budget rule working: they are solid colours, where every other slot would
describe a gradient that is not there.

**The templated-page test:**

| metric | measured | acceptance |
|---|---|---|
| identical paragraphs | **3 pairs, each the same palette twice** (applied coeffs differ below the 3-decimal quantum; renders agree to ≤1 8-bit step on one channel of one stop, asserted per-pair in OkLab) | collisions only between identical renders |
| distinct stripped skeletons (hex, digits, the palette's own colour names, family words removed) | **571** of 867 | ≥50 |
| word-trigram Jaccard, 200 LCG pairs | mean **0.309**, max **0.656** | mean <0.35, max <0.80 |
| "gradient color palette" in every identity sentence | 867/867 | required |

Jaccard rose from 0.209 (§2) because the shared view sentence is a much larger
share of a 292-character paragraph than of a 660-character one. It still clears
the bound the long paragraphs met, and the skeleton count (571 against a floor
of 50) says the variety is structural, not filler. D16.5 permitted relaxing to
mean <0.40 / max <0.85 if needed; it was not needed and the original bound
stands.

**The three scans, over all 867 paragraphs, metas, embed bodies and identity
sentences:**

| scan | hits |
|---|---|
| em dashes (U+2014) and en dashes (U+2013) | **0** |
| the 47 banned analysis tokens | **0** |
| any digit outside the identity hexes and the view sentence's steps/angle | **0** |

All three are pinned by `palette-prose.test.js`, so they are enforced by the
build rather than by care.

### 11.6 Island bundle cost (D10), re-measured

`pnpm build` in `apps/web`, vite 7.3.0, node 25:

| build | edit chunk raw | gzip | vs baseline |
|---|---|---|---|
| pre-prose baseline (palette-modifiers.md "Client cost") | 76.11 KB | 25.40 KB | — |
| description system as first shipped | 102.64 KB | 35.15 KB | +9.75 KB |
| after visual-QA round 2 | 108.17 KB | 36.50 KB | +11.10 KB |
| **final (round 5)** | **112.43 KB** | **37.96 KB** | **+12.56 KB** |
| same final build, `palette-prose.ts` stubbed | 91.47 KB | 30.96 KB | prose module alone = **+7.00 KB** |

**The +4 KB budget is exceeded, ~3.1×, and this remains an open owner
decision.** The breakdown: `palette-prose.ts` itself is 7.00 KB gzip (it is
~straight string data — 48 impression rows plus the sentence tables); the other
5.56 KB is the D8 corpus restore (~1.3 KiB, separately budgeted), the
`palette-tags` import that `baseTags` parity requires, the D13 chip-row wiring
and the D19 gamut code. The island stays lazily loaded and `entry` is unchanged
at 62.89 KB gzip, so this is not on the critical path for a first paint; the
cost lands only when a visitor opens the editor. The only real lever is dieting
the impression tables, which is a quality decision, not a mechanical one.

### 11.7 Visual QA: methodology and results

The loop that produced rounds 1–5, and the one worth keeping:

1. Pick seeds **stratified** over the axes that can be wrong — the seven
   structure classes, and the tone extremes (lightest, darkest, most and least
   saturated, highest chroma, pastel, and a *typical* mid-corpus palette, which
   catches what the extremes hide).
2. Render the palette to a PNG (smooth band on top, the discrete stops below)
   and **look at it** beside the generated title, paragraph and chips.
3. Grade each on four questions: is every claim **true of the image**; does it
   read as a **human** wrote it; would it **translate**; is it **selective**
   (did the budget go to the most characterising facts, or to restatement)?
4. Fix every failure **at the gate that licensed the wrong claim**, never on the
   seed. Then re-measure the affected prevalence over the whole fixture, and add
   a regression assertion: the specific seed a grader looked at, plus the general
   property over all 867 where the rule is a general one.

Five rounds, 181 graded palettes, 53 failures and 44 minors, every one fixed at
the gate (two minors were refused with evidence in round 1): rounds 1–4 are
§7–§10. Round 5 read 13 palettes and found two, both in
the same sentence:

| # | claim the image contradicted | root | fix |
|---|---|---|---|
| **R5-1** | "Its two colors fade through **gray** between them" on a gunmetal → cinnamon duotone whose middle stops render `#000007` and `#000020` | the row measured *where* the crossing sits (`chromaValleyT`) and *how much* colour surrounds it, but the WORD was assumed. Black and white are the ends of the gray scale and no reader calls either of them gray | new feature `chromaValleyL` (the lightness of the least chromatic dense sample); the sentence names the neutral from it. `NEAR_WHITE_L` (0.87) could not serve — it is an end-band threshold, and at 0.876 it called a `#dbdcd1` crossing "white". New `CROSSING_WHITE_L` (0.93), anchored by walking the neutral axis through `hexToColorName`: the corpus says gainsboro at L 0.882 and white smoke at L 0.934, so 0.93 is where its own gray names run out |
| **R5-2** | "Its two colors fade through black between them. **It is darkest in the middle and lighter at both ends.**" — one fact spending the entire two-sentence budget | naming the neutral turned the form row into a shape claim, and the shape row then restated it. A static `conflicts` list cannot express this: the *gray* branch says nothing about value and must not silence a shape the reader can genuinely see | new `conflictsIn?: (c: Ctx) => readonly string[]` — a conflict veto that depends on which sentence the row will produce. `duotoneCrossing(c)` decides the branch once, for both `say` and `conflictsIn`, so they cannot drift |

Measured after: of the 29 fixture rows that speak the duotone form sentence, 26
cross a gray, 2 a black, 1 a white; exactly 1 palette reaches the new veto, and
it trades the restated shape for a fact the reader could not otherwise have
("It holds warm and cool colors at the same time"). Both are pinned by a new
`visual QA round 5` suite, the second as a property over the whole fixture.

The other eleven palettes read clean. Two observations that are **not** defects
and are recorded so a future round does not re-litigate them:

- On a green → teal → blue → violet → magenta rainbow, the chips lead with
  `bright magenta` and `bright violet` and never say green, although the
  identity sentence opens on shamrock green. That is D18 ranking by stop chroma,
  working as specified — and `neon rainbow` carries the whole-palette idea.
- The chip row can say `complementary` while the paragraph says "duotone …
  built on two opposite colors". Deliberate: D20.3 bans the scheme jargon from
  the *description*, but the chips are query labels pointing at
  `/palettes/complementary`, which is real registry vocabulary and a real route.
  Renaming the chip would change the route target.

### 11.8 Standing reindex-gated items

Unchanged from §4 and still **not shipped** — three riders on ONE Vectorize
rebuild, which must go together:

1. Index text → `paletteEmbedText()`.
2. Query-side mirror in `normalizeSemanticQuery`'s seed branch (names-only
   until #1 ships; enriching one side alone degrades matching).
3. `texture:'monochrome'` → `'grayscale'` correction in palette-tags.

Two riders added by this work:

4. **Write `modifierTags` into Vectorize metadata** (filterable). That enables
   constraint + semantic compound retrieval in the v2 search route — "pastel"
   as a filter × "rainbow" as an embedding — which is what makes the D17
   compound chips land on genuinely matching corpora.
5. **Compound pages graduate on demand.** Compound queries are score-gated to
   `noindex,follow` today (not curated, not colour names) and still render and
   edge-cache. After the reindex the embed text literally contains both words,
   so exactly the compound pages with matching corpora clear
   `PUBLISHABLE_SCORE` and become indexable, self-selecting on quality. Top
   compounds by GSC demand can then be promoted into
   `PUBLISHABLE_QUERIES`/`sitemap-searches` as an owner decision.

Until the reindex, the page paragraph, meta description, JSON-LD, `/{seed}.json`
and the chip row are all live and true; only *retrieval* waits.

### 11.9 Suite state

`apps/web`, full run: **38 files passed, 358 tests passed; 3 files failed, 6
tests failed** — `analytics.test.js` (×1), `export.test.js` (×1) and
`fit-bench.test.js` (×4), all three failing before this work began and recorded
in the spec as out of scope. No other file is red.
