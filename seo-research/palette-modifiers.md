# Palette modifiers

Status: implemented, uncommitted, in the working tree. 2026-08-16.

Palette names carried color names and nothing else: "Pale blue to dark magenta
to bright sky blue". This adds the adjectives — *monochrome*, *duotone*,
*pastel*, *neon*, *earthy*, *rainbow* — and, more importantly, a rule for
deciding which one to say.

Everything below is measured against all **866 live seeds** (from
`https://grabient.com/sitemap.xml`), rendered at **3, 7, 13 and 24 steps**, in
OkLCh. Lightness `L` runs 0-1; chroma `C` runs 0 to about 0.32 for an in-gamut
sRGB color; hue `h` is degrees.

The three consumers, in ascending order of consequence: the `<h2>` on a palette
page, the `<title>`, and the embedding text behind semantic search. The third is
why "close enough" is not good enough — a duotone described as "gray" is a
duotone that nobody retrieves.

---

## 0. Headline finding: `monochrome` currently means the wrong thing

`palette-tags.ts` emits `texture: 'monochrome'` when average saturation is under
0.05. That is **grayscale** — one *saturation* — not monochrome, which in every
design reference means one *hue* across many shades.

MEASURED, over all 866 palettes:

| | fires on | share |
|---|---|---|
| `texture: 'monochrome'` (saturation-based, shipped) | 18 | 2.1% |
| hue-based monochrome (one hue cluster, span < 30°) | 148 | 17.1% |
| **both** | **2** | 0.2% |

The shipped tag misses **146 of 148** real monochrome palettes — 98.6%. A
navy-through-powder-blue ramp is the textbook case and it is tagged `subtle`.

This is the single highest-value correction here, because `/palettes/monochrome`
already exists as a sitemap entry and "monochrome" is a term with real demand.
The new `monochrome` is emitted as an **additive serve-time tag**; the old
`texture` value is left exactly as it is, because it is mirrored into Vectorize.
Correcting it is a reindex — see §7.

---

## 1. Prior art

| source | what it gives | what it lacks here |
|---|---|---|
| xkcd / CSS Color 4 corpus (already in repo) | 843 names, and they already encode tone: *pale*, *dusty*, *deep*, *neon* | says nothing about the palette as a whole |
| Coolors, Adobe Color, Sessions College color calculator | the 12-segment wheel: analogous ±30°, complementary 180°, triadic 120° | built for hand-picked discrete swatches, not a continuous ramp |
| chroma.js / culori | conversions and interpolation | no classification layer |
| name-that-color | nearest-name lookup | single colors only |
| Common pastel definition (HSL `S < 40%`, `L > 75%`) | the shape of the rule: pastel needs light **and** unsaturated together | HSL saturation is not perceptual; the constants do not transfer to OkLCh |
| Duotone/monochrome photography literature | the distinction that matters: monochrome = one hue, duotone = two | — |

The useful import is the *structure* of the definitions, not the constants. Every
threshold below is a measured percentile of this corpus, because a constant
borrowed from an HSL blog post has no reason to split 866 cosine palettes well.

**Rule applied throughout:** a modifier firing on more than 60% or fewer than 2%
of the corpus carries no information and is not worth a word.

---

## 2. What the corpus actually looks like

MEASURED, per-palette aggregates. The 7/13/24-step columns are nearly identical,
which is the first hint that tone is step-stable and structure is not.

| quantity | p10 | p25 | p50 | p75 | p90 |
|---|---|---|---|---|---|
| mean L | 0.416 | 0.531 | 0.629 | 0.745 | 0.841 |
| L range | 0.119 | 0.206 | 0.339 | 0.491 | 0.641 |
| mean C | 0.039 | 0.065 | 0.102 | 0.143 | 0.174 |
| max C | 0.069 | 0.100 | 0.154 | 0.202 | 0.246 |

The corpus is **not very saturated**: median mean-chroma is 0.10 against an sRGB
ceiling near 0.32. A "neon" threshold imported from a design tool (C ≥ 0.3) would
fire on almost nothing here. At p90 of max-chroma (0.24) it fires on 9.8%.

Hue span — the smallest arc containing every chromatic stop:

```
   0- 10°   56   6.5%  #######
  10- 20°   48   5.5%  ######
  20- 30°   63   7.3%  ########
  30- 45°   65   7.5%  ########
  45- 60°   56   6.5%  #######
  60- 90°  119  13.7%  ###############
  90-120°   89  10.3%  ###########
 120-180°  190  21.9%  ########################
 180-240°  139  16.1%  #################
 240-300°   36   4.2%  #####
 300+       5   0.6%  #
```

---

## 3. The step-stability trap

**Hue structure read off the displayed `steps` is a sampling artifact.** Cutting
the hue circle at gaps wider than 40°, measured on the rendered stops:

| structure | 3 steps | 7 steps | 13 steps | 24 steps |
|---|---|---|---|---|
| duotone | 42.3% | 31.2% | 24.9% | 19.5% |
| multicolor | 21.8% | 19.1% | 15.5% | 14.3% |

A monotonic drift with step count is not a property of the palettes; it is
sparse sampling opening gaps that a denser sample fills. Per-palette agreement
between 7 and 13 steps was only 79.9%.

**Fix: structure is measured on a fixed dense sample (N=48) of the applied
coefficients, independent of `steps`.** A palette is a continuous function;
`steps` is a view of it. After the change, cluster counts agree 97.7% between
N=32 and N=48, and 99.0% between N=48 and N=64 — and the resulting structure tags
are **identical at 3, 7, 13 and 24 steps** (0 disagreements across 866 palettes).

Tone stays on the rendered stops, because tone is what you actually see, and it
is 98.6%+ step-stable regardless.

Color *names* remain steps-aware, as shipped previously: at 3 steps you genuinely
see three colors. So a palette can be "Duotone eggshell and green blue" at 13
steps and name different colors at 3, while never changing its structure.

---

## 4. Every candidate, measured

