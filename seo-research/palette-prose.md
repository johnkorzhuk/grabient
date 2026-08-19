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
replaces that line with a deterministic paragraph in which every clause is a
`(predicate, template)` pair over measured features — no free-text path — plus a
related-searches chip row derived from the same facts.

**Where the paragraph goes (D22.A, 2026-08-18).** It was rendered on the seed
page for one day and is not any more: the owner did not want generated prose
under the editor, and the chip row is the surface a visitor is meant to use. The
paragraph still ships to the `<meta name="description">` (via `metaDescription`),
the JSON-LD `description`/`abstract`, `/{seed}.json` and `paletteEmbedText`, so
every measurement below still gates a live surface — the reader is a crawler,
a snippet and an embedding rather than a visitor. Two consequences recorded
here because they are easy to get wrong later: the text must stay TRUE (nothing
relaxes because nobody sees it), and `BUDGET` went back to 2 (D21's expert-voice
length was for a reader that no longer exists; the enlarged IMPRESSIONS table
stays and now competes for two slots).

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
| `paragraph` | R1(end hexes) + R2..R5 + [R7] + R6, ladder-trimmed to ≤800 | JSON-LD `description`, `/{seed}.json` — **not rendered on the page** since D22.A (2026-08-18) |
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

## 12. Chip QA round 1 (2026-08-18) — the chip row graded against the images

D22.B made the chip row the page's navigation surface, and a grading pass over
32 rendered palettes returned 39 defects in six classes. Every one was fixed at
the rule, never on the seed; two were investigated and NOT fixed, with the
evidence, below.

### 12.1 The root cause behind half of them: one distance, two questions

`CHIP_SEPARATION` was `DEFAULT_MIN_SEPARATION` (0.12 of plain OkLab distance),
on the argument that the namer answers the same question. It does not. The namer
asks *are these two words for one colour*; the row asks *are these two SEARCHES*,
and the two disagree about lightness. Plain OkLab distance measured this wrong
in both directions at once:

| pair | plain OkLab | should be | old verdict |
|---|---|---|---|
| `midnight blue` / `dark navy` (stops 0-1 of one ramp) | 0.168 | one search | both admitted |
| `mid blue` / `cornflower blue` (stops 2-3) | 0.153 | one search | both admitted |
| `denim` / `faded blue` | 0.155 | one search | both admitted |
| `burlywood` / `silver` (a tan and the sage beside it) | 0.082 | two searches | tan dropped |
| `banana` / `eggshell` (a yellow block and cream, L > 0.97) | 0.094 | two searches | yellow dropped |
| `rosy brown` / `camel` | 0.079 | two searches | rose dropped |

The metric is now `chipDistance` — OkLab with lightness weighted to 0.25 — at a
floor of 0.09, plus the family clause `getUniqueColorNames` has carried since
the previous round: a candidate whose colour FAMILY no chosen chip holds is a
different suggestion whatever the distance says, clearing only a 0.02 noise
floor. Neutral counts as a family here and does not in the namer (a greige band
beside a brown is two searches; for a NAME it is one colour lightly varied).

Selection also changed shape. It is two rounds — families the row does not hold
yet, then distance — because max-min alone is a diversity term over the whole
solid and the solid's longest axis is lightness, so on a budget it spent its
picks on the dark and light ends of one hue. And a candidate that fails its floor
is now SKIPPED rather than ending the loop: the old `break` cost 127 rows (14.6%)
a candidate more chromatic than the chip that blocked it.

Measured over the fixture, same computation both sides:

| rule | colour chips | cover (chip metric) | cover (OkLab) | ends covered |
|---|---|---|---|---|
| flat 0.12, one round, budget 6 | 3.25 | 0.0238 | 0.0414 | 82.3% |
| chipDistance + family + ends, budget 8 | 3.39 | **0.0211** | 0.0447 | 79.6% |

The trade is deliberate: the row covers HUE better (down 11% on the measure the
selection optimises) and LIGHTNESS worse (up 8%), which is the point. Without the
explicit end preference in the greedy the end figure was 76.2%.

### 12.2 The count, honestly

| | before | after |
|---|---|---|
| chips per row, mean | 5.51 | **5.24** |
| histogram | 2:1 3:94 4:159 5:189 6:209 7:118 8:52 9:37 10:8 | 2:14 3:56 4:176 5:259 6:223 7:108 8:27 9:4 |
| rows carrying a compound AND both its parts | 350 | **0** |
| rows drawing on ≥3 dimensions | 549 (63.3%) | **584 (67.4%)** |
| rows carrying a family word | 216 | **291** |
| rows carrying a temperature word | 500 | **580** |

The mean fell and that is the correct trade: D22.B2 asks for more chips and
D22.B4 asks that each one lead somewhere, and the two pull against each other
exactly at the compound. Measured through the tag route's own filter,
`satisfying(A B)` is by construction a subset of `satisfying(A)` and of
`satisfying(B)` — page 1 of `dark complementary` and of `complementary` shared
24 of 24 results, and `dark` 22 of 24. Three chips, one destination. So a
compound now RETIRES both parts, and the freed slots go to axes the row had not
covered: the family word whenever nothing else claims that axis, and an implied
word (`warm` under `sunset`, `cool` under `ocean`) when its axis would otherwise
be empty.

The family word is also now chosen by SHARE rather than by the chroma of one
stop, at a floor of a third of the palette. The chroma rule is right about which
colour NAME to lead with and wrong about which family a palette belongs to: it
offered `yellow` for a palette of three near-blacks and three dark purples (its
one olive stop was the most chromatic thing in it) and `magenta` for a palette
whose right half is yellow. Share is also what the destination ranks by
(`tag-search.ts`, family branch), so the chip and its page agree by construction.
Swept: at 0.25 the word clears the bar on 749 rows, at 1/3 on 520, at 0.5 on 293.

### 12.3 Label quality for links (D22.B4), widened

`chipName` was a one-word repair (the survey's disgust vocabulary). It now
carries four, each with a bounded reach and each measured:

| problem | example | reach | fixture rate |
|---|---|---|---|
| survey disgust word | `ugly blue` → `peacock blue` | 0.04 | 137 rows carry one; 2 keep it (nothing nearer) |
| CSS keyword spelling | `darkblue` → `dark royal blue` | 0.04 | exactly 4 corpus entries match the shape |
| contradicts the palette's own tags | `faded red` → `dark coral` on a row that says `vivid` twice; `warm blue` beside `cool` | 0.04 | reads the WHOLE `CONTRADICTED_BY` row, not just its loudness half |
| cross-family category error | `dark forest green` (anchor hue 144) on a stop at hue 199 → `dark teal` | 0.06 | 84 of 6,069 named stops (1.4%), 79 move |

The category reach is wider than the others on purpose: a survey word is an ugly
label on the right colour, a cross-family name is the WRONG COLOUR, and the
destination makes that concrete because a colour chip's page ranks by proximity
to the named anchor. `nearestNamed` already tries this correction and gives up at
`NAME_TIE`; the chip carries on a little further.

And `complementary` prints as `duotone` in a chip, through the same `PLAIN_WORD`
table D20 already uses for the prose: the page was saying "duotone" in the text
and "complementary" in the link a visitor clicks.

Two rules were relaxed rather than tightened. A colour label that CONTAINS
another is now a relabel target, not a drop — `blood` sits 0.335 from `blood
orange`, plainly two colours, and dropping it cost a palette its whole dark
maroon band; it relabels to `maroon`. And the redundancy check between a
descriptor word and a colour name was removed entirely: the corpus is full of
names holding a modifier word (`warm purple`, `light blue`), and comparing across
the two vocabularies made a colour chip swallow the palette's temperature.

### 12.4 The near-white tier

D18's demotion (achromatic and `L > 0.9`) is right about "white" and wrong about
the palettes where the near-white IS the subject: a high-key pastel running cream
to oyster had its only light-end names dropped and chipped one colour, and a
pink-to-cream ramp lost `linen` and `ivory` with eight free slots on the row. The
clause is now an ORDER, not a demotion: near-whites are chosen after the coloured
stops and only while the budget is open. The dark half (`L < 0.1`) and the bare
universals stay hard-demoted, which is what D18's own test pins.

### 12.5 A temperature chip the image contradicts

The registry decides warm/cool from `meanHue`, a chroma-weighted CIRCULAR MEAN,
which is not robust on a bimodal hue distribution. The reported case: a neon
rainbow of two magentas (chroma 0.290 and 0.216) against four mint, aqua and cyan
stops measures `meanHue` 3.8 and chipped `warm` over an image whose right 60% is
cool. The registry's own `cooling` tag fires on the same palette.

D2 freezes the registry, so nothing about the tag, the name, the prose or
`/{seed}.json` changed. The CHIP declines to make a promise the image does not
keep, requiring half the palette in the word's own band — the same deference
`structureIsSayable` already applies to structure words. Measured: 711 rows carry
a temperature tag, 67 (7.7%) lose the chip, and all 67 end with no temperature
chip because the two registry tests partition the wheel and cannot both fire.
`palette-prose.test.js` sweeps `meanHue` over both descriptor closures and
asserts the recovered band edges equal the constants, so the restatement cannot
drift.

### 12.6 Retrieval: the pool was the defect, not the ranking key

Reported: a `silver` chip whose page had 24 of 24 results pass the filter's own
predicate while only 4 had a stop a person would call neutral, the other 20
matching on warm taupe, sage and lilac at hues 5 to 284. Cause: at L 0.81 the
sRGB ceiling is 0.05-0.10, so `COLOR_MATCH_MAX` 0.08 encloses the whole
low-chroma neighbourhood of `#c0c0c0`.

The ball now carries the corpus's own category test beside it: a NEUTRAL name
matches only stops with no usable hue, a coloured name only stops that can claim
its family. Same guard `nearestNamed` uses to choose the word, applied when the
word is looked back up. Pools: `silver` 207 → 81, `bluegray` 192 → 71, `wheat`
205 → 124.

The report also proposed ranking colour terms by SHARE rather than by
min-over-stops distance. Measured over 98 colour chips against the 867-seed
stand-in, that loses on both axes at once:

| ranking | mutual-chip@24 | emitter on page 1 |
|---|---|---|
| no guard, proximity | 27.0% | 76.5% |
| **guard, in-class proximity** | **28.5%** | **80.6%** |
| guard, proximity + 0.04 share | 27.6% | 78.6% |
| guard, proximity + 0.08 share | 26.6% | 74.5% |
| guard, share primary | 21.7% | 65.3% |
| guard, proximity bucketed to 0.02 then share | 28.0% | 76.5% |

(mutual-chip@24 = of the 24 results, how many carry that exact chip on their own
row — the owner's bar, computed rather than eyeballed.) The reason is in the
corpus: a colour chip usually names ONE of a palette's several colours, so the
emitter's own share averages 1.5 stops of 7, and share hands page 1 to
monochromes. What did change is that proximity is now measured on the stop that
ANSWERS to the word rather than on whichever stop sits nearest the anchor. The
reported `bluegray` case resolves on the pool alone: its emitter goes 12th → 7th.

`TAG_FILTER_VERSION` 1 → 2, so the change cannot be served from a stale
`SEARCH_CACHE` entry.

### 12.7 Not fixed, with evidence

**`sunset` on a chartreuse → dusty rose → purple ramp.** The registry gate passes
honestly (`hueBandShare(300,100)` = 0.833 against its 0.8 floor) and D2 freezes
the thresholds. Every chip-level alternative was checked and none discriminates:
a per-stop majority in the same band gives 5 of 7 (0.71), a chroma-weighted share
gives 0.835, and reciprocity is satisfied by construction because the palette
carries the `sunset` tag the destination filters on. Fixing it means moving
`SUNSET_WARM_SHARE` or adding a saturation floor to the registry's family gates,
which is a registry decision with re-measured prevalences attached. The row's
second complaint — that `sunset` cost it its temperature word — IS fixed: the
implied word now returns when its axis is empty, and the row reads
`warm purple | tan green | mauve | pale brown | sunset | warm`.

**`wheat` retrieval.** The pool halved (205 → 124) and the wrong-category results
are gone, but page 1 still opens on a palette that reads pink and lime. Its stops
are genuinely 3 of 7 wheat — share 0.43, the highest in the pool — and it reads
pink because the pink stops carry four times the chroma. That is a SALIENCE
question (which colour dominates an image), not a proximity or share question,
and this filter models neither. Recorded rather than papered over.

**`brown yellow` as a label.** The report's proposed alternatives (`dark beige`
0.0316, `dark sand` 0.0352, `dust` 0.0375) are all nearer than the incumbent
0.0557 and all in the ORANGE family, while the stop sits at hue 104 in the yellow
band; `nearestNamed`'s category guard is what put `brown yellow` there, and it is
the same guard §12.3 just widened. The only same-family word nearer is `dark
gold`, which `valueWordFits` rejects at L 0.68. The row's real defect on that
palette — its greige right two thirds having no chip at all — is fixed by §12.1
(`brown yellow | taupe | cement | earthy monochrome | warm`).

## 13. D22/D23 — the pivot: the description goes invisible, the chips become the surface (2026-08-18)

Owner, same day as the chip QA rounds: the generated paragraph comes off the
page, and the tag chips become the thing a visitor actually uses. Two decisions
(D22.A, D22.B), one diagnosed defect, and the SEO reshaping in D23. This section
is the final consolidation: what shipped, every distribution re-measured over the
867-seed fixture, and the retrieval evidence.

### 13.1 The description is invisible, not gone (D22.A)

`paletteContext` (pages.ts) no longer renders `<p id="palette-description">`, and
`describeSurfaces` (islands/edit.tsx) no longer writes a paragraph per slider
tick. What is left in that section is the sr-only `h2#palette-about` (the
`aria-labelledby` target, still updated per tick) and the chip row.

The prose is still generated on every render, and it still ships. Rendered
`/{seed}` for the reported palette and grepped the HTML:

| surface | carries the paragraph? |
|---|---|
| rendered `<body>` | **no** — 0 occurrences, escaped or not; no `<p>` over 120 chars anywhere on the page |
| `<meta name="description">` | yes, the ladder-trimmed variant: *"A gradient color palette sweeping from puce through ugly blue to dark navy. Copy the CSS, or export SVG and PNG."* |
| JSON-LD `CreativeWork` | yes, `description` AND `abstract` |
| `/{seed}.json` | yes, byte-identical to the paragraph the page composed |
| `paletteEmbedText` | yes, view-free, with its `Tags:` and `Colors:` lines |

The paragraph appears exactly **once** in the whole document, inside the
`application/ld+json` block. Nothing about its truth relaxes because it went
invisible: it is what Google quotes in a snippet, what `/{seed}.json` hands an
agent, and what the Vectorize rebuild will embed. It is also one build away from
being visible again, which is why the D21 register work is deferred rather than
cancelled.

Two cheap parts of D21 shipped anyway because they change meta and embed quality:
the usage/advice rows (`text-both-ends`, `light-background`, `dark-background`)
are gone and the export tail is off the view sentence. `BUDGET` stays 2.

### 13.2 The reported defect, and the rule that replaced the ranking

Reported palette `#a58464 #959d8a #6f9f9e #3e8a9b #116481 #003757 #000f2b` — a
warm tan through sage, teal and blue to navy — showed three chips:
`ugly blue | dirty blue | marine blue`. D18 ranked colour chips by the chroma of
the stop they name, and the three highest-chroma stops are three adjacent blues,
so the palette's warm half never reached its own row and the three survivors were
near-synonyms whose result sets would be nearly identical.

Fitted to the reported hexes (within 4/255 per channel), seed
`_gE8gEhgEmgFEgFPgFFgIrgH0gIDgAIgNkgMd` now emits:

```
BEFORE  ugly blue | dirty blue | marine blue
AFTER   peacock blue | marine blue | puce | dark navy
        | puce to dark navy | puce marine blue dark navy | cool
```

with the colour chips naming stops 4, 5, 0 and 6 of 7 — the petrol middle, the
deep blue, **the tan end** and the near-black end. The rendered PNG
(`scratchpad/qa/d22/f3/DEFECT.png`) confirms all four are visible bands.

The rule is now selection under a perceptual-separation constraint, in two
questions rather than one, both plain OkLab, both scaled by the palette's own
spread (`chipSeparationScale`, reference 0.386 = the fixture's median diameter,
clamped to 0.35–1.35):

- **The stops**, so two chips are never one colour in the image:
  `CHIP_STOP_SEPARATION` 0.105 same-family, `CHIP_CROSS_FAMILY_SEPARATION` 0.07
  cross-family.
- **The labels' corpus anchors**, so two chips are never one destination:
  `CHIP_SEPARATION` 0.11 — unscaled for the family word and for the journey
  pair, because a destination is a destination whatever this palette's spread is.

Re-measured over the whole fixture, both loops independent of the module:

| invariant | pairs checked | violations | min margin |
|---|---|---|---|
| stops, at the scaled bar | 4493 | **0** | 0.0004 |
| colour-chip anchors, at the scaled bar | 4498 | **0** | 0.0001 |
| family word vs colour chip, unscaled | 371 | **0** | 0.0035 |

The margins are the point: at 0.0001 the bar BINDS, so this is a live constraint
and not an accident of the candidate list. 552 of the 4498 anchor pairs sit below
the unscaled 0.11 and are admitted by the spread scaling — every one of them on a
palette whose own diameter is below the reference (spread scale p10 0.46, p50
1.00, p90 1.35). That is the D19 rule applied deliberately: "far apart" is a
statement about THIS palette, and a 0.14-diameter pastel that names its own
stations is right, while `medium gray to dim gray` on a flat ramp is not — which
is why the journey pair is tested unscaled.

**A test that claimed this and did not check it.** The anchor half of
`palette-prose.test.js`'s separation test ran inside the STOP loop, indexed `i`/`j`
into the label list but bounded by `stops.length`, so on every row carrying a
family word (322 of 867 — a family word names a hue band, not a stop) it skipped
the tail pairs and compared the wrong two labels. Split into its own loop during
this consolidation; the invariant holds, but it was being asserted by luck.

### 13.3 How many chips, and from how many dimensions

Cap raised 6 → **12** (`CHIP_MAX`), earned not padded. Over the 867 fixture:

```
chips per palette   n=867  min 2  p10 5  p50 7  p90 9  max 12  mean 7.41
histogram   2:1  3:1  4:18  5:71  6:159  7:208  8:186  9:151  10:56  11:15  12:1
6426 chips emitted, 1937 distinct labels (654 colour, 1217 journey, 42 compound)
1354 of the 1937 labels are used by exactly one palette
```

One row of 867 reaches the cap, which is the shape D22.B2 asked for: the ceiling
is not a quota. Checked at both ends rather than assumed:

- **2 chips** — seven stops of `#ffffff`. The row is `white | light grayscale`,
  and there is nothing else true to say about it.
- **3 chips** — a flat lilac monochrome, `#756d82 → #b9a2dd`:
  `pale purple | deep lilac | monochrome`.
- **12 chips** — a dark vivid blue monochrome, `#0000ae → #006598`, with eleven
  fired tags: `cobalt blue | sapphire | dusk blue | peacock blue | cobalt blue to
  peacock blue | dark ocean | vivid monochrome | cool | ocean | dark | monochrome
  | vivid`.

Length tracks how much there is, which is the same rule D21.7 set for the prose.

Axis mix — rows carrying at least one chip of the kind, and the share of all
chips that kind spends:

| axis | rows | share of rows | chips | share of chips |
|---|---|---|---|---|
| colour name | 867 | 100.0% | 3140 | 48.9% |
| journey (`a to b`, `a b c`) | 818 | 94.3% | 1239 | 19.3% |
| temperature | 520 | 60.0% | 520 | 8.1% |
| tone | 511 | 58.9% | 568 | 8.8% |
| family | 322 | 37.1% | 337 | 5.2% |
| compound | 316 | 36.4% | 335 | 5.2% |
| structure | 287 | 33.1% | 287 | 4.5% |

Kinds per row: 1:1, 2:60, 3:249, 4:218, 5:154, 6:164, 7:21 — **866 of 867 rows
draw from at least two dimensions, 806 from at least three, 557 from at least
four.** Colour and the journey form take 68.2% of the budget between them, which
is D23.2's rebalance: colour has first claim, descriptors fill what remains, and
no descriptor kind was removed (D23.3).

Top of the row, by how many palettes emit it:

```
 291 warm        135 monochrome   93 dark        75 rainbow     69 neon
 229 cool        122 vivid        87 ocean       71 light       59 duotone
 116 sunset       85 earthy       71 pastel      57 almost black 57 muted
  39 cool monochrome   35 charcoal gray   32 dark indigo   30 light gray
  30 vivid sunset      29 silver         28 violet         27 vivid monochrome
  26 yellow            25 autumn         23 turquoise blue  21 cornflower blue
  21 grape             21 sand           21 wheat
```

42 distinct compounds, led by `cool monochrome` (39), `vivid sunset` (30),
`vivid monochrome` (27), `muted duotone` (16), `light sunset` (15). The journey
labels are nearly all unique by construction (1217 distinct over 1239 emissions):
they name this palette's own two or three stations.

### 13.4 Label quality for links, and the journey chips

`marine blue` over `ugly blue` is a LINK-LABEL preference, not corpus censorship:
the survey vocabulary stays in `NAMED_COLORS` and still appears in the prose —
the defect palette's own paragraph reads "from puce (#a38363) through ugly blue
to dark navy" while its chips read `puce | marine blue`. The repair is ranked
(nearest corpus name inside `CHIP_LABEL_REACH` that is not unsearchable,
unspaced, obscure, coined or tone-contradicting), and it hands the raw word back
rather than dropping a band.

D23.1's journey chips are built from the same spanning selection, in RAMP ORDER,
never reordered: `puce to dark navy` and `puce marine blue dark navy`. They
inherit the separation constraint (a `blue to blue` cannot be constructed) and
the pair is tested at the unscaled anchor bar. Cap 2 per palette.

**Every chip destination carries the head noun** (D23.4), which the peer SEO
session's GSC pull says is what draws impressions: checked all **1937** distinct
labels through `queryHeading` — 0 lack it. Examples: `marine-blue` →
"Marine blue gradient palettes", `puce-to-dark-navy` → "Puce to dark navy
gradient palettes", `muted-duotone` → "Muted duotone gradient palettes".

### 13.5 Retrieval: a chip has to lead somewhere that looks like it (D22.B5)

`/palettes/{tag}` is pure semantic search against an index embedded from the OLD
palette-tags vocabulary, which has never seen `duotone`, `muted`, `earthy` or
`monochrome`. The fix is serve-time and needs no reindex (`tag-search.ts`):

1. **Recognize** the query against the same three vocabularies the chips are
   drawn from — the registry (`word`, `spokenWord` AND `chipWord`), the eleven
   family words, the 920-entry colour corpus — at most 3 terms, every word
   consumed, `to` stepped over. Nothing else can reach the filtered path, so it
   is never attacker-chosen text.
2. **Over-fetch sideways.** Vectorize caps `topK` at 50 with
   `returnMetadata: "all"`, so the pool grows with query VECTORS, not depth: one
   batched embedding call, parallel queries, and the expansions are derived
   (a compound expands to its parts, a single word to the registry's own
   `implies`) rather than invented.
3. **Decode and classify** each candidate at its own stored `steps`, with the
   same classifier that produced the chip, lazily by dimension.
4. **Rank, never remove.** Both parts, then either part (rarer part first), then
   distance, then the semantic order. Result counts, page counts, `sort=` and
   bookmarked `?page=2` URLs are exactly what they were.

Measured over the 867-seed local stand-in (Vectorize cannot be called locally, so
each palette's OLD indexed document is reconstructed and ranked by character
trigram cosine — the same method §12.6 used, so the columns are comparable).
Page = 24. "Satisfies" is the deterministic classifier. 68 chips sampled as the
head plus an even spread of the tail of each kind:

| kind | n | base rate | BEFORE | filter only | **filter + expansion** | mutual@24 |
|---|---|---|---|---|---|---|
| colour name | 14 | 9.0% | 45.8% | 66.4% | **66.4%** | 16.1% → 17.6% |
| journey | 14 | 1.1% | 13.7% | 17.3% | **19.3%** | 5.4% → 5.7% |
| tone | 7 | 12.2% | 35.7% | 58.3% | **75.0%** | 24.4% → 59.5% |
| structure | 4 | 8.4% | 6.3% | 11.5% | **11.5%** | 4.2% → 9.4% |
| temperature | 2 | 41.0% | 89.6% | 100.0% | **100.0%** | 72.9% → 77.1% |
| family word (sunset/ocean/autumn) | 3 | 8.8% | 15.3% | 22.2% | **65.3%** | 15.3% → 65.3% |
| family band (blue/violet/…) | 10 | 22.6% | 82.9% | 97.9% | **97.9%** | 2.1% → 5.0% |
| compound | 14 | 1.9% | 1.2% | 6.0% | **10.7%** | 0.9% → 7.7% |
| **ALL** | **68** | 9.1% | **32.0%** | 43.4% | **48.5%** | 10.5% → 18.9% |

`mutual@24` is the owner's bar computed rather than eyeballed: of the 24 results,
how many carry that exact chip on their OWN row. **AFTER ≥ BEFORE in all 68 rows**
— the filter is monotone by construction, it only reorders. Standouts: `ocean`
29.2% → 100%, `pastel` 16.7% → 91.7%, `light` 54.2% → 100%, `cool monochrome`
4.2% → 75.0%, `sunset` 12.5% → 79.2%, `prussian blue` 58.3% → 100%.

**Where it is still weak, and why the number is not the whole answer.**

- **Structure words stay at 11.5%.** `duotone` 4.2%, `rainbow` 0% → 8.3%. The old
  vocabulary has no word for hue geometry and `implies` gives structure nothing
  to expand into, so no serve-time trick reaches those palettes: for a dimension
  with base rate *p*, a pool of *N* caps precision at `min(1, N·p/24)`. This is
  the reindex, not the filter.
- **Journey chips read low (19.3%) and are the strongest case for the shape.**
  Their base rate is 1.1% — a specific two or three colour combination is rare by
  definition — yet **the emitting palette is on page 1 of its own journey chip in
  14 of 14 cases.** The chip leads to the palette you came from plus its nearest
  neighbours, which is what that link is for.
- **`muted duotone` — the owner's own example — is still 0%**, along with
  `cool rainbow`. 24 of 867 palettes satisfy it and a fused pool of 106 contains
  none of them. Pool composition, not ranking.

Cost. `TAG_FILTER_VERSION` is part of the cache key, and `SEARCH_CACHE` stores the
FINISHED filtered page, so all of this is cache-miss only. Component costs on
this machine: decode+stops 21µs, `paletteFeatures` 140µs, `modifierTags` 2µs.
End to end through `applyTagFilter`, median of 9 over a fixed 200-deep pool (the
widest the over-fetch can build):

```
marine blue 9.9ms · silver 10.1ms · blue 7.8ms        (50, 51, 39µs/candidate)
puce to dark navy 16.3ms · cream light salmon fire brick 21.8ms  (82, 109)
muted 39.2ms · monochrome 40.2ms · ocean 43.2ms       (196, 201, 216)
muted duotone 49.5ms · earthy sunset 50.7ms           (247, 254)
```

The pools a real request builds are smaller: 50 for a single-term query with no
expansion, 90–163 for a compound or a journey. Median added CPU per uncached tag
request, measured on the fixture's own chips: **1.5ms** (family band), **1.9ms**
(colour name), **7.0ms** (journey), **16.8ms** (tone), **21.7ms** (structure,
compound), **36.2ms** (sunset/ocean/autumn, whose expansion buys the widest pool).

### 13.6 What the row costs to build

The chip row is now the most expensive thing on a palette page. Median of 5 over
217 fixture seeds:

| call | µs/palette |
|---|---|
| `renderPalette` | 21 |
| `paletteFeatures` | 140 |
| `describePaletteName` | 511 |
| `chipColors` | **2225** |
| `relatedSearches` (chipColors + facts + compounds + family) | 2231 |
| `describePalette` (title + description + tags) | 3096 |
| `seedPaletteText` (everything a page needs) | 5571 |

`chipColors` is 40% of a palette page's text work and 71% of `describePalette`,
because `chipName` scans the 920-entry corpus per candidate and again per chosen
label, through up to two rejection stages. That is the price of the link-label
repair and it is paid once per server render and once per slider tick (5.6ms is
well inside a 16ms frame). Recorded rather than optimised: the selection rules
are what the QA rounds bought, and a cache keyed on the stops is the obvious next
move if TTFB ever asks for it.

It also has a test consequence, which is why `vitest.config.ts` now sets
`testTimeout: 30000`: 867 rows × 2.2ms is ~2s per fixture-wide test, several such
tests share a CPU under `vitest run`, and the 5s default made the suite flaky in a
way that said nothing about the code.

### 13.7 Visual QA: twelve palettes, simple to complex

Picked by a complexity score (hue travel + OkLab diameter + fired tag count) at
even quantiles of the fixture, rendered, and read beside their rows. PNGs in
`scratchpad/qa/d22/f3/`. The question is D21.7's, applied to chips: **does the
amount said match the amount there is to see?**

| # | what the image shows | chips | verdict |
|---|---|---|---|
| V01 | flat gray ramp, faint violet at the dark end | 5: `charcoal gray · gunmetal · battleship gray · battleship gray to charcoal gray · grayscale` | fair — three grays, but three visibly different values |
| V02 | dusty rose → steel blue → pale sage → gray green | 7 incl. `rosy brown · cadet blue · pale teal · greenish gray · muted` | fair, spans the ramp |
| V03 | aqua → periwinkle → pale mint, all high-key | 8 incl. `sky blue · white smoke · pastel · cool` + journey | fair; the mint cast at the right end goes unnamed |
| V04 | cream → peach → terracotta → slate → steel blue | 9 incl. `pale peach · dull orange · muted blue · earthy sunset · sunset · warm · earthy` | strong — both ends, the middle, and four true dimensions |
| V05 | plum → teal → cyan → bright sky blue | 6: `deep sky blue · teal blue · twilight` + journey + `ocean · cool` | strong |
| V06 | dark olive ↔ vivid blue, two poles | 6: both poles + journey + `dark duotone · duotone · dark` | strong — the row IS the palette |
| V07 | near-black → slate → steel → pale ice | 7 incl. `almost black · dark gray blue · light gray blue · muted · cool` | fair; three "gray blue" words, three real lightness zones |
| V08 | navy → azure → cyan, one hue | 8 incl. `midnight blue · bright blue · bright sky blue · vivid ocean · ocean · vivid` | strong |
| V09 | peach → russet → olive → green → mint → cream | 8, all colour + journey (`apricot · viridian · earth · green brown · eggshell`) | strong on colour; no dimension chip fires, honestly |
| V10 | salmon → cream → cyan → blue | 6 incl. `light salmon · robin egg blue · steel blue · pastel` | fair |
| V11 | near-black maroon → burnt orange → gold → yellow | 7 incl. `very dark purple · maroon · deep orange · tangerine · pale yellow · warm` | strong — the whole fire ramp |
| V12 | 1049° of travel: blue, orchid, violet, magenta, slate, sage | 8, seven colours + journey | strong on colour; two dimensions only, because nothing else fires |

No row named a colour that is not in its image, and no row spent two chips on one
visible band. The two all-colour rows (V09, V12) are the D23.2 rebalance working
as specified: colour has first claim, and neither palette has a descriptor that
fires.

### 13.8 Island bundle, re-measured

`pnpm build`, client chunks:

```
edit-DPviQhP1.js        96.32 kB │ gzip 33.15 kB
entry-B-QSpHrY.js      197.14 kB │ gzip 62.89 kB
module-ltquLR9-.js     167.83 kB │ gzip 55.37 kB
export-CEJBZq0H.js      26.76 kB │ gzip  9.00 kB
export-store-DJarv545.js 6.15 kB │ gzip  2.53 kB
```

The edit island was 116.21 kB / 39.13 kB gzip when it rendered the paragraph;
dropping `paletteProse` from the client took it to 91.28 / 31.11, and the chip QA
rounds plus the journey chips brought back 5.04 kB gzip. Net against the build
that showed the paragraph: **−19.89 kB raw, −5.98 kB gzip.** `relatedSearches`
still imports palette-prose, so the corpus and the feature analysis stay on the
client; what left is the paragraph machinery Rollup can now prove unreachable.

### 13.9 Standing reindex-gated items

§11.8's five riders are unchanged and still **not shipped**. D22.B5 does not
replace them — it is the serve-time repair that makes the chips honest UNTIL the
rebuild, and the two places it cannot reach (structure words, and any dimension
whose satisfying palettes are absent from a 50-deep pool) are exactly what the
rebuild fixes:

1. Index text → `paletteEmbedText()` (which literally contains `duotone`).
2. Query-side mirror in `normalizeSemanticQuery`'s seed branch (names-only until
   #1 ships).
3. `texture:'monochrome'` → `'grayscale'` in palette-tags.
4. Write `modifierTags` into Vectorize metadata (filterable) — with it, the tag
   route stops needing the over-fetch at all for registry words.
5. Compound pages graduate on demand once the embed text carries both words.

A sixth, added by this work: **if `seed`/`style`/`steps`/`angle` turn out to be
INDEXED metadata**, `returnMetadata: "indexed"` allows `topK: 100` and doubles
every pool for free. One probe against staging, and it is the single biggest
available win for the two weak kinds.

### 13.10 Suite state

`apps/web`, full run: **40 files passed, 383 tests passed; 2 files failed, 2 tests
failed** — `analytics.test.js` (PostHog spy) and `export.test.js` (expects the
`foreignObject` that svg.ts replaced with the wedge fan in July). Both were
failing before this work and are recorded as out of scope; `fit-bench.test.js`,
red in §11.9, is green again. `pnpm typecheck` clean.

One harness artifact, worth knowing before someone chases it: a full run
intermittently prints `Unhandled Error: [vitest-worker]: Timeout calling
"onTaskUpdate"`. It is the same cause as the timeout bump above — a fixture-wide
chip test holds its worker thread for seconds, so vitest's own RPC ping expires —
and it is reported beside a passing file, never as a failed assertion.

Seven scratch harnesses from the build rounds — `apps/web/test/zz-branch`,
`zz-cand`, `zz-diag`, `zz-measure`, `zz-pick`, `zz-show`, `zz-survey` — were
swept into commit `ea1a3c8` (an unrelated admin commit) by a wide `git add`, the
exact hazard CLAUDE.md warns about. Each one's own header says "scratch … delete
after"; they measure, assert nothing, and cost ~9s a run. Deleted from the
worktree here, uncommitted, so the removal is one `git checkout` from being
undone if the owner wants them kept.

---

## 14. D25 chroma and temperature — inventory sections 3 and 4

Everything below is measured over the 867-seed fixture (`test/prose-corpus.js`)
at the view the registry records at: `linearGradient`, 7 steps, 90°.
`palette-characteristics.test.js` re-measures every rate and fails on drift.

### 14.1 What ships

| term | axis | predicate (plain) | margin (strong) | plain | strong |
|---|---|---|---|---|---|
| `vivid` | chroma | `C̄ ≥ 0.15` | `C̄ ≥ 0.17` | 185 (0.2134) | 102 (0.1176) |
| `neon` | chroma | `Cmax ≥ 0.24 ∧ C90 ≥ 0.24 ∧ L̄ > 0.45` | `C90 ≥ 0.26` | 69 (0.0796) | 46 (0.0531) |
| `brilliant` | chroma | `C̄ ≥ 0.15 ∧ L̄ ≥ 0.8` | `C̄ ≥ 0.17` | 19 (0.0219) | 8 (0.0092) |
| `muted` | chroma | `C̄ < 0.055 ∧ L̄ ≤ 0.78 ∧ hasColour` | `C̄ ≤ 0.045` | 93 (0.1073) | 64 (0.0738) |
| `pastel` | chroma | `L̄ > 0.78 ∧ C̄ < 0.09 ∧ hasColour` | `C̄ < 0.0675 ∧ L̄ > 0.82` | 71 (0.0819) | 34 (0.0392) |
| `jewel tones` | chroma | `0.30 ≤ L̄ ≤ 0.60 ∧ C̄ ≥ 0.12 ∧ Cmax ≥ 0.15` | `C̄ ≥ 0.15 ∧ Cmax ≥ 0.2` | 106 (0.1223) | 47 (0.0542) |
| `earthy` | chroma | `C̄ < 0.10 ∧ Cmax < 0.15 ∧ 20 ≤ h̄ < 110 ∧ L̄ < 0.75` | `C̄ ≤ 0.055` | 88 (0.1015) | 36 (0.0415) |
| `sepia` | chroma | monochrome `∧ 50 ≤ h̄ < 90 ∧ 0.03 ≤ C̄ ≤ 0.10 ∧ L̄ < 0.8` | `C̄ ≤ 0.07` | 9 (0.0104) | 8 (0.0092) |
| `neutral-anchored` | chroma | `0.15 ≤ cf ≤ 0.85 ∧ ¬grayscale` | `0.25 ≤ cf ≤ 0.75 ∧ Cmax ≥ 0.08` | 157 (0.1811) | 38 (0.0438) |
| `clipped` | gradient | `clipped ≥ 0.25` | `clipped ≥ 0.5` | 350 (0.4037) | 205 (0.2364) |
| `warm` | temperature | `¬grayscale ∧ (h̄ < 120 ∨ h̄ ≥ 330)` | `share(330,120) ≥ 0.85 ∧ R ≥ 0.6` | 399 (0.4602) | 188 (0.2168) |
| `cool` | temperature | `¬grayscale ∧ 150 ≤ h̄ < 300` | `share(150,300) ≥ 0.85 ∧ R ≥ 0.6` | 312 (0.3599) | 173 (0.1995) |
| `temperature-neutral` | temperature | `¬warm ∧ ¬cool` | none — TAG ONLY | 156 (0.1799) | 0 |
| `warm cool contrast` | contrast | `share(330,120) ≥ 0.25 ∧ share(150,300) ≥ 0.25` | both ≥ 0.4 | 198 (0.2284) | 47 (0.0542) |
| `warming` | temperature | stored `journey` tag | `∧ warmCoolContrast` | 302 (0.3483) | 89 (0.1027) |
| `cooling` | temperature | stored `journey` tag | `∧ warmCoolContrast` | 315 (0.3633) | 75 (0.0865) |

`neutral-anchored` and `temperature-neutral` are new; the rest were already
entries and were VERIFIED against the inventory's own OkLCh test rather than
rewritten. Two deviations are deliberate and were already recorded here:
`brilliant` takes the registry's `LIGHT_LIGHTNESS` (0.8) over the inventory's
0.7 (19 palettes against 72 — §12 X2), and `earthy` carries the
`Cmax < VIVID_CHROMA` veto (the inventory's literal test admits 11 palettes
holding a rendered stop at 0.15–0.20 chroma, which are not muted by any
reading) while D19's identity floor admits 2 the literal refuses.

### 14.2 The journey pair earns a margin (D24.1b)

`warming`/`cooling` shipped with `strong = test`, i.e. a chip on a fact true of
a third of the corpus — the least discriminating pair in the table at 1.52 and
1.46 bits. The DIRECTION still comes from the stored `journey` tag and is never
recomputed (the inventory's misuse note: cite the stored tag or ship the same
formula, never both). The margin asks a different question — is the drift
VISIBLE — using the inventory's own coexistence row: both temperature zones
occupied at `warmCoolContrast`'s 0.25 shares. 302 → 89 and 315 → 75 (3.28 and
3.53 bits).