28 candidates were implemented and swept. `bits` is self-information
`-log2(prevalence)` — how much saying the word tells a reader.

| descriptor | axis | fires | share | bits | 7v13 stable | verdict |
|---|---|---|---|---|---|---|
| grayscale | structure | 24 | 2.8% | 5.2 | 100.0% | keep |
| monochrome | structure | 144 | 16.6% | 2.6 | 100.0% | keep |
| analogous | structure | 252 | 29.1% | 1.8 | 100.0% | keep, unspoken |
| duotone | structure | 68 | 7.9% | 3.7 | 100.0% | keep |
| complementary | structure | 80 | 9.2% | 3.4 | 100.0% | keep, spoken as "duotone" |
| multicolor | structure | 221 | 25.5% | 2.0 | 100.0% | keep, unspoken |
| rainbow | structure | 129 | 14.9% | 2.7 | 100.0% | keep |
| **splitComplement** | structure | **0** | **0.0%** | — | — | **DROP — never occurs** |
| **triadic** | structure | **2** | **0.2%** | 8.8 | 100.0% | **DROP — under 2%** |
| warm | temperature | 396 | 45.7% | 1.1 | 100.0% | keep, unspoken |
| cool | temperature | 310 | 35.8% | 1.5 | 100.0% | keep, unspoken |
| pastel | tone | 72 | 8.3% | 3.6 | 99.9% | keep |
| neon | tone | 85 | 9.8% | 3.3 | 99.5% | keep |
| muted | tone | 90 | 10.4% | 3.3 | 99.2% | keep |
| earthy | tone | 94 | 10.9% | 3.2 | 99.7% | keep |
| dark | tone | 93 | 10.7% | 3.2 | 99.1% | keep |
| light | tone | 142 | 16.4% | 2.6 | 99.7% | keep, unspoken |
| vivid | tone | 190 | 21.9% | 2.2 | 98.6% | keep, unspoken |
| high-contrast | contrast | 107 | 12.4% | 3.0 | 99.9% | keep, unspoken |
| low-contrast | contrast | 88 | 10.2% | 3.3 | 99.3% | keep, unspoken |
| ramp | shape | 507 | 58.5% | 0.8 | 100.0% | keep, unspoken |
| arch | shape | 277 | 32.0% | 1.6 | 100.0% | keep, unspoken |
| wavy | shape | 82 | 9.5% | 3.4 | 100.0% | keep, unspoken |
| saturating | trajectory | 208 | 24.0% | 2.1 | 100.0% | keep, unspoken |
| desaturating | trajectory | 157 | 18.1% | 2.5 | 100.0% | keep, unspoken |
| seamless | surface | 40 | 4.6% | 4.4 | 100.0% | keep, unspoken |
| clipped | surface | 350 | 40.4% | 1.3 | 100.0% | keep, unspoken |
| **cyclic** (hue travel ≥ 400°) | motion | **6** | **0.7%** | 7.2 | 100.0% | **DROP — under 2%** |

### On the harmony classes the brief asked for

- **analogous** and **complementary** are delivered — as *structure* values,
  since they are hue geometries. Emitting them on a second "harmony" axis
  double-counted analogous to 46.7%.
- **triadic** fires on 2 of 866 palettes and **split-complementary on none**. A
  cosine ramp sweeps hue continuously, so it lands on three evenly-spaced
  *isolated* clusters only by accident. Both are dropped under the 2% rule.
  This is a property of the generator, not an oversight.

### Modifiers from raw coefficients vs from rendered hex

- **From coefficients** (via the dense sample): all hue geometry, lightness-ramp
  shape (`ramp`/`arch`/`wavy`), `seamless` (do the ends meet — only visible on a
  conic gradient, where a mismatch is a hard seam at 0°), `clipped` (share of the
  ramp pinned flat by the model's `clamp01`), chroma trajectory.
- **From rendered hex in OkLCh**: everything tonal — `pastel`, `neon`, `muted`,
  `earthy`, `dark`, `light`, `vivid`, and the contrast pair.

---

## 4b. Second pass: is the colour-theory corpus actually covered?

Thirteen more candidates, measured the same way. The question was whether
anything in the classical vocabulary was still missing.

| candidate | fires | share | bits | 7v13 | verdict |
|---|---|---|---|---|---|
| **tetradic** | 0 | **0.0%** | — | 100% | **DROP — never occurs** |
| **square** | 0 | **0.0%** | — | 100% | **DROP — never occurs** |
| sunset | 122 | 14.1% | 2.8 | 99.8% | **ADD (spoken)** |
| ocean | 85 | 9.8% | 3.4 | 99.9% | **ADD (spoken)** |
| autumn | 22 | 2.5% | 5.3 | 99.9% | **ADD (spoken)** |
| high-key | 169 | 19.5% | 2.4 | 99.8% | ADD (tag) |
| low-key | 47 | 5.4% | 4.2 | 99.9% | ADD (tag) |
| wcag-aa | 357 | 41.2% | 1.3 | 99.7% | ADD (tag) |
| **forest** | 15 | **1.7%** | 5.9 | 99.9% | **DROP — under 2%** |
| **even** (ΔE CV < 0.35) | 531 | **61.3%** | 0.7 | 95.4% | **DROP — too broad** |
| **uneven** (CV > 0.9) | 12 | **1.4%** | 6.2 | 99.7% | **DROP — under 2%** |
| **accented-analogous** | 55 | 6.4% | 4.0 | 100% | **DROP — subset of duotone** |
| **hue-turn** | 471 | 54.4% | 0.9 | 100% | **DROP — 0.9 bits** |

### The answer: yes for harmony, no for families

**Harmony is exhausted, not sampled.** Every classical scheme has now been
implemented and measured. Monochromatic, analogous and complementary are well
populated; triadic (0.2%), split-complementary (0%), tetradic (0%) and square
(0%) are effectively absent. This is a fact about the generator: a cosine ramp
sweeps hue *continuously*, so it can only land on three or four evenly-spaced
**isolated** clusters by accident. Nothing is missing — the schemes are.

**The gap was the named families.** `sunset`, `ocean` and `autumn` are not
derivable from the axes already present — "sunset" is a specific arc of the hue
circle held at real chroma, which is a different claim from "warm" — and they
are the highest-demand modifiers measured. `/palettes/sunset` and
`/palettes/ocean` already exist as sitemap entries, and both appear in the
Tier-1 list in [demand-longtail.md](./demand-longtail.md).

They needed a second gate. Hue window alone let any washed-out palette that
landed in the band steal the word — "Duotone forest silver and gunmetal",
"Ocean sky to light lavender" — so a family now also requires `meanChroma ≥
0.08` and 85% of its stops inside the window. Hue says where a palette is;
chroma says whether it is there *enough to be named after it*.

`forest` is the closest miss in the whole registry. Gated to the same standard
as its siblings it fires on 1.7% — green-dominant palettes are simply rare here
— and loosening it to clear 2% is exactly what produced the silver-and-gunmetal
forest. It goes the way of triadic: measured, documented, not shipped.

### Also rejected, with reasons

- **`even` / `uneven`** (coefficient of variation of consecutive ΔE): the CV
  distribution is p10 0.12, p50 0.31, p90 0.51 — tightly packed, so any cut
  either catches most of the corpus or almost none.
- **`accented-analogous`**: informative at 4.0 bits, but a strict subset of
  duotone — it is always two clusters, just lopsided — so the tag would only
  ever co-occur with `duotone` and add no new token.
- **`hue-turn`** (hue direction reverses): true of 54.4%, worth 0.9 bits. A
  coin flip is not a description.

### Registry after both passes

32 descriptors on nine axes. Coverage of headings went **50.9% → 68.4%**; the
modifier words now spoken are duotone 16.5%, monochrome 15.7%, sunset 13.0%,
ocean 8.4%, rainbow 8.1%, earthy 7.5%, neon 6.0%, muted 4.5%, pastel 2.3%,
autumn 1.8%, dark 1.7%, grayscale 0.6%.

```
Sunset cream to salmon to fire brick
Sunset sand to burnt sienna to mahogany
Neon ocean vibrant blue to light blue
Ocean monochrome night blue to bright blue
Autumn burnt siena to goldenrod to pale peach
Autumn sandy to orange brown to claret
```

Every declared prevalence in the registry is re-measured against the live corpus
and matches to 0.0pp; `palette-name.test.js` fails the build if any drifts
outside the 2–60% band.

---

---

## 4c. Third pass: the duotone bug, and why the harmony ocean is dry

Prompted by a palette named from the editor with the frequency slider up:
**"Neon duotone yellowish tan and black"** — for a palette visibly passing
through red, green, cyan, magenta and purple.

### The bug: cluster count is not hue count

`classifyStructure` tested how many hue *clusters* a palette had before testing
how *wide* they were. A cluster is just everything between two 40° gaps, so a
cluster can itself be a broad arc — and a palette sweeping 248° of the wheel
still lands in two of them. Reproduced by taking corpus seeds and raising
frequency, exactly as a user does:

```
before   Earthy duotone eggshell and coral pink        clusters=2 span=248°
         free names: eggshell, maroon, dark maroon, black,
                     dark blue green, bluish green, aqua marine, coral pink
after    Earthy rainbow eggshell to black to dark blue green to coral pink
```

The `NAMES_FOR_STRUCTURE` cap made it worse: duotone caps the name at two
colours, so a misclassification silently threw away six of the eight.

**Fix:** two groups only make a duotone when each group is itself narrow
(< 60°, two segments of the 12-segment wheel). Otherwise it is a sweep and gets
classified by span. This moved duotone 7.7% → 5.3%, complementary 9.2% → 5.3%,
rainbow 9.4% → 13.5%, multicolor 25.4% → 27.4%; the structure axis still
partitions to 1.000 and every class stays 100% step-stable.

### `complementary` is now spoken

It was computed, tagged, and then aliased to the word "duotone" in prose on the
grounds that harmony jargon has no measured search demand. That hid a real term
from the one surface a designer reads. It now speaks its own name:

```
Complementary dark brown and sapphire
Earthy complementary almost black and dark blue gray
Sunset complementary pale teal and dark pink
```

### Why triadic, tetradic and split-complementary are genuinely unreachable

The §4b measurement covered the 866 *stored* palettes, which is the wrong
population — the editor's sliders reach far outside it. Re-measured over
**11,200 reachable palettes** (400 seeds × 7 frequencies × 4 phases):

| class | stored | reachable |
|---|---|---|
| complementary | 5.8% | 3.20% |
| duotone | 5.3% | 4.51% |
| 3 clusters (any) | 0.5% | 0.92% |
| **split-complementary** | 0.0% | **0.04%** |
| **triadic** | 0.0% | **0.05%** |
| **tetradic** | 0.0% | **0.02%** |
| **4+ clusters** | 0.0% | **0.05%** |

Not corpus bias — **structural**, and there is a mechanism. Hue clusters form
where the trajectory *dwells*, and a cosine dwells at its turning points. One
cosine has two turning points per cycle, so the model produces two dwell
regions per cycle. Two hues is what a sinusoid gives you; three or four
evenly-spaced isolated hues would need the path to park at three or four
places, which a smooth sinusoid cannot do at any frequency or phase.

So the classical harmony corpus is not partially covered — it is **fully
covered, and the remaining classes are unreachable by construction**. Adding
them would mean shipping detectors that fire on roughly 1 palette in 2,000.

### Also added

`iso-luminant` (5.7%, tag-only): hue moves while lightness does not — the
classical "vibrating colour" condition. Distinct from `low-contrast`, which
says values are close but nothing about whether hue is moving.

---

---

## 5. Choosing what to say

Detecting is easy; the hard part is that saying all 25 true things produces
noise. Four gates, in order:

**1. Information.** Rank by `-log2(prevalence) × demand`. A word must clear
**2 bits** (≤25% prevalence) to be spoken at all. This alone retires `warm`
(45.7%), `cool` (35.8%), `analogous` (29.1%) and `ramp` (58.5%) from prose while
keeping them as tags — and it means adding descriptors makes names *more*
selective, never longer.

**2. Demand.** MEASURED against the autocomplete grammar in
[demand-longtail.md](./demand-longtail.md): the observed `{color} gradient
{modifier}` set contains *pastel, neon, dark, light, rainbow* — and never
*analogous*, *complementary* or *triadic*. So harmony jargon is demoted and left
unspoken; `pastel`/`neon` get a 1.4× lift, `dark` 1.3×, `rainbow` 1.3×.
`complementary` is **indexed** under its own name and **spoken** as "duotone".

**3. Diversity.** One word per axis, and a specific word shadows its general one
(`pastel` ⊃ `light`, 93% overlap measured; `neon` ⊃ `vivid`, 87%). Max two words
— English tolerates two stacked adjectives before a name reads as a list. Same
greedy-under-diversity shape as the MMR pass in palette search.

**4. Prose.** Two vetoes the selector cannot know about:
- *Redundancy* — the 843-name corpus already says it. "Pastel pale pink to baby
  blue", "Dark dark navy". This is why `dark` reaches only **1.3%** of names
  despite a 10.7% tag rate: the color names usually got there first.
- *Contradiction* — "Neon warm blue to **pale** violet red". Both classifications
  are true of the palette; the aggregate loses to the specific and stays quiet.

Plus one coherence rule: **the structure word must match the shape of the name.**
A duotone shown with five color names ("Duotone mocha to grayish teal to sea blue
to marine blue to midnight") reads as a bug, and is one — those five names are
lightness steps within two hues. Structure now caps the name's color count
(duotone → 2, analogous → 3, rainbow → 4), giving "Duotone mocha and midnight".
And where the dense measurement and the visible colors disagree — a wide hue
sweep held at low chroma — the word is dropped, not the measurement:
"Rainbow light sage to light blue gray" does not ship.

Connector encodes structure without jargon: two isolated hues get **"and"**
(a pair), everything else **"to"** (a journey).

### Result

MEASURED over 866 palettes, at 13 steps:

| | heading | title |
|---|---|---|
| mean length | 38.5 | 34.9 |
| max length | 72 (budget 80) | 44 (budget 44) |
| over budget | 0 | 0 |
| name collisions | 1.5% | 1.5% |

**50.9%** of headings carry at least one modifier; the rest were already fully
described by their colors. Word frequencies in headings: monochrome 16.6%,
duotone 16.6%, rainbow 8.1%, earthy 8.1%, neon 5.1%, muted 3.8%, pastel 2.2%,
dark 1.5%, grayscale 0.6%.

The gap between a descriptor's tag rate and its spoken rate is the redundancy
veto working: `dark` is true of 10.7% of palettes and reaches 1.5% of names,
because the color corpus usually said "dark navy" first.

Samples:

```
Duotone mocha and midnight
Muted duotone silver and gunmetal
Monochrome light violet to rebecca purple
Neon monochrome vibrant blue to light blue
Pastel monochrome antique white to rosy brown
Earthy rainbow black to light mustard to burnt umber
Rainbow marine to dull blue to pale teal to strawberry
Grayscale gainsboro to mushroom
Earthy golden brown to grayish teal to gunmetal
```

---

## 5b. The title, re-measured

Not part of the original brief, but modifiers touch the `<title>` and the budget
turned out to be wrong — and wrong on the average case, not just the worst one.

`TITLE_HEADLINE.maxChars` was 44 while `" Gradient Palette | Grabient"` spent 28,
so titles ran to 72 characters against Google's ~60-character truncation.
MEASURED at budget 44: **mean title 62.7 characters, 67.9% of the corpus
truncating.** Two thirds of pages were losing the end of their title.

### Why shrinking the budget alone was not the answer

The budget trades against duplicate titles, which are the same templated-page
signal this whole change exists to fight. Both curves, with the suffix counted:

| budget | mean title | max | over 60 | title collisions |
|---|---|---|---|---|
| 28 | 50.3 | 56 | 0.0% | 6.2% |
| 30 | 52.0 | 58 | 0.0% | 3.5% |
| 32 | 54.1 | 60 | 0.0% | 2.3% |
| 34 | 55.7 | 62 | 11.9% | 2.1% |
| 44 (was) | 62.7 | 72 | 67.9% | 1.5% |

32 is the only budget that fits, but at 32 there is no room for both a modifier
and the colors: **29.7% of pages had a modifier in the heading and lost it in
the title** — 257 pages dropping a search term from the surface where it counts
most. Reordering to keep modifiers instead pushed 30.7% of titles down to a
single color name and collisions to 6.9%. There is no ordering that fixes a
budget that is simply too small.

### The suffix was the real cost

Every character of the suffix is one the palette does not get. Measured at the
budget each suffix leaves, so that suffix + budget = 60 in every row:

| suffix | budget | titles keeping a modifier | 1-name titles | collisions | mean length |
|---|---|---|---|---|---|
| `" Gradient Palette \| Grabient"` (28) | 32 | 21.9% | 5.2% | 2.5% | 53.9 |
| `" Gradient \| Grabient"` (20) | 40 | 44.8% | 1.3% | 1.7% | 51.7 |
| `" Palette \| Grabient"` (19) | 41 | 46.7% | 1.3% | 1.7% | 51.4 |
| **`" Gradient Palette"` (17)** | **43** | **49.7%** | **1.2%** | **1.7%** | **50.5** |

**Dropping the brand wins on every axis.** It also keeps the two tokens the
Tier-1 targets in [demand-longtail.md](./demand-longtail.md) are built from —
those queries are `{color} gradient color palette`, not `{color} grabient`. A
deep palette page does not need to rank for the brand; the homepage does, and
Google commonly appends the site name to a SERP title on its own. If the brand
is wanted back, `" Gradient \| Grabient"` at budget 40 is the next best row and
costs about 5 points of modifier retention.

`TITLE_SUFFIX` now lives in `palette-name.ts` and is imported by both the server
render and the editor island, which had been carrying separate copies of the
string.

### Two more rules the measurement forced

- **Shorten the color list to keep the modifier — but never below two names.**
  In the title a modifier is a search term with its own `/palettes/` page; a
  third color name is a detail. Letting that go to *one* name is what produced
  the original "Light steel blue" bug and took collisions to 6.9%, so the floor
  is two.
- **The meta description opener was decoupled from the title.** It had shared
  `TITLE_HEADLINE`, coupling two surfaces with nothing in common: a description
  gets ~155 characters and the opener is followed by the style, the step count
  and four hex codes. It keeps 44 as `META_HEADLINE` — mean 136.0, max 146.

### Shipped result

| | before | after |
|---|---|---|
| mean `<title>` | 62.7 | **50.5** |
| max `<title>` | 72 | **60** |
| titles over 60 | 67.9% | **0.0%** |
| titles carrying a modifier | 21.9% | **49.7%** |
| title collisions | 1.5% | 1.7% |
| meta description | mean 136.5, max 146 | mean 136.0, max 146 |

```
Duotone eggshell and green blue Gradient Palette            (48)
Monochrome light violet to rebecca purple Gradient Palette  (58)
Rainbow black to sand to burnt umber Gradient Palette       (53)
Duotone mocha and midnight Gradient Palette                 (43)
```

---

## 6. Where the code lives

| file | role |
|---|---|
| `packages/data-ops/src/gradient-gen/palette-modifiers.ts` | **new.** Feature extraction, the descriptor registry with measured prevalences, and `selectModifiers`. |
| `apps/web/src/palette-name.ts` | The prose layer: budgets, redundancy/contradiction vetoes, connector, `describePaletteName`. Now the single home for naming. |
| `apps/web/src/palette-json.ts` | Imports from `palette-name.ts` — the duplication is gone. Adds `seedPaletteText`, one analysis per page render instead of six. |
| `apps/web/src/islands/edit.tsx` | Names client-side on every tick; the `/{seed}.json` fetch is deleted. |
| `apps/web/test/palette-name.test.js` | 18 regression tests, including step-invariance of structure on a real seed per class. |

`palette-tags.ts` is **untouched**.

### Client cost

MEASURED. The edit island is lazily loaded; `entry` is unchanged at 62.57 KiB
gzip.

| | before | after | delta |
|---|---|---|---|
| `edit-*.js` raw | 45.91 KB | 76.11 KB | +30.20 KB |
| `edit-*.js` gzip | 12.97 KB | **25.40 KB** | **+12.43 KB** |

Of the +12.43 KiB, **6.45 KiB is the packed 843-name color corpus** — exactly the
figure the earlier estimate predicted — and the remaining ~5.8 KiB is the naming
and modifier logic. Note the estimate in the handoff (+6.45 KiB) counted only the
corpus; the true cost of client-side naming is roughly double that. It buys the
removal of one fetch per URL write and a heading that tracks the sliders instead
of lagging them. **Worth re-confirming with the owner before production.**

---

## 7. Reindex impact — read before shipping search changes

The Vectorize index is written by a pipeline **outside this repo** from
`palette-tags.ts` output. Classification:

### Serve-time additive — no reindex (everything shipped here)

All modifier tags, the names, the headings, `<title>`, meta descriptions, the
sr-only description, and `/{seed}.json`. These are computed per request from the
seed. Nothing that Vectorize already stores changes value.

### Requires a reindex — NOT done here

1. **Putting modifier tags into the embedding text.** This is the change with the
   real payoff — it is what makes "duotone", "pastel", "monochrome" and "earthy"
   *retrievable* rather than merely displayed. Until the indexing pipeline emits
   them and the corpus is re-embedded, semantic search cannot find a palette by
   any of these words.
2. **Correcting `texture: 'monochrome'` → `'grayscale'`.** Changes an existing
   stored value; doing it in isolation desyncs the index. It should ship in the
   same reindex as (1), where the hue-based `monochrome` replaces it and the
   146 currently-mislabelled palettes become findable.

Both are one reindex, and they should be the same one. Nothing in this change
depends on it — the names and tags are correct on the page today; only
*retrieval* waits.

---

## 8. Open questions for the owner

1. **The +12.43 KiB client cost** is double the estimate that was approved. It is
   on a lazily-loaded island, and it removes a per-edit fetch. Confirm, or move
   naming back to the server and accept the lag.
2. **Related links.** The chips were removed, and seed pages now have no outbound
   links. Structure classes are natural link targets — 148 monochrome palettes,
   147 duotones — and would restore internal linking as a *visual* row (gradients,
   not word pills), which is what was asked for.
3. **`/palettes/{modifier}` routes.** SchemeColor's ranking advantage is
   multiplying modifiers over colors. `pastel-blue`, `dark-purple`,
   `monochrome-blue` are now computable for every palette, and the demand doc
   rates that grammar Tier 1. This is the largest remaining SEO move and it is
   gated on the reindex in §7.
4. **Should `seamless` be spoken on conic gradients only?** It carries 4.4 bits
   and is genuinely useful there (a mismatch is a visible seam), but it is
   meaningless on a linear gradient. Currently tag-only.

---

## 9. 2026-08-18 — the ladder, re-measured after visual QA

Three graders read rendered palettes beside the generated names and found two
structure classifications that the geometry never established. Both were the
same shape of error: a test that measured a DISTANCE and was read as a JOURNEY.

**`rainbow` is now a one-cluster classification.** The ladder used to fall
through to `hueSpan >= RAINBOW_SPAN` whenever a two-cluster palette failed the
duotone width bound, so a palette with clusters at 226° and 27° and a 161°
EMPTY gap between them measured a span of 200.4 and was named "Sunset rainbow
dirty blue to tomato red to cocoa" — teal, a flat block of red, brown, and no
yellow, green, blue or purple anywhere in it. 43 of the 121 rainbows were that
shape (brown → sage → navy; white → blue-gray → teal). Span only means a
journey when the palette has no hole in it, which is exactly `hueClusters === 1`.

**A cluster may not be wider than the gap that separates clusters.**
`DUOTONE_CLUSTER_WIDTH` was 60° (two segments of the 12-segment wheel) against a
`CLUSTER_GAP` of 40°, so a "single hue" group could span two family bands: a
pale sweep running sand, yellow-green, green, sage, gray-blue, lilac, pink came
back `duotone` with a 53.9° cluster and told the reader it "uses two colors and
skips everything between them". The bound is now `CLUSTER_GAP` itself.

| structure | before | after |
|---|---|---|
| grayscale | 19 | 19 |
| monochrome | 132 | 132 |
| duotone | 46 | 30 |
| complementary | 47 | 29 |
| rainbow | 121 | 78 |
| analogous | 243 | 243 |
| multicolor | 259 | 336 |

The 33 palettes released from duotone/complementary are continuous sweeps by eye
(navy → sky → cream, orange → tan → gray → light blue, violet → lavender →
white); the ones that stay are two poles with a crossing.

### Three gates that measured one sample

- **`neon`** tested `maxChroma`, so one electric stop made a palette neon: a
  steel-blue-to-dusty-rose ramp with per-stop saturations 0.46 0.54 0.46 0.40
  0.49 0.75 1.00 shipped as "A neon gradient color palette". Now the loudest
  TENTH of the dense run (`denseChromaP90`, a new feature) must clear
  `NEON_CHROMA` as well: 85 → 71 of 867. The true neons sit at 20-40% of the run
  above the bar; the ones dropped are at 2-4%.
- **`sunset`** tested only that the palette stayed inside 300°-100°, which a
  purely magenta-pink ramp satisfies with a score of 1.000. A sunset has sun in
  it: ≥10% of the chromatic mass must sit in 20°-100° (`SUNSET_WARM_SHARE`).
  134 → 117, and the sweep is flat around the threshold (0.05 → 120, 0.15 → 111).
- **`pure-white-plateau`** was measured at 0.7% and left out on the 2%
  prevalence floor. That floor governs what may be SPOKEN; the prose layer
  needed to SEE the fact, because a palette whose middle 46% renders pure white
  was being described as two colors that "skip everything between them". It
  exists now with `spoken: false`, like its black twin.

`chromaPeak`, `firstChromatic` and `lastChromatic` were added at the same time:
the tone-gated names prose uses (brown is a dark low-chroma orange, purple a
dark magenta, pink a light low-chroma red) need L and C where the palette's
colour actually lives, not only a hue angle.


## Visual QA round 2 (2026-08-18): hue visibility, and what a rainbow is

Two more structural corrections, both from graders reading the render beside the
text (see [palette-prose.md](./palette-prose.md) §8).

**The saturation branch of hue validity is for TINTS.** D19 added it because the
sRGB solid narrows at the top: where the ceiling is small, a stop can be as
colourful as the screen allows and still measure almost no chroma. The solid
narrows at the BOTTOM too, and that is not the same situation — there a small
ceiling means the colour is nearly black, and OkLab's cube root has infinite
slope, so it reports a chroma nobody can see. Measured: #00000f (rgb 0,0,15)
sits at 100% of its ceiling with C 0.053, and #091a19 at 66% with C 0.023.
Rendered beside a neutral of the same lightness, both are black
(`qa/r3/dark-visibility.png`).

It mattered live: the second stop above was admitted as a cyan, formed a hue
cluster at 190.5°, and made a continuous near-black → brown → orange ramp
"complementary" at a cluster separation of 151.3° against a threshold of 150.
`hasUsableHue` now needs `L ≥ SATURATION_BRANCH_LIGHTNESS` (0.5) on that branch
only; stops with real chroma are untouched at any lightness, which is what names
a dark navy. 0.5 is where the branch stops being reachable from below rather
than a tuned number: the ceiling is under `CHROMA_FLOOR / SATURATION_FLOOR`
(0.086) for 20 of 36 hues at L 0.30, 5 at L 0.46, 1 at L 0.50 and none at L 0.54.

**A rainbow reaches both ends of the spectrum.** `RAINBOW_SPAN` measures how far
the hue travels and says nothing about where: a palette can cover 201° without
leaving the warm half of the wheel by going the short way through magenta.
Violet → magenta → dull rose → clay → olive → green shipped as "A rainbow
gradient color palette", with no blue and no cyan in it, and the word drove the
title, the meta description and a `rainbow` chip. The span now has to hold
colour on both sides — the warm arc through 0° and the cool arc through 225°,
the same windows `warm` and `cool` read — at `RAINBOW_POLE_SHARE` 0.10. Sweep
over the fixture: 0.05 → 77 rainbows, 0.10 → 76, 0.15 → 71, 0.20 → 63,
0.25 → 56, 0.30 → 47. The flat end is where the test only removes palettes with
NO landmark on one side; the two it drops measure 0.00 and 0.06 of their mass in
the cool arc.

Structure counts after both changes (867 seeds, 13 steps): grayscale 19,
monochrome 137, duotone 32, complementary 29, rainbow 75, analogous 247,
multicolor 328. Four features were added for the prose layer, all additive:
`chromaValleyT` (where the run comes closest to gray — the duotone sentence was
asserting a position from a share), `denseMinLightness` / `denseMaxLightness`
(what a viewer can see along the run), and `denseSaturationRange` (an exclusive
claim about lightness needs to know the colourfulness held still).

## Visual QA round 3 (2026-08-18): three gates that never asked the ends

Three more registry corrections from graders reading the render beside the text
(see [palette-prose.md](./palette-prose.md) §9).

**"Brightest in the middle" is a claim about the ENDS.** `bright-middle` tested
peak POSITION only (`lightnessPeakT` inside the middle third, above the
`LOW_CONTRAST_RANGE` noise floor), so a ramp that climbs out of a medium blue
into bright cyan and holds it through to spring green fired the tag at t 0.596
with its right end 0.038 below the peak against 0.189 at its left, a 5:1
asymmetry, and the sentence it drives told a reader both of its ends were darker.
The weaker end now has to fall `MIDDLE_END_DROP` (0.25) of the palette's own
dense lightness range below the peak, and the twin the same distance above the
valley. A ratio rather than an absolute, for the same reason the prose layer's
`ARCH_DOMINANT` is one: the claim is about shape, not amount. Measured over the
111 palettes the position test alone accepted, the weaker end's drop as a
fraction of the range runs p05 0.144, p10 0.275, p25 0.474, p50 0.703; the bar
removes 11 there and 4 on the twin. Two additive features carry it —
`denseFirstLightness` / `denseLastLightness`, dense so the tag stays
step-invariant. Prevalences 0.128 → 0.115 and 0.075 → 0.070.

**An `earthy` mean is what a neutral middle fools.** `EARTHY_CHROMA` bounds the
MEAN, and a deep indigo against a lemon yellow with a gray and two khakis between
them measures 0.083 because its third stop measures 0.010. It shipped as "An
earthy duotone gradient color palette" leading both the title and the
description, on a palette that also fires `high-contrast` and whose yellow end
sits at 93.5% of the chroma its lightness allows. `earthy` implies `muted`, and a
palette holding a stop as loud as `VIVID_CHROMA` is not muted by any reading, so
that stop vetoes the word: 97 → 86 of 867, prevalence 0.111 → 0.099. (`muted`
itself needs no such veto — 0 of its 91 palettes hold a stop that loud, its own
ceiling being 0.055.)

**One constant, two samples, two answers.** `hasColour` read the RENDERED stops
while `isGrayscale`, which it is the De Morgan negation of, reads the dense
sample. A lavender-white to sage-gray ramp measures dense mean saturation 0.231
(grayscale, 0.019 under `GRAYSCALE_SAT`) and rendered mean saturation 0.262 (has
colour, 0.012 over it), so it fired `pastel` AND classified `grayscale`, and the
chip row offered the compound "pastel grayscale": one label telling a visitor the
palette is both a pale tint and free of tint. `hasColour` is now dense. Measured
cost: pastel 72 → 71, muted 91 → 90 (prevalence 0.110 → 0.108), earthy unchanged.

One feature was added for the prose layer, additive: **`hueConcentration`**, the
mean resultant length of the same chroma-weighted vector sum `meanHue` is the
angle of (circular statistics' R, so circular SD = sqrt(−2 ln R)). `meanHue`
always has a value, including where the vectors that made it point every which
way and nearly cancel: a greige ramp whose seven stops measure h 302, 329, 24,
75, 96, 123, 177 at C 0.009–0.015 returns 50.8°, squarely warm, and was described
as "the colors are warm grays" over an image whose two ends are a cool
lavender-white and a cool sage. R is what says that answer is an accident: 0.397
there against 0.92–0.99 for the leans that hold up. Fixture distribution p05
0.206, p10 0.362, p25 0.636, p50 0.867, p75 0.971.

## Visual QA round 4 (2026-08-18): a floor under the relative reading, and a feature for a claim nobody measured

Two changes here, both from graders reading rendered palettes beside the text.

**D19's relative reading has one blind spot, at the very top of the solid.**
`FAMILY_SATURATION` (0.6) exists so a pale sky tint sitting at 90% of its
achievable chroma can still be called blue. As L → 1 the ceiling collapses toward
zero, so *any* residue reads as 100%: a stop at L 0.9992 with C 0.0039 cleared
the gate and the prose announced a family for a colour its own identity sentence
had just named white ("running from white (#ffffff) through peach to pinkish
gray. It moves from yellow into pink"). **`FAMILY_MIN_CHROMA` = 0.01** is the
visibility floor under that branch. Swept over the fixture's 319
saturation-branch family admissions the floor removes 5 at 0.005, 8 at 0.008, 8
at 0.01, 14 at 0.015 and 23 at 0.02; 0.008–0.01 is the flat region and every stop
it removes sits at L ≥ 0.98. One 8-bit step near white moves chroma by roughly
0.001, so 0.01 is about ten quantization steps: the smallest tint a panel can
show. Deliberately NOT applied to `hasUsableHue` — a floor there was measured and
rejected in the D19 work (0/2/8/14 classification changes at
0.005/0.01/0.015/0.02), because clustering needs the angle and the angle is
stable well below visibility. Naming a family is the claim that needs to see the
colour.

**A sentence about repeats had no measurement under it.** `hue-wandering`
establishes that the hue ANGLE turns back, and the prose said "It repeats colors
from earlier in the gradient" on the strength of it. The two are not the same
fact: a denim → periwinkle → orchid → electric violet sweep returns to h 283 at
C 0.247 where it had been at C 0.082, so the angle came home and the colour never
did. New feature **`colorReturn`**: the smallest OkLab distance between two dense
samples at least a third of the ramp apart with a visible excursion between them.
Both conjuncts are load-bearing. Without the third-of-the-ramp gap the trivial
closeness of neighbours answers yes for every palette (the fixture's minimum
non-adjacent distance runs p50 0.017 with the gap at 4 samples). Without the
excursion a PLATEAU answers yes: a duotone rendering pure white for 46% of its
length holds two white samples a third of the ramp apart at a distance of exactly
0, and a palette with a wide red middle reads 0.005.

**`RETURN_EXCURSION` = 0.1**, five JND: past the 0.05 the seam sentence treats as
"still the same colour" and just under the 0.12 separation `getUniqueColorNames`
requires before spending a second name, so the run has to have gone somewhere the
corpus would call a different colour. Swept, the returning share runs 0.05 →
6.2%, 0.10 → 4.5%, 0.15 → 4.0%, 0.20 → 3.1%; 0.10 is where the plateaus stop
qualifying (a flat periwinkle whose whole excursion is 0.037, the white duotone
and the red plateau all fall out between 0.05 and 0.10) while the symmetric
arches, whose excursions run 0.19 to 0.77, are untouched anywhere in the sweep.

Cost: the loop is 1,128 pairs on SQUARED distances, 4.5 µs per palette measured
over 300 fixture seeds, against a `paletteFeatures` pass of 104.3 µs. The same
loop through `oklabDistance` measures 49.3 µs — `Math.hypot` carries
overflow-safe scaling that three small components do not need, and both
comparisons here are monotone in the square, so only the answer takes a root.

## D24.2 (2026-08-18): `complementary` on a sweep, and the characteristic registry

**The case.** The owner's screenshot palette — `#88d5f2` through `#ffc1a1`, a
sky-blue conic sweeping to salmon — has END hues 223.9° and 48.5°, **175.5°
apart**, which is textbook complementary. It classified `multicolor` and showed
no structure chip at all, because a cosine ramp SWEEPS: the crossing fills every
hue between the poles, so the palette forms ONE cluster **184.5° wide** and the
isolated-clusters route needs two clusters each narrower than `CLUSTER_GAP`.

**The second route.** `opposedHueMasses(f)`: any pair of ±20° hue windows at
least `COMPLEMENTARY_SEPARATION` apart, each holding ≥ 20% of the chromatic
samples and together ≥ 80%, on a palette whose loudest tenth reaches chroma 0.10.
It reads `hueHistogram` through `hueBandShare`, so it is pure over
`PaletteFeatures` and sees the same dense sample the clusters do.

Three decisions, each measured over the 867-seed fixture:

- **Existence, not "the heaviest two".** Taking the two heaviest masses and then
  measuring the angle between them makes the answer depend on where a washed-out
  crossing drags a centroid: the owner's palette reads only **130° apart** that
  way at a 30° half-width, because a window centred at 250° catches more of the
  blue tail than one centred at 230°. The separation belongs in the search as a
  constraint; the share thresholds decide whether the pair IS the palette.
- **±20°** is `CLUSTER_GAP / 2`: a mass may not be wider than the gap that
  defines a cluster. Half-width sweep (palettes moved): 15 → 16, 20 → 30,
  25 → 43, 30 → 57. Wider windows start swallowing the crossing itself.
- **Share sweep** (weak pole × union, palettes moved): 0.15/0.75 → 35,
  0.15/0.80 → 25, 0.15/0.85 → 16, 0.20/0.75 → 32, **0.20/0.80 → 30**,
  0.20/0.85 → 14, 0.25/0.80 → 21. The knee is the union, not the pole share.

**"At real chroma" is read off `denseChromaP90`, not the mean.** A palette that
crosses pole to pole through gray has a low mean chroma by construction — the
owner's is 0.079, under `FAMILY_CHROMA` — so a mean floor rejects exactly the
shape the route exists for. Visual QA over all 30 palettes the share thresholds
alone admitted: the four that are plainly not complementary (a near-white ramp
with two faint tint pulses, a desaturated tan-to-maroon, an olive→black→brown
whose blue pole is invisible inside the black, a flat pale one) measure p90
0.087 / 0.042 / 0.090 / 0.058, while the twelve that plainly are run 0.113 to
0.259. **0.10** cuts between them; the owner's palette measures 0.109.

**Result** (867 seeds, 13 steps; identical at 7):

| class | before | after |
| --- | --- | --- |
| grayscale | 19 (2.2%) | 19 (2.2%) |
| monochrome | 137 (15.8%) | 137 (15.8%) |
| duotone | 32 (3.7%) | 32 (3.7%) |
| **complementary** | **29 (3.3%)** | **52 (6.0%)** |
| rainbow | 75 (8.7%) | 75 (8.7%) |
| analogous | 247 (28.5%) | 247 (28.5%) |
| **multicolor** | **328 (37.8%)** | **305 (35.2%)** |

Route prevalences with the ladder ignored: isolated clusters 30 (3.5%), opposed
masses 39 (4.5%), both 9, union 60 (6.9%). Under the ladder the union is 52,
because 7 duotones satisfy the mass test and 1 grayscale satisfies the cluster
test, and both are claimed earlier — the ladder stays exclusive and ordered. **No rainbow moves**: a run
that reaches both ends of the spectrum spreads its samples around the wheel and
cannot fit 80% of them into two 40° windows, so no span guard is needed.

**Downstream re-measures** (the drift tests carry these): impression
`opposite-colors` 0.0334 → 0.0600 and `several-colors` 0.3783 → 0.3518; chips
per palette mean 7.4429 → 7.4544 (23 rows gain a structure chip and the compound
built on it: structure axis 287 → 310 rows, compound 316 → 330, rows with ≥3
distinct kinds 806 → 813). Measure-first rates are unchanged — `sepia` and
`ombre` gate on monochrome/analogous, which did not move.

**The characteristic registry** (`packages/data-ops/src/gradient-gen/palette-characteristics.ts`,
D25.1). One table, 63 terms seeded from what was already implemented, each with
`test`, a `strong` margin band, and BOTH rates measured over the fixture at the
default view (7 steps). The chip row, the description and the tag filter read
the same closures — the measure-first detectors and `seriesReading` moved out of
`apps/web/src/palette-prose.ts` into it so there is exactly one definition of
each. Terms the inventory marks as not computable from diffuse colour (metallic,
iridescent, holographic, simultaneous contrast, assimilation/Bezold, Kelvin,
luma/luminosity) are documented as never-implement, with the reason, and a test
asserts none of them is ever added. Prominent terms per palette over the
fixture: 0 → 2 palettes, 1 → 46, 2 → 91, 3 → 175, 4 → 169, 5 → 143, 6 → 100,
7 → 79, 8 → 27, 9 → 20, 10 → 6, 11 → 6, 12 → 2, 13 → 1.