Rendered both sides (`qa/d25/db/05`, `06`). The margin keeps navy → slate →
tan → wheat, which is a textbook cool-to-warm journey, and drops magenta → hot
pink → coral → orange, where the stored tag is right about the direction and
every stop is already warm, so a reader sees no temperature story at all.

### 14.3 Rows those sections deliberately do NOT ship (D25.3)

Every one is computable; none of these is a measurement failure.

| row | why not | measured |
|---|---|---|
| `vibrant` | the inventory's test IS `vivid`'s | identical set, 185 palettes |
| `dusty` | the inventory's test IS `muted`'s | identical set, 93 palettes |
| `achromatic` | the theory word for `grayscale`, which ships | literal test 24, shipped 19; the 5 extra are D19's near-white tints at 69–100% of their achievable chroma — pale colours, not grays |
| `neutral` (chroma sense) | palette-level it is the grayscale test again, and the word collides with the INDEXED `warmth: neutral` value | same 19 |
| `rich` | "overlaps jewel; pick one, never both" | 107 palettes, 105 also `jewel tones`; 2 rich-not-jewel, 1 jewel-not-rich |
| `washed-out` / `faded` | half of it IS `pastel` (identical predicate); the other half is §7's `fade` endpoint row, and one predicate must not carry two labels. The row's own note bans it as a standing label ("negative valence — prefer for trajectory") and a chip is a standing label | pastel 71, fade-to-gray 39 (37 outside pastel), union 108 |
| `saturation`, `colorfulness` | quantities, not claims. Both readings already exist (`meanChroma`, `meanSaturation` against the sRGB ceiling — better than the inventory's C/L proxy) and D19 decides which a term uses | — |
| Kelvin colour temperature | physics inverts the metaphor; already in the file header | — |

`achromatic`, `vibrant` and `dusty` are the theory's words for terms that DO
ship, so `/palettes/achromatic`, `/palettes/vibrant` and `/palettes/dusty`
belong in the tag recognizer's synonym list (tag-search.ts), never as second
registry entries that could disagree with the first.

### 14.4 Visual QA (`qa/d25/db/`)

| # | term | palette | verdict |
|---|---|---|---|
| 01 | `jewel tones` | aubergine → royal purple → violet → magenta | YES — amethyst/gem colour at mid lightness, not neon, not dark |
| 02 | `neutral-anchored` | indigo → slate gray → greige → khaki → gold | YES — a genuinely neutral middle third with real colour at both ends |
| 03 | `temperature-neutral` | purple → orchid → pale violet | YES, and it shows why the row's `use` column says "neither": the honest label a reader wants is the ZONE name (violet-magenta) |
| 04 | `temperature-neutral` | grass green → chartreuse → khaki | YES — the other ambiguous zone; neither fire nor water |
| 05 | `warming` (strong) | navy → slate → mauve gray → tan → wheat | YES — cool half then warm half |
| 06 | `warming` (plain, margin drops it) | magenta → hot pink → coral → orange | correctly REFUSED — drifts warmer, was never cool |
| 07 | `sepia` | chocolate → cocoa → beige → cream | YES — the aged-photo look, and nothing like the vivid orange the gate exists to exclude |
| 08 | `brilliant` | salmon → orange → amber → chartreuse → green | YES — every stop light AND strong at once |
| 09 | `neon` | electric magenta → hot pink → pale pink | YES — the loud tenth is fluorescent; the pale tail is why the p90 gate reads the run and not one stop |
| 10 | `earthy` | gray-blue → greige → tan → clay → dusty plum | YES — pigment colours held below full lightness |
| 11 | `warm cool contrast` | terracotta → crimson → orchid → periwinkle → sky | YES — both poles present at once |

## 15. Chip QA round 4 (2026-08-18) — 44 failures + 11 minors, graded against the images

The whole inventory shipped in D25 and the QA pass read the chip rows beside
renders of their palettes. Everything below is a ROOT fix (a predicate, a
threshold, a dedupe rule or a filter), never a special case for a seed, and
every number is a fixture measurement.

### 15.1 Terms that were saying something false

| term | what the render showed | root fix | rate |
|---|---|---|---|
| `tones` | a deep ultramarine climbing L 0.416 → 0.651 while its chroma halved — the tint/tone conflation the inventory names | the value must HOLD: `ΔL < LOW_CONTRAST_RANGE` (0.12), the repo's own statement of that, imported rather than invented | 15 → 5 test, 5 → 2 strong |
| `tints` (missing) | a crimson→white tint series read `multicolor`, so no series was computed at all | the drift walk reads stops with real chroma (a hue angle at C 0.013 is quantization noise), and `seriesReading` is no longer gated on the structure ladder's second opinion | 15 → 21 test |
| `wash` | 44% of the run pinned at `#ffffff`, chipped `wash` beside its own `pure-white-plateau` | a clipped white is not a pale passage OF COLOUR — the pale-run walk skips the white corner | 103 → 98 test |
| `fade to white` | ends on a cream, a mint, a pale cyan, at the limit `#fffe35` | the end stop must have run out of COLOUR too (C < CHROMA_FLOOR), the gate `fade to gray` always had | 65 → 10 test, 27 → 8 strong |
| `near-white` | the lightest stop is `#e1ffa0`, a pale lime at C 0.124 | same identity gate on the pole; absolute chroma because the ceiling collapses at L → 1 | 339 → 70 test, 112 → 42 strong |
| `desaturating` | cream → gold → blood orange → maroon → BLACK → teal → vivid jade: the trend is dragged negative by a plateau while the ends rise 0.059 → 0.141 | the rendered ends must agree with the trend | 157 → 152 test |
| `arch` | 41 of 125 strong fires are VALLEYS (`arch` counted turns and never asked which way) | the peak must be interior with both ends dropping — `bright-middle`'s own end-drop test without its position window | 277 → 108 test |
| `jewel tones` | a violet ombre dying into pastel lavender; two electric purples at C 0.294 | the window is a claim about the STOPS: no LIGHT sample, and a neon is excluded by name | 106 → 61 test |
| `accented analogous` | the "accent" is stop 0, `#000800`, black on screen | the accent cluster must clear the near-black edge (new `clusterLightnesses` feature) | 30 → 27 test |
| `extension contrast` | the term's only witness was a neutral ramp whose accent was its own black end, 3% louder than the field | visibility, plus a JND of real edge for the strong band | 4 → 3 test, 1 → **0** strong |
| `hue contrast` | a cream → pale aqua → cornflower wash cleared a mean-chroma bar by 0.0043 | the margin asks for chroma on EVERY pole, not on the average — one colour against a near-gray is Itten 6, which ships separately | 30 → 14 strong |
| `rainbow` | refused a 265° indigo/red/blue/green/lime/cyan/coral palette; admitted 300° pastel washes | the margin is the POLES (a quarter of the mass each side) and the COLOUR IN BETWEEN (`denseMinChroma > MUTED_CHROMA`), which is what separates a spectrum from a crossfade | 28 → 29 strong, and a better 29 |

### 15.2 Terms that were saying one thing twice

| rule | measured |
|---|---|
| a registry hue word whose region a colour chip already named (`cerulean blue \| indigo \| bright sky blue \| ultramarine \| azure` on a 71%-blue palette) | 355 of 867 rows, 424 chips |
| a compound's own halves, which used to come back at the tail (`pastel analogous \| pastel \| analogous`) | 115 rows (13.3%) |
| the same-family separation bar relaxing on a flat palette (`greenish cyan \| aqua green \| greenish teal` on one spring green) | the bars now scale UP only; the destination bar never relaxes |
| five newly declared implications: `near-black→dark`, `neon→luminous`, `brilliant→high-key`, `sepia→warm/earthy/muted`, `rainbow→spectral order`, plus `bright-middle→arch` and `tints→near-white` once those two predicates became the same claim | measured containments recorded at each entry |
| a directional chip on a CYCLIC palette, and one whose two names share a word (`candy pink to faded pink`) | 818 → 705 rows with a journey chip |

Registry chips on the fixture: 2,511 → 1,525. Chips per row: mean 8.25 → 6.51
(min 2, p50 6, p90 9, max 12), and every row still draws on at least two kinds.

### 15.3 The schemes get a second route

`triadic` and `tetradic` could not fire on a SWEEP: `#d0555d #5b60cf #5bcf55`
repeated twice reads red / blue / green in even bands, and its dense sample
walks every hue between them (one cluster, 340.7° wide). The hue-MASS route that
D24.2 gave `complementary` does not help — on that palette the mass in a 40°
window peaks at 0.229 and never falls below 0.063 — so the second route reads
the RENDERED STOPS, which is what the swatch grid shows and what both the chip
row and the tag filter classify at. Measured: 110 palettes have three tight
stop-hue groups and exactly one has them evenly spaced. The angle margin is
dropped with it: the discriminating fact is being three separated hues at all,
and a second threshold would have refused the corpus's only triad by 3.5°.

### 15.4 Retrieval

`hue cycling` is now TAG ONLY: 6 of 867 palettes satisfy it, its page holds one,
and its only strong witnesses already carry `repeating` and `seamless`, which
say the same loop in words a reader knows. Rarity alone does not disqualify a
chip (D25.4) — a triadic page is thin too — but a rare term that is ALSO a
synonym of two better ones spends a slot for nothing.

Directional queries now carry their direction: `recognizeTagQuery` marks the
`{a} to {b}` shape and `tagQueryMatch` penalises a palette that holds the two
colours in the wrong order. A RANK key, never a filter — a reversed palette
still holds what was asked for. Measured over 16 directional chips against the
867-seed stand-in: 18 palettes in the both-colours tier, 11 of them in the
labelled order, and the rank of the first in-order palette inside that tier goes
0.33 → 0.00, i.e. a reversed palette led the tier on 3 of 9 chips and now leads
none. Mean precision@24 over all 133 terms: 0.571 → 0.578.

### 15.5 Declined, with evidence

- **`rainbow` on a 302° two-cluster sweep** (the QA's b02, "visually
  indistinguishable in kind" from b05 which gets the word). Its hue path has a
  47° hole and its dense run dips to a chroma below MUTED_CHROMA where b05 holds
  0.082 — the paler middle IS visible in the render. Extending the word to
  wide-cluster palettes adds 8 test-true rainbows (a muddy gray sweep, a pastel
  wash) and **zero** that clear the strong band, b02 included.
- **`deep violet` naming `#4a0048`.** The corpus's own `deep violet` is
  `#490648`, 0.8° of hue and 0.005 OkLab from the stop, so the namer picked the
  nearest name correctly; research-colorTheory §1.2 records that sRGB purple IS
  magenta at h 328. The row's actual defect — printing `deep violet` AND
  `purple` — is fixed by the region rule in 15.2.
- **`monochrome` missing on the ex-`tones` blue ramp.** Its hue span is 17.66°
  against a strong band of 15, so it was never in the ranked pool and the
  `tones → monochrome` implication had nothing to do with it. Moving the band to
  admit one palette is fitting a threshold to a witness, which D24.1 forbids.
- **The unnamed `#ffffc0` band** on the candy-pink palette: it sits 0.0718 from
  the `celery` stop beside it, same family, under the row's own separation bar.
  Naming both is the defect this round filed three times.

---

## 16. Chip QA round 6 (2026-08-19) — 26 failures + 11 minors, graded against the images

### 16.1 The critical finding: a chip is a link, and a rare term's link is broken

`/palettes/{term}` shows 24 results drawn from a pool the retrieval layer hands
us, and `applyTagFilter` ranks the matching palettes to the top of that pool — so
page 1 can hold no more matching palettes than the CORPUS contains. Measured
through the real path (recognizer → expansion → over-fetch → filter) against a
production-size pool: `shades` (1 of 867 palettes) returned 1 match in 24,
`sepia` (9) returned 3, `warm gray` (9) returned 1, `tints` (21) returned 1.
Neither the filter nor the predicate is at fault.

`CHIP_SUPPORT_FLOOR` = `TAG_PAGE_SIZE / FIXTURE_SEEDS` = 24/867. A term below it
keeps everything else it had — measured, published in `/{seed}.json`, ridden by
the embedding, answering its own URL with a deterministically filtered page —
and never becomes a link. Held back (support in palettes): shades 1 · solid 1 ·
repeating 1 · triadic 1 · split complementary 0 · square 0 · tetradic 0 ·
discord 0 · extension contrast 3 · tones 5 · shadow band 6 · pure-white-plateau
6 · sepia 5 · warm gray 9 · fade to white 10 · fade to gray 10 · fade to black
12 · cool gray 16 · grayscale 19 · brilliant 19 · mustard 19 · tints 21 ·
pure-black-plateau 21 · duotone gradient 21.

Measured precision@24 through the simulated route, by class:

| class | terms | median support | mean precision@24 | mean strong@24 |
|---|---|---|---|---|
| chip-eligible | 87 | 85 | 53.3% | 30.5% |
| held back by the floor | 24 | 6 | 6.4% | 4.0% |
| tagOnly | 24 | 159 | 53.1% | 21.0% |

...and by axis, chip-eligible only: temperature 100.0% (median support 315), hue
63.3% (65), family 62.5% (87), chroma 43.8% (93), gradient 41.7% (108), contrast
40.3% (106), harmony 38.9% (75), value 35.7% (97).

**Still retrieval-limited, and the reindex is the fix.** `complementary` (52 of
867) and `spectral order` (115) clear the support floor and their pages are still
mostly fallback, because the live Vectorize index was embedded from the OLD
palette-tags vocabulary and neither word occurs in a single stored doc. The
control is `neon`, whose `implies` expansion reaches the indexed word `vivid`:
its page measures 75%. Measured lift over the indexed vocabulary says expansion
cannot close the gap — the best indexed correlate of `complementary` is `soft`
at rate 0.127, which would put ~6 complementary palettes in a 50-doc pool — so
this stays where tag-search.ts's own docstring already puts it: the gap needs the
reindex. It is recorded here rather than fixed.

### 16.2 Terms that were saying something false

| term | what the image showed | fix | measured |
|---|---|---|---|
| `sepia` | khaki-olive (stop hues 76–104, meanHue 88.2) and a pale peach at mean L 0.784, against the corpus anchor at h 59.2 / L 0.537 | hue window ends at the orange/yellow family boundary (80, was 90) and L < 0.75 (was 0.8) | 9 → 5 test, 8 → 4 strong |
| `jewel tones` | a dusty teal (C 0.072) and a muddy cocoa (C 0.052) either side of a fire-engine red | no MUTED sample — the symmetric half of the round-4 light-stop rule | 61 → 42 test, 13 → 10 strong |
| `complementary` | olive at h 124–146 against blue at h 259–263: a 138.9° arc, so no two hues in it are 150° apart | `opposedHueMasses` requires the ARC to hold the pair; the window centres were handing the term 40° of slack | 52 → 50 test, 32 → 31 strong |
| `rainbow` | blue → violet → mauve → tan → olive → yellow-green, no red and no orange anywhere | a nameable red or orange, at FAMILY_CHROMA, via the new `vividHueHistogram` | 29 → 27 strong |
| `spectral order` | four stops on the line of purples (mauve, magenta, purple, violet), 50.2% of the walk | share of the walk on the non-spectral edge, capped at the edge's own share of the wheel (125.1/360) | 186 → 115 test |
| `spectral order` | black, black, dark blood red, tan, sage, petrol, black — a walk nobody can see | mean chroma at FAMILY_CHROMA | 61 → 36 strong (with the line rule) |
| `neon` | electric for the leftmost fifth, then chroma 0.280 → 0.086 | the loudest tenth yields to the run's own chroma trend, at `desaturating`'s threshold | 46 → 30 strong |
| `grayscale` | a lavender-white to sage-gray ramp at 1.6% past the bar | BOTH readings halved, not only the absolute one | 8 → 6 strong |
| `warm gray` (colour chip) | a stop at h 164.8 — a green-cyan lean, i.e. a cool gray — beating `bluish gray` on lightness alone | a label may not claim a temperature its own stop contradicts; structural, so the repair moves it | `battleship gray` |
| `dull yellow` (colour chip) | a #dde235 stop at C 0.180, past VIVID_CHROMA; the h1 said `sickly yellow` | the link-label repair may not introduce a loudness word the raw name did not carry | `dandelion` |

### 16.3 Terms that were saying one thing twice

- **The journey list form was the journey pair with a word put in.** On 454 of
  the 867 rows both printed, and on every one of them the list started with the
  pair's A and ended with its B. Measured through the real path over the
  fixture's own labels: the pair's page scores precision@24 0.072 and the list's
  0.058 — structural, because a three-term AND is satisfied by strictly fewer
  palettes than the two-term AND inside it. The pair also carries the direction.
  The list stays in the emitter for rows where the pair cannot be made.
- **Compounds are now floored on their MEASURED joint.** The independence
  estimate is wrong in both directions on real pairs (`bright-middle
  complementary` estimates 1.65 palettes and has 4; `bright-middle rainbow`
  estimates 1.4 and has 13), so `COMPOUND_SUPPORT` records the joint for all 120
  pairs that co-fire and the floor is half a page. 13 survive; 85 distinct
  compound labels become 13, on 178 rows.
- **A hue word bracketed by two colour chips of its own mass.** `purple` spoke
  for stops 4–5 between a `dark mauve` (magenta) and an `indigo` (violet) —
  three purple-family words for one visible run, invisible to the family-level
  rule because the eight-band partition splits a continuous purple across three
  bands. `regionAlreadyNamed` now also refuses a word whose whole region lies
  between two chips whose families are adjacent to it on the wheel, with brown,
  purple and pink mapped to their parent bands.
- **A journey needs two ends.** `seamless` (0.02) only catches a palette that
  closes inside a JND; one that goes out and comes back to 0.0889 printed "warm
  purple to dark royal blue" over an arch. The bar is now CHIP_SEPARATION — 120
  rows are that cyclic, 40 of which still printed a pair.
- Implications added: `complementary → warm cool contrast` (the opposed pair IS
  the temperature pair on 4 of 10 such rows), `iso-luminant →` the three value
  bands (one lightness sits in one band by construction).
- Predicate fixes that removed a redundancy at its root rather than by dedupe:
  `desaturating` refuses a run whose last sample is under BLACK_L (no chroma
  left to lose — the trend is negative by construction), 113 → 110 test;
  `neutral-anchored` refuses a clip plateau as its "neutral ground", 38 → 29
  strong; `low-contrast` refuses the degenerate palette, 51 → 50 strong.

### 16.4 Terms that were missing

- **`dusty`, and it is not a synonym of `muted`.** The inventory calls it a
  prose synonym, and read absolutely it is; read RELATIVELY (chroma against the
  sRGB ceiling at the stop's own lightness) there are 85 palettes that look
  greyed and that `muted` cannot reach — 75 of them carried no chroma-axis chip
  at all. Floored at MUTED_CHROMA so the two sets are disjoint: measured overlap
  0 of 85. Margin at the next tenth: 32 strong.
- **`pastel` gets a second route to its margin.** The chroma-only band demanded
  a HALF-pastel and refused the most obviously pastel image in the batch (L
  0.900, C 0.0875); the second route is the same margin on the other conjunct,
  past NEAR_WHITE_L. 34 → 58 strong.
- **A row with no fact at all says the nearest true thing.** One fixture row had
  five simultaneous near-misses and printed three colour names and a journey.
  `ChipSelection.plain` re-ranks the merely-true terms when the first pass comes
  back empty, on the PLAIN rate because that is the population it draws from.
  Bounded and asserted: at most one such term, only on a row with no term that
  has margin.
- **`midtone band` → `midtones`** (D24.4: the designer's word, not the
  measurement's spelling).

### 16.5 What the row looks like now

Chips per row: 2/1 3/18 4/75 5/252 6/245 7/161 8/73 9/35 10/5 11/2, mean 5.98
(6.51 before). Rows of five or fewer: 346 of 867 (39.9%). Dimensions per row:
867 draw on two kinds, 831 on three, 474 on four — **all three up**, which is
the round's point: the slots the list form and the low-population compounds gave
up went to axes the row did not already have. By axis: colour 867, journey 688,
value 425, chroma 304, compound 178, temperature 178, harmony 146, contrast 129,
hue 128, family 103, gradient 102, appearance 0.

### 16.6 Declined, with evidence

- **Three blue words on `_epCgIkgIihmj…`** (`azul | marine | green blue`). By
  this repo's own partition `green blue` names #00b59c, which is CYAN and a
  visible teal beside the navy — the row holds two blues, not three, and the
  FAMILY_CHIPS cap is doing its job. An escalating same-family bar was built and
  measured before being taken back out: it re-files QA round 2's verdict on the
  palette that rule was written for (#03003b → #c4d7f4, where it dropped
  `cornflower blue` and left the middle of a seven-stop ramp unnamed) at a cost
  of 0.0017 of mean colour cover. The note stays in `spanningColors` so nobody
  re-adds it.
- **`washed out`, `achromatic` and `rich` as registry terms.** The inventory
  writes `washed out` as "pastel test OR a chroma trend ending under 0.04" — the
  first half IS `pastel` (identical predicate, 71 palettes) and the second is
  the fade row, and its own misuse note says "prefer for trajectory, not as a
  standing label". `achromatic` is the theory word for `grayscale` (its literal
  test fires on 24 against grayscale's 19, and the 5 it adds are D19's rescues,
  pale colours rather than grays). `rich` is 107 palettes of which 105 are
  `jewel tones`; the inventory says "pick one, never both". All three would be a
  second label on a shipped predicate, which is the drift the registry exists to
  prevent. `dusty` LEFT this list because it was measured and turned out not to
  be a synonym.


## 17. D25 final consolidation (2026-08-19) — the coverage table

The registry is finished and this section is the record the owner asked for:
every colour-theory term the code carries, what it measures, how often it is
true, how often it is true *with margin*, and whether it may spend a chip. Every
number is a measurement over the 867-seed fixture (`test/prose-corpus.js`) at the
default view — `linearGradient`, 7 steps, 90° — and every one of them is
re-measured by `palette-characteristics.test.js`, so drift fails the build.

**Where the code is.** `packages/data-ops/src/gradient-gen/palette-characteristics.ts`
holds the registry (`CHARACTERISTICS`, 135 entries), the prominence machinery
and the D25.3 exclusions. `apps/web/src/tag-search.ts` reads the same predicates
for `/palettes/{term}`, so a chip and its destination cannot disagree.
`apps/web/src/palette-prose.ts` assembles the row.

### 17.1 The three gates a term passes to become a chip

1. **TRUE** — `test` fires. This is also what `/palettes/{term}` filters on.
2. **TRUE WITH MARGIN** — `strong` fires: comfortably past the threshold rather
   than sitting on it (D24.1b). Written per term as an explicit second
   threshold, never as a fudge factor.
3. **DISCRIMINATING AND REACHABLE** — the strong rate is under
   `PROMINENCE_CEILING` (0.6: a fact true of two palettes in three is not a
   characteristic of this one), and the *plain* rate is at or above
   `CHIP_SUPPORT_FLOOR` (24/867 — one page of results). The floor is on the
   plain rate on purpose: the page filters on `test`, so `test` is what decides
   how many palettes the destination can find. The margin decides whether the
   CHIP is honest; the floor decides whether the LINK is.

A term that fails gate 3 keeps everything else — it is measured, published in
`/{seed}.json`, ridden by the embedding, and answers its own URL with a
deterministically filtered page. It simply never becomes a link.

### 17.2 Coverage — 135 terms across eight inventory domains plus `family`

| domain | terms | chip-eligible | tag-only | reach a printed row |
|---|--:|--:|--:|--:|
| hue | 46 | 37 | 9 | 12 |
| value | 17 | 14 | 3 | 14 |
| chroma | 13 | 10 | 3 | 10 |
| temperature | 7 | 4 | 3 | 2 |
| harmony | 14 | 6 | 8 | 6 |
| contrast | 9 | 6 | 3 | 6 |
| gradient | 23 | 7 | 16 | 6 |
| appearance | 3 | 0 | 3 | 0 |
| family | 3 | 3 | 0 | 3 |
| **total** | **135** | **87** | **48** | **59** |

"Reach a printed row" is a third, stricter column than "chip-eligible", and the
gap between them is the row's own rules doing their job rather than a defect:

- **`ramp`** (508 true, 271 strong) is eligible and never chosen, because
  `brightening` and `ombre` both imply it and the measured near-synonym group
  keeps `brightening`. `ramp` is the shape; `brightening` is what a reader sees
  the shape doing.
- **`warming` / `cooling`** are chosen 60 and 48 times and printed zero, because
  the row already carries the journey as a colour-to-colour chip
  (D23.1) — "sky blue to pale salmon" says the same thing with the palette's own
  colours in it.
- **25 of the 37 chip-eligible hue names** are chosen and then refused at the
  row, because a hue-axis term is a COLOUR query and colour chips keep first
  claim (D23.2): the term may not repeat a colour label's head word and may not
  lead to the same page as one. The colour vocabulary that wins those slots is
  far richer than the hue registry (1,373 distinct labels over the fixture), so
  nothing is lost to the reader; the hue terms still carry the tag, the embed
  value and the page.

### 17.3 The full table

Fires / prominent are counts out of 867 followed by the percentage. "rows" is
how many of the 867 finished chip rows print the term.

**HUE** — 46 terms · 37 chip-eligible · 9 tag-only · 12 reach a printed row

| term | fires | % | prominent | % | chips? | rows | note |
|---|--:|--:|--:|--:|:--|--:|---|
| `blue` | 308 | 35.5 | 210 | 24.2 | chip | 2 |  |
| `quarter-wheel` | 287 | 33.1 | 245 | 28.3 | tag-only | 0 | registry tagOnly |
| `yellow` | 257 | 29.6 | 149 | 17.2 | chip | 4 |  |
| `cyan` | 222 | 25.6 | 128 | 14.8 | chip | 3 |  |
| `red` | 222 | 25.6 | 145 | 16.7 | chip (never printed) | 0 |  |
| `orange` | 212 | 24.5 | 96 | 11.1 | chip | 2 |  |
| `violet` | 196 | 22.6 | 105 | 12.1 | chip | 3 |  |
| `magenta` | 169 | 19.5 | 85 | 9.8 | chip | 3 |  |
| `green` | 168 | 19.4 | 96 | 11.1 | chip (never printed) | 0 |  |
| `half-wheel` | 160 | 18.5 | 111 | 12.8 | tag-only | 0 | registry tagOnly |
| `azure` | 154 | 17.8 | 73 | 8.4 | chip (never printed) | 0 |  |
| `hue-advancing` | 154 | 17.8 | 55 | 6.3 | tag-only | 0 | registry tagOnly |
| `hue-reversing` | 150 | 17.3 | 53 | 6.1 | tag-only | 0 | registry tagOnly |
| `pink` | 147 | 17.0 | 77 | 8.9 | chip | 4 |  |
| `brown` | 139 | 16.0 | 52 | 6.0 | chip | 1 |  |
| `rose` | 134 | 15.5 | 66 | 7.6 | chip (never printed) | 0 |  |
| `spectral order` | 115 | 13.3 | 36 | 4.2 | chip | 30 |  |
| `sand` | 97 | 11.2 | 25 | 2.9 | chip (never printed) | 0 |  |
| `crimson` | 85 | 9.8 | 43 | 5.0 | chip (never printed) | 0 |  |
| `navy` | 83 | 9.6 | 36 | 4.2 | chip (never printed) | 0 |  |
| `coral` | 71 | 8.2 | 16 | 1.8 | chip (never printed) | 0 |  |
| `purple` | 65 | 7.5 | 26 | 3.0 | chip (never printed) | 0 |  |
| `salmon` | 65 | 7.5 | 17 | 2.0 | chip | 1 |  |
| `terracotta` | 64 | 7.4 | 21 | 2.4 | chip (never printed) | 0 |  |
| `mint` | 61 | 7.0 | 15 | 1.7 | chip | 1 |  |
| `rust` | 61 | 7.0 | 22 | 2.5 | chip (never printed) | 0 |  |
| `turquoise` | 60 | 6.9 | 20 | 2.3 | chip (never printed) | 0 |  |
| `ultramarine` | 54 | 6.2 | 27 | 3.1 | chip (never printed) | 0 |  |
| `amber` | 52 | 6.0 | 12 | 1.4 | chip (never printed) | 0 |  |
| `hue-wandering` | 48 | 5.5 | 17 | 2.0 | tag-only | 0 | registry tagOnly |
| `gold` | 47 | 5.4 | 14 | 1.6 | chip (never printed) | 0 |  |
| `lavender` | 45 | 5.2 | 15 | 1.7 | chip (never printed) | 0 |  |
| `olive` | 45 | 5.2 | 18 | 2.1 | chip (never printed) | 0 |  |
| `peach` | 42 | 4.8 | 4 | 0.5 | chip (never printed) | 0 |  |
| `cerulean` | 41 | 4.7 | 13 | 1.5 | chip (never printed) | 0 |  |
| `ochre` | 40 | 4.6 | 3 | 0.3 | chip (never printed) | 0 |  |
| `spring green` | 36 | 4.2 | 16 | 1.8 | chip (never printed) | 0 |  |
| `chartreuse` | 35 | 4.0 | 14 | 1.6 | chip (never printed) | 0 |  |
| `maroon` | 34 | 3.9 | 9 | 1.0 | chip (never printed) | 0 |  |
| `sky` | 33 | 3.8 | 5 | 0.6 | chip | 1 |  |
| `teal` | 33 | 3.8 | 9 | 1.0 | chip (never printed) | 0 |  |
| `periwinkle` | 32 | 3.7 | 9 | 1.0 | chip (never printed) | 0 |  |
| `near-full-circle` | 30 | 3.5 | 24 | 2.8 | tag-only | 0 | registry tagOnly |
| `full-wheel` | 21 | 2.4 | 21 | 2.4 | tag-only | 0 | registry tagOnly |
| `mustard` | 19 | 2.2 | 3 | 0.3 | tag-only | 0 | support 19 < 24/page |
| `hue cycling` | 6 | 0.7 | 4 | 0.5 | tag-only | 0 | registry tagOnly |

**VALUE** — 17 terms · 14 chip-eligible · 3 tag-only · 14 reach a printed row

| term | fires | % | prominent | % | chips? | rows | note |
|---|--:|--:|--:|--:|:--|--:|---|
| `brightening` | 298 | 34.4 | 193 | 22.3 | chip | 124 |  |
| `high-key` | 169 | 19.5 | 78 | 9.0 | chip | 66 |  |
| `darkening` | 156 | 18.0 | 78 | 9.0 | chip | 49 |  |
| `light` | 139 | 16.0 | 73 | 8.4 | chip | 7 |  |
| `near-black` | 103 | 11.9 | 40 | 4.6 | chip | 37 |  |
| `bright-middle` | 100 | 11.5 | 46 | 5.3 | chip | 35 |  |
| `dark` | 97 | 11.2 | 47 | 5.4 | chip | 10 |  |
| `near-white` | 70 | 8.1 | 42 | 4.8 | chip | 44 |  |
| `dark-middle` | 61 | 7.0 | 27 | 3.1 | chip | 30 |  |
| `low-key` | 48 | 5.5 | 11 | 1.3 | chip | 12 |  |
| `deep` | 47 | 5.4 | 17 | 2.0 | chip | 20 |  |
| `midtones` | 43 | 5.0 | 15 | 1.7 | chip | 18 |  |
| `chiaroscuro` | 28 | 3.2 | 10 | 1.2 | chip | 10 |  |
| `highlight band` | 25 | 2.9 | 7 | 0.8 | chip | 6 |  |
| `tints` | 21 | 2.4 | 14 | 1.6 | tag-only | 0 | support 21 < 24/page |
| `shadow band` | 6 | 0.7 | 2 | 0.2 | tag-only | 0 | support 6 < 24/page |
| `shades` | 1 | 0.1 | 1 | 0.1 | tag-only | 0 | support 1 < 24/page |

**CHROMA** — 13 terms · 10 chip-eligible · 3 tag-only · 10 reach a printed row

| term | fires | % | prominent | % | chips? | rows | note |
|---|--:|--:|--:|--:|:--|--:|---|
| `vivid` | 185 | 21.3 | 102 | 11.8 | chip | 50 |  |
| `saturating` | 159 | 18.3 | 66 | 7.6 | chip | 65 |  |
| `neutral-anchored` | 157 | 18.1 | 29 | 3.3 | chip | 29 |  |
| `desaturating` | 110 | 12.7 | 30 | 3.5 | chip | 33 |  |
| `muted` | 93 | 10.7 | 64 | 7.4 | chip | 31 |  |
| `earthy` | 88 | 10.1 | 36 | 4.2 | chip | 36 |  |
| `dusty` | 85 | 9.8 | 32 | 3.7 | chip | 33 |  |
| `pastel` | 71 | 8.2 | 47 | 5.4 | chip | 43 |  |
| `neon` | 69 | 8.0 | 30 | 3.5 | chip | 30 |  |
| `jewel tones` | 42 | 4.8 | 10 | 1.2 | chip | 12 |  |
| `brilliant` | 19 | 2.2 | 8 | 0.9 | tag-only | 0 | support 19 < 24/page |
| `sepia` | 5 | 0.6 | 4 | 0.5 | tag-only | 0 | support 5 < 24/page |
| `tones` | 5 | 0.6 | 2 | 0.2 | tag-only | 0 | support 5 < 24/page |

**TEMPERATURE** — 7 terms · 4 chip-eligible · 3 tag-only · 2 reach a printed row

| term | fires | % | prominent | % | chips? | rows | note |
|---|--:|--:|--:|--:|:--|--:|---|
| `warm` | 399 | 46.0 | 188 | 21.7 | chip | 92 |  |
| `cooling` | 315 | 36.3 | 49 | 5.7 | chip (never printed) | 0 |  |
| `cool` | 312 | 36.0 | 173 | 20.0 | chip | 71 |  |
| `warming` | 302 | 34.8 | 62 | 7.2 | chip (never printed) | 0 |  |
| `temperature-neutral` | 156 | 18.0 | 0 | 0.0 | tag-only | 0 | registry tagOnly |
| `cool gray` | 16 | 1.8 | 10 | 1.2 | tag-only | 0 | support 16 < 24/page |
| `warm gray` | 9 | 1.0 | 6 | 0.7 | tag-only | 0 | support 9 < 24/page |

**HARMONY** — 14 terms · 6 chip-eligible · 8 tag-only · 6 reach a printed row

| term | fires | % | prominent | % | chips? | rows | note |
|---|--:|--:|--:|--:|:--|--:|---|
| `polychromatic` | 382 | 44.1 | 0 | 0.0 | tag-only | 0 | registry tagOnly |
| `multicolor` | 307 | 35.4 | 0 | 0.0 | tag-only | 0 | registry tagOnly |
| `analogous` | 247 | 28.5 | 109 | 12.6 | chip | 47 |  |
| `monochrome` | 137 | 15.8 | 54 | 6.2 | chip | 26 |  |
| `rainbow` | 75 | 8.7 | 27 | 3.1 | chip | 17 |  |
| `complementary` | 50 | 5.8 | 34 | 3.9 | chip | 35 |  |
| `duotone` | 32 | 3.7 | 20 | 2.3 | chip | 9 |  |
| `accented analogous` | 27 | 3.1 | 13 | 1.5 | chip | 15 |  |
| `grayscale` | 19 | 2.2 | 6 | 0.7 | tag-only | 0 | support 19 < 24/page |
| `triadic` | 1 | 0.1 | 1 | 0.1 | tag-only | 0 | support 1 < 24/page |
| `discord` | 0 | 0.0 | 0 | 0.0 | tag-only | 0 | support 0 < 24/page |
| `split complementary` | 0 | 0.0 | 0 | 0.0 | tag-only | 0 | support 0 < 24/page |
| `square` | 0 | 0.0 | 0 | 0.0 | tag-only | 0 | support 0 < 24/page |
| `tetradic` | 0 | 0.0 | 0 | 0.0 | tag-only | 0 | support 0 < 24/page |

**CONTRAST** — 9 terms · 6 chip-eligible · 3 tag-only · 6 reach a printed row

| term | fires | % | prominent | % | chips? | rows | note |
|---|--:|--:|--:|--:|:--|--:|---|
| `wcag-aa` | 355 | 40.9 | 0 | 0.0 | tag-only | 0 | registry tagOnly |
| `hue contrast` | 301 | 34.7 | 14 | 1.6 | chip | 9 |  |
| `wcag-aaa` | 199 | 23.0 | 0 | 0.0 | tag-only | 0 | registry tagOnly |
| `warm cool contrast` | 198 | 22.8 | 47 | 5.4 | chip | 38 |  |
| `high-contrast` | 106 | 12.2 | 30 | 3.5 | chip | 24 |  |
| `low-contrast` | 94 | 10.8 | 50 | 5.8 | chip | 47 |  |
| `iso-luminant` | 50 | 5.8 | 4 | 0.5 | chip | 6 |  |
| `saturation contrast` | 40 | 4.6 | 8 | 0.9 | chip | 12 |  |
| `extension contrast` | 3 | 0.3 | 0 | 0.0 | tag-only | 0 | support 3 < 24/page |

**GRADIENT** — 23 terms · 7 chip-eligible · 16 tag-only · 6 reach a printed row

| term | fires | % | prominent | % | chips? | rows | note |
|---|--:|--:|--:|--:|:--|--:|---|
| `ramp` | 508 | 58.6 | 271 | 31.3 | chip (never printed) | 0 |  |
| `clipped` | 350 | 40.4 | 205 | 23.6 | tag-only | 0 | registry tagOnly |
| `banding` | 240 | 27.7 | 0 | 0.0 | tag-only | 0 | registry tagOnly |
| `clipped-highlights` | 214 | 24.7 | 96 | 11.1 | tag-only | 0 | registry tagOnly |
| `flat spot` | 174 | 20.1 | 26 | 3.0 | chip | 26 |  |
| `crushed-shadows` | 161 | 18.6 | 52 | 6.0 | tag-only | 0 | registry tagOnly |
| `ombre` | 157 | 18.1 | 8 | 0.9 | chip | 6 |  |
| `unclipped` | 155 | 17.9 | 155 | 17.9 | tag-only | 0 | registry tagOnly |
| `arch` | 108 | 12.5 | 41 | 4.7 | chip | 6 |  |
| `flat-channel` | 95 | 11.0 | 95 | 11.0 | tag-only | 0 | registry tagOnly |
| `wavy` | 82 | 9.5 | 23 | 2.7 | chip | 29 |  |
| `gradient map` | 77 | 8.9 | 39 | 4.5 | tag-only | 0 | registry tagOnly |
| `wash` | 77 | 8.9 | 15 | 1.7 | chip | 20 |  |
| `seamless` | 40 | 4.6 | 20 | 2.3 | chip | 20 |  |
| `duotone gradient` | 21 | 2.4 | 16 | 1.8 | tag-only | 0 | support 21 < 24/page |
| `pure-black-plateau` | 21 | 2.4 | 10 | 1.2 | tag-only | 0 | support 21 < 24/page |
| `fade to black` | 12 | 1.4 | 7 | 0.8 | tag-only | 0 | support 12 < 24/page |
| `fade to gray` | 10 | 1.2 | 7 | 0.8 | tag-only | 0 | support 10 < 24/page |
| `fade to white` | 10 | 1.2 | 8 | 0.9 | tag-only | 0 | support 10 < 24/page |
| `pure-white-plateau` | 6 | 0.7 | 6 | 0.7 | tag-only | 0 | support 6 < 24/page |
| `smooth` | 4 | 0.5 | 0 | 0.0 | tag-only | 0 | registry tagOnly |
| `repeating` | 1 | 0.1 | 1 | 0.1 | tag-only | 0 | support 1 < 24/page |
| `solid` | 1 | 0.1 | 1 | 0.1 | tag-only | 0 | support 1 < 24/page |

**APPEARANCE** — 3 terms · 0 chip-eligible · 3 tag-only · 0 reach a printed row

| term | fires | % | prominent | % | chips? | rows | note |
|---|--:|--:|--:|--:|:--|--:|---|
| `blue-yellow axis` | 231 | 26.6 | 167 | 19.3 | tag-only | 0 | registry tagOnly |
| `luminous` | 159 | 18.3 | 61 | 7.0 | tag-only | 0 | registry tagOnly |
| `green-red axis` | 132 | 15.2 | 95 | 11.0 | tag-only | 0 | registry tagOnly |

**FAMILY** — 3 terms · 3 chip-eligible · 0 tag-only · 3 reach a printed row

| term | fires | % | prominent | % | chips? | rows | note |
|---|--:|--:|--:|--:|:--|--:|---|
| `sunset` | 116 | 13.4 | 85 | 9.8 | chip | 40 |  |
| `ocean` | 87 | 10.0 | 66 | 7.6 | chip | 47 |  |
| `autumn` | 25 | 2.9 | 22 | 2.5 | chip | 22 |  |

### 17.4 What we deliberately do NOT implement (D25.3)

Recorded in the code so nobody re-adds them: the file header of
`palette-characteristics.ts` carries the global ban list, and four more blocks
carry the per-section ones (search `D25.3`).

**Not computable from diffuse colour — must never ship as claims:**

| term | why not |
|---|---|
| metallic | gonio-apparent: the same surface reads a different lightness per viewing angle. A gradient has one colour per position and no angular information. |
| iridescent | thin-film interference; needs a spectral model and an angle, not three sRGB channels. |
| holographic | the same, plus a diffraction structure. |
| simultaneous contrast | a perceived shift caused by the SURROUND, which is the visitor's page. The trigger is computable and still says nothing about the palette. |
| assimilation / Bezold | the opposite induction, and it depends on the spatial frequency of the pattern the colours are shown in, not on the colours. |
| Kelvin colour temperature | defined for illuminants on the Planckian locus. Surface colours are not illuminants; `warm`/`cool` here are hue-arc claims and say so. |
| luma / luminosity | display-encoded shorthands. Where we mean light we compute WCAG relative luminance or OkLCh L, and we name which. |

**Computable, but a second name for a shipped predicate.** A synonym is not
free: it doubles the row's vocabulary, splits the filter's traffic across two
destinations that must never disagree, and gives the reader two words for one
fact. Each was measured before being refused:

| term | measured | ships instead as |
|---|---|---|
| vibrant | identical predicate to `vivid`, same 185 palettes | prose synonym only |
| achromatic | its literal test fires on 24 against `grayscale`'s 19; the 5 it adds are pale colours, not grays | `grayscale` |
| rich | 107 palettes, 105 of them also `jewel tones` | `jewel tones` |
| pale | 39 palettes, 36 already `pastel`, the other 3 are `grayscale` | `pastel` |
| washed out | half of it IS `pastel` (identical predicate, 71 palettes), half is the fade row | `pastel` / the fade terms |
| neutral (chroma sense) | the grayscale test again, and the word collides with the indexed `warmth: neutral` | `grayscale`, `temperature-neutral` |
| narrow band | the inventory's test is span < 30, which is `monochrome`'s | `monochrome` |
| tonal range / dynamic range | ΔL, which `high-contrast` / `low-contrast` already ship both ends of | those two |
| value contrast (Itten 2) | ΔL bands, already shipped | `high-contrast` / `low-contrast` |
| complementary contrast (Itten 4) | this IS the `complementary` row | `complementary` |
| flat spots | the inventory's test is `clipped >= 0.25` and CLIPPED_FRACTION is 0.25 | `clipped` |
| WCAG AA-large (CR ≥ 3) | 0.5986 of the fixture — no information | `wcag-aa` (4.5), `wcag-aaa` (7) |
| even / uneven spacing | no cut is discriminating: CV of stop distances is 51.4% below 0.3, 95.7% below 0.6 | `banding` |
| hue turn | 73.1% with no deadband, 43.1% with a 1° one | `hue-wandering` |
| gradient, blend, easing | vacuous — true of the FUNCTION for all 867 seeds | — |
| color stop, interpolation direction | the view, not the palette | URL parameters |
| tertiary / primary / secondary | RYB-vs-RGB-vs-CMY ambiguous. Never emit. | the extended hue names |
| indigo | web #4b0082 measures h 301.7 through this repo's conversion (a dark purple) while the spectral position is near 279 | inbound search synonym only |
| scarlet, vermilion, khaki, tan, beige, lilac, fuchsia, aqua | the same inventory ROWS as terms that ship | `crimson`/`red`, `sand`, `lavender`, `magenta`, `cyan` |
| lightness, value, brightness, luminance, hue, hue family | axes and lookups, not characteristics | — |
| harmony (the umbrella) | the classification itself | `classifyStructure` |

### 17.5 The `complementary` fix (D24.2), completed

D24.2 asked for a second, honest route to the word so it could fire on a
continuous sweep, and named the case: the owner's screenshot palette
(`#88d5f2 … #ffc1a1`), whose two ends are 175.5° apart but which forms ONE
184.3° hue cluster, so the two-isolated-clusters test could never see it.

The route shipped in an earlier package (`opposedHueMasses`: two hue masses at
real chroma sitting `COMPLEMENTARY_SEPARATION` apart, whatever the path between
them). The **margin** on that route was still wrong, and this consolidation
found it: `strong` required each pole to hold 0.3 of the chromatic run AND the
pair to sum to 0.85, and the owner's palette measures 0.438 at h30 and 0.375 at
h240 — poles fine, sum 0.813. So the palette carried `complementary` in its
`<h1>` and in its description while its chip row silently dropped it, which is
the one outcome D24.2 was written to prevent. (The note that justified the 0.85
bar quoted 0.875 for this palette; that figure does not reproduce against the
code, which is why the error survived a round.)

**The fix is at the root and it removes a number rather than tuning one.**
Measured over the fixture's 28 non-cluster complementaries: the pole conjunct
alone refuses 14 of them, and the LOWEST pair-sum among the 14 it admits is
0.804 — already past `MASS_BOTH_SHARE` (0.8). The 0.85 bar was therefore not
measuring a margin; it was clipping three palettes off the bottom of a
distribution the pole had already cut in half. `strong` is now
`opposedHueMasses(f, { pole: 0.3 })`: **the margin on the sweep route is the pole
share, and only that** — a mass that is a third of the run is a colour the
palette is MADE of, a fifth is one it passes through.

| | before | after |
|---|--:|--:|
| `complementary` true | 50 (5.77%) | 50 (5.77%) |
| `complementary` strong | 31 (3.58%) | 34 (3.92%) |
| — by the cluster route | 22 | 22 |
| — by the mass route | 17 | 20 |
| rows printing `complementary` | 32 | 35 |

Everything the change moved, re-measured and written back into the suite:
chips-per-palette 5/252 6/245 7/161 8/73 → 5/251 6/246 7/160 8/74 (mean
unchanged at 5.98); prominent-set sizes 5/172 6/157 → 5/170 6/159; rows with a
harmony chip 146 → 149; rows with a contrast chip 129 → 128 (the word shadows
`hue contrast` and `warm cool contrast`); rows drawing on four or more kinds 474
→ 476; registry terms shown 1,547 → 1,549.

**The owner's palette, through the full path.** Fitted from the 21 screenshot
hexes (rmse 0.00089; the 7-step render is `#89d5f2 … #ffc1a1`):

```
title  Complementary sky blue and pale salmon
chips  light coral | pinkish brown | sky blue | pale salmon | grayish teal |
       purplish gray | sky blue to pale salmon | dark-middle | complementary
```

### 17.6 Chip row, re-measured over the 867

| chips in the row | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| palettes | 1 | 18 | 75 | 251 | 246 | 160 | 74 | 35 | 5 | 2 |

Mean 5.98, min 2, max 11, 5,186 chips in total. **1,373 distinct labels**, 817
of them (59.5%) used exactly once — the row is drawn from a long tail, not from
a handful of stock words.

Where the 5,186 chips come from:

| source | chips | share |
|---|--:|--:|
| colour name (the corpus vocabulary) | 2,768 | 53.4% |
| journey (colour → colour, D23.1) | 688 | 13.3% |
| registry fact — value | 468 | 9.0% |
| registry fact — chroma | 362 | 7.0% |
| compound (two co-fired terms) | 180 | 3.5% |
| registry fact — temperature | 163 | 3.1% |
| registry fact — harmony | 149 | 2.9% |
| registry fact — contrast | 136 | 2.6% |
| registry fact — family | 109 | 2.1% |
| registry fact — gradient | 107 | 2.1% |
| registry fact — hue | 55 | 1.1% |
| dominant-plateau word | 1 | 0.0% |

Registry facts total 1,549, which is the number the suite asserts. Distinct
dimensions per row: 2 on 40 palettes, 3 on 388, 4 on 299, 5 on 121, 6 on 18,
7 on 1 — mean 3.64, and no row draws on fewer than two.

**Top 20 labels** (of 1,373):

| # | label | rows | # | label | rows |
|--:|---|--:|--:|---|--:|
| 1 | brightening | 124 | 11 | analogous | 47 |
| 2 | warm | 92 | 12 | near-white | 44 |
| 3 | cool | 71 | 13 | pastel | 43 |
| 4 | high-key | 66 | 14 | sunset | 40 |
| 5 | saturating | 65 | 15 | warm cool contrast | 38 |
| 6 | almost black | 57 | 16 | near-black | 37 |
| 7 | vivid | 50 | 17 | earthy | 36 |
| 8 | darkening | 49 | 18 | complementary | 35 |
| 9 | low-contrast | 47 | 19 | bright-middle | 35 |
| 10 | ocean | 47 | 20 | dusty | 33 |

The most common label is true of one row in seven. Nothing is a stock word.

**The separation invariant still holds.** Recomputed independently of the suite
over the whole fixture: 3,457 stop pairs (628 same-family, 2,829 cross-family),
minimum margin 0.0021 past the bar; 3,462 anchor pairs against the fixed
`CHIP_SEPARATION` of 0.11, minimum margin 0.0000 — the bar binds exactly, so it
is a live constraint and not a formality. **Zero violations on either.**

**And the floor is airtight**: across all 867 rows, the number of registry-fact
chips drawn from a term the floor or `tagOnly` holds back is **0**.

### 17.7 Tag-filter precision per term family

Measured through the real path — `recognizeTagQuery` → expansions →
over-fetch → `applyTagFilter` — against a production-size pool, precision@24.
Two vocabularies: the OLD indexed text (what Vectorize holds today) and the NEW
`paletteEmbedText()` (what the pending reindex will hold, whose Tags line
carries every firing registry term).

| family | terms | median support | old: before → after | reindexed: before → after |
|---|--:|--:|---|---|
| hue | 46 | 107 | 0.566 → 0.783 | 0.839 → 0.980 |
| value | 17 | 61 | 0.233 → 0.493 | 0.684 → 0.865 |
| chroma | 13 | 88 | 0.186 → 0.554 | 0.692 → 0.901 |
| temperature | 7 | 302 | 0.792 → 0.988 | 0.875 → 1.000 |
| harmony | 14 | 50 | 0.107 → 0.262 | 0.610 → 0.628 |
| contrast | 9 | 106 | 0.157 → 0.315 | 0.750 → 0.838 |
| gradient | 23 | 77 | 0.158 → 0.341 | 0.656 → 0.734 |
| appearance | 3 | 159 | 0.361 → 0.847 | 1.000 → 1.000 |
| family | 3 | 116 | 0.208 → 0.708 | 1.000 → 1.000 |
| **all 135** | | | **0.342 → 0.574** | **0.753 → 0.872** |
| **the 87 chip-eligible** | | | **0.444 → 0.685** | **0.832 → 0.985** |
| the 48 tag-only | | | 0.158 → 0.373 | 0.610 → 0.667 |

Two properties matter more than the numbers, which move with the corpus, and
both hold on all 135 terms: filtering is **monotone** (it never makes a page
worse than the raw semantic order) and **pool-bound, not filter-bound** (`after`
equals the pool ceiling on every term — every satisfying palette the pool holds
reaches page 1). What is left to win is pool composition, which is the reindex.

The number that answers D25.6: **the terms a visitor can actually click reach
0.985 precision@24 after the reindex.**

### 17.8 Terms held back from chips, and why

24 terms are chip-ineligible because their support is under one page. Three
kinds, and only the first is "the page cannot return a matching set":

**(a) Genuinely absent or near-absent — the page has nothing to fill with.**

| term | support | p@24 (reindexed) |
|---|--:|--:|
| `split complementary` | 0 | 0.000 |
| `square` | 0 | 0.000 |
| `tetradic` | 0 | 0.000 |
| `discord` | 0 | 0.000 |
| `solid` | 1 | 0.042 |
| `shades` | 1 | 0.042 |
| `repeating` | 1 | 0.042 |
| `triadic` | 1 | 0.042 |
| `extension contrast` | 3 | 0.042 |
| `tones` | 5 | 0.208 |
| `pure-white-plateau` | 6 | 0.250 |
| `shadow band` | 6 | 0.250 |

This is D25.4's "absent, not broken". The rare harmonies stay in the registry
with their measured near-zero rates recorded, and they remain reachable: a chip
for one can only be emitted by a palette that satisfies it, so the page is never
empty of the palette that linked to it.

**(b) Thin but fillable — held back conservatively.**

| term | support | p@24 (reindexed) |
|---|--:|--:|
| `fade to white` | 10 | 0.417 |
| `fade to gray` | 10 | 0.417 |
| `fade to black` | 12 | 0.458 |
| `grayscale` | 19 | 0.750 |
| `brilliant` | 19 | 0.750 |
| `pure-black-plateau` | 21 | 0.875 |
| `tints` | 21 | 0.875 |
| `duotone gradient` | 21 | 0.875 |

**(c) Held back by the floor, but their pages fill completely.** These four are
ALSO corpus colour names, so `tagQueryMatch` deliberately widens for them (the
page retrieves palettes holding such a stop as well as palettes the registry
predicate is true of) and the destination support is far above one page:

| term | registry-predicate support | filter support | p@24 (reindexed) |
|---|--:|--:|--:|
| `sepia` | 5 | 104 | 1.000 |
| `warm gray` | 9 | 69 | 1.000 |
| `cool gray` | 16 | 82 | 1.000 |
| `mustard` | 19 | 73 | 1.000 |

`CHIP_SUPPORT_FLOOR` reads the registry predicate's prevalence, which is the
right quantity for every other term and the wrong one for these four. **Nothing
is broken** — the four keep their tag, their embed value and a page that returns
a full, correct result set — but the floor is measuring the strict predicate
where the page uses the wide one, so it is more conservative than D25.6 requires.
Left as-is at this consolidation because relaxing it is a behaviour change that
wants its own QA round; recorded here so the next one can take it.

### 17.9 Visual QA — twelve palettes spanning the domains

Rendered at the default view and read as images, one per domain cluster. Every
chip in every row was checked against the picture. **12 of 12 pass; nothing
obviously true of a palette was missing from its row.**

| # | domains exercised | palette | verdict |
|---|---|---|---|
| 1 | harmony, contrast, value | claret → sage → petrol | `complementary` right (red-brown h≈30 against petrol h≈210); `bright-middle` right (both ends dark, the sage middle lightest). ✅ |
| 2 | harmony, family, value | apricot → red → black | `analogous` (one warm arc), `autumn`, `sunset`, `chiaroscuro` (apricot to pure black), `near-black` all visible. ✅ |
| 3 | harmony, chroma, family | navy → electric blue | `monochrome` (one hue), `ocean`, `jewel tones`, `deep`, `vivid` all visible. ✅ |
| 4 | harmony, gradient, contrast | green → gold → rust → aubergine → blue → green | `rainbow`; `seamless` right — the last stop returns to the first; `dark-middle`; `warm cool contrast`. ✅ |
| 5 | chroma, value, gradient | white → pale pink → purple | `near-white` and `flat spot` right (three pure-white stops, a visible plateau); `pastel`, `saturating`, `darkening`. ✅ |
| 6 | chroma, hue, value | purple → magenta → sage → teal → blue | `neon` right (the ends glow); `spectral order` right (hues walk monotonically); `bright-middle`. ✅ |
| 7 | value, hue | black → dark red → orange → tan → cyan | `chiaroscuro` right (pure black to bright cyan); `near-black`; `spectral order`. ✅ |
| 8 | contrast, chroma | tan → pink → magenta | The textbook case: lightness visibly constant across the band while hue and chroma change. `iso-luminant` AND `saturation contrast` both right, `flat spot` right (the right third is flat magenta), `neon`. ✅ |
| 9 | contrast, value | yellow → cyan → blue → black → red | `high-contrast` (bright yellow to pure black), `hue contrast` (Itten 1: yellow/blue/red), `dark-middle`, `near-black`. Eleven chips and the palette earns all of them. ✅ |
| 10 | gradient, value | red → dark red → black | `ombre` right — one hue, monotone value travel, no turn. `deep`, `near-black`, `warm`. ✅ |
| 11 | gradient, contrast | pale blue → magenta → slate → sage | `wavy` right — the smooth band visibly oscillates; `saturation contrast` (pale slate against saturated magenta); `dark-middle`. ✅ |
| 12 | harmony, chroma | navy → sage → cream | `duotone` (two tight clusters), `neutral-anchored` (near-neutral middle), `dusty`, `brightening` all right. The `cool gray` in this row is a COLOUR NAME from the corpus naming the middle stop, not the temperature term — that term is tag-only and, as §17.6 records, no row anywhere prints a held-back term. ✅ |

PNGs: `${SCRATCH}/qa/d25/01…12.png`, plus `00-owner-screenshot.png`.

### 17.10 Island bundle, re-measured — a regression to decide on

`pnpm build` in `apps/web`, client chunks:

```
entry-DgJw-f1n.js       197.14 kB │ gzip 62.89 kB
module-ltquLR9-.js      167.83 kB │ gzip 55.37 kB
edit-Bw9FSaEB.js        161.12 kB │ gzip 56.53 kB
export-aMH0qLLu.js       26.76 kB │ gzip  8.99 kB
export-store-BNlSHl7G.js  6.15 kB │ gzip  2.53 kB
```

The edit island was **96.32 kB / 33.15 kB gzip** at §13.8 and is now **161.12 kB
/ 56.53 kB gzip**: **+64.80 kB raw, +23.38 kB gzip.** `relatedSearches` imports
the registry, so the whole of `palette-characteristics.ts` ships to the client.

**A third of that increase is documentation.** Every registry entry carries a
`note` explaining where its thresholds come from, and those strings are runtime
object properties, so Rollup keeps them. Measured on the built chunk: 53 note
strings totalling 18.99 kB raw, and stripping them takes the chunk from 55.20 kB
gzip to **47.62 kB** — **7.58 kB gzip of pure prose shipped to every visitor who
opens the editor.**

Not changed here: moving 135 notes out of the objects is a mechanical but
wide-reaching edit to a file three QA rounds have stabilised, and it wants its
own package. The measurement is recorded so the decision is costed. The
remaining ~15.8 kB gzip is the predicates and tables themselves, which is the
price of D25's exhaustive coverage and is what the owner asked for.
