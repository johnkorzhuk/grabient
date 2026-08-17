# Color corpus and palette naming

Status: implemented, uncommitted, in the working tree. 2026-08-16.

Three things changed: the naming corpus went from 41 names to 843, nearest-name
search moved from RGB to OkLab, and `paletteHeadline()` now names as many
regions as a palette actually has instead of always naming its two endpoints.

Everything below is measured against 3,504 distinct colors rendered from 144
live seeds (`GET /api/palettes?sort=popular` pages 1-6, rendered at 3/5/7/9/11/13
steps). Distances are OkLab Euclidean, where ~0.02 is one just-noticeable
difference and 0.4 spans black to white.

---

## 1. The corpus

**Chosen: 843 entries — filtered xkcd ∪ CSS Color 4 ∪ the existing 41.**

| source | kept | license | provenance |
|---|---|---|---|
| xkcd color survey | 699 | **CC0-1.0** (declared in the file header) | `https://xkcd.com/color/rgb.txt` — 950 lines, 1 header + 949 entries |
| CSS Color 4 `<named-color>` | 103 | spec values are uncopyrightable facts; list taken from meodai `color-name-lists` key `html`, MIT-packaged | 148 keywords, de-concatenated for display |
| existing `BASIC_COLORS` | 41 | in-repo | added first, so no existing name→hex answer moved |

Plus 173 aliases that resolve but never display: CSS single-token spellings
(`cornflowerblue`), British `grey`, and the colloquial forms filtered below.

No attribution or share-alike obligation attaches to any of it.

### Why xkcd is the spine

The criterion that matters most is "names people search". xkcd is a record of
what 200,000 people spontaneously called colors, which is the same distribution
as what they type into a search box — it is the only list that contains all of
*sage, burnt orange, dusty rose, terracotta, mauve, seafoam, dusty blue, blush,
mustard, rust, taupe, ochre, periwinkle*. It is also, for the same reason, the
only list that contains *baby shit brown*.

It happens to be the best on coverage too. Nearest-name distance over real
palette colors:

| corpus | n | mean | p95 | max |
|---|---|---|---|---|
| `BASIC_COLORS` (before) | 41 | 0.0775 | 0.1581 | 0.2050 |
| CSS Color 4 alone | 148 | 0.0502 | 0.1077 | 0.2018 |
| xkcd alone, unfiltered | 949 | 0.0259 | 0.0495 | 0.0828 |
| **shipped** | **843** | **0.0264** | **0.0539** | **0.0828** |
| unfiltered union | 1048 | 0.0245 | 0.0480 | 0.0828 |

The old 41-name corpus was three times coarser than the new one, and its worst
case (0.205) is ten JNDs — a color could be a full hue family away from its own
name. That is the mechanism behind "Gray to black" for `#a47451 → #000116`.

CSS earns its 103 slots on the pale/neutral end, where survey participants
rarely bothered to name anything, and because CSS keywords are what this site's
developer audience actually types.

### The filter — 150 source names removed

| class | examples | why |
|---|---|---|
| scatological | `booger`, `baby shit brown`, `diarrhea`, `poo brown` | 32 entries |
| pejorative | `ugly blue`, `dirty green`, `muddy brown`, `swamp`, `nasty green` | reads as an insult applied to a user's palette, and nobody searches it |
| morbid | `blood`, `dried blood` | `blood red` and `blood orange` kept — both are ordinary color terms |
| ethnically loaded | `indian red`, `navajowhite` | |
| **trademarks** | `barbie pink`, `kermit green`, `windows blue`, `tiffany blue` | a palette page is commercial surface. `olive drab`, `apple green`, `coral` stay — generic terms, not marks |
| survey artifacts | `blue blue`, `light light green`, `grey/green`, `blue with a hint of purple` | unreadable in a headline |
| misspellings | `liliac`, `light lavendar`, `terracota`, `toupe`, `ocre`, `kelley green` | correct spellings already present |
| bare modifiers | `dark`, `pale`, `bluish`, `greyish`, `tealish`, `royal` | "Dark to silver" is not a palette name |
| colloquial `-y` | `reddy brown`, `bluey grey`, `purpley pink`, `darkish red` (29) | 27 of 29 have an `-ish`/`light`/`dark` twin already in the corpus |

**The filter is nearly free**: unfiltered 0.0245 mean vs shipped 0.0264. The
whole safety and readability pass costs 0.002 OkLab — a tenth of a JND. This was
the main thing worth measuring, because the naive worry is that stripping 150
names from the yellow-green-brown region (where the crude names cluster) would
leave a hole. It does not; `olive`, `mustard`, `khaki`, `moss`, `army green`,
`camo green` and `ochre` already cover it.

Normalization: xkcd is 100% British `grey`, CSS ships both. Two spellings would
enter as two competing entries a hundredth of a deltaE apart and split naming
arbitrarily between them, so display is `gray` and `grey` is an alias.

### Rejected, with reasons

| candidate | n | license | why not |
|---|---|---|---|
| **NBS/ISCC centroids** | 267 | CC0 | See below — the most interesting rejection |
| `color-name-list` `bestof` | 4,959 | MIT | `100 Mph`, `3AM Breakup`, `Blood of My Enemies`, `A Dime a Dozen`. Selected for being *playful*, which is the opposite of the criterion |
| `color-name-list` `short` | 3,082 | MIT | `Cafe Royale`, `Cajeta`, `Calcium Rock` — paint-brand names, unvetted |
| `color-name-list` full | 31,914 | MIT | far too large, unvetted long tail |
| meodai `wikipedia` | 813 | **CC BY-SA 3.0 + GFDL** | share-alike on a commercial site's SEO pages |
| meodai `x11`, `osxcrayons`, `japaneseTraditional` | — | **CC BY-SA 3.0 + GFDL** | same |
| meodai `ntc` | 1,566 | MIT | strong vocabulary (29/30 on search-term probes) but salted with opaque marketing names (`Aqua Squeeze`, `Diesel`) |
| meodai `ral`, `windows` | — | **unknown** | unusable |
| Tailwind v4 / Radix / Open Color | 286 / ~336 / 132 | MIT | UI tokens. "Slate 500" is a design-system address, not a search term |
| Ridgway (1912) | 1,117 | CC0 | archaic — `Dragon's-blood Red`, `Onion-skin Pink` |

Note on the `color-name-lists` repo: it has no LICENSE file, and the MIT in its
`package.json` covers the packaging. Each sub-list's real license is in its
`meta` object. That is why only the `html` key was taken from it.

---

## 2. What made things worse

**NBS/ISCC backfill (267 names, CC0) — tried and rejected.** This is the
cleanest list in existence: zero offensive names, systematic modifier+hue
grammar, and by far the most even coverage of the RGB cube. Adding it to the
shipped corpus does improve the numbers:

| | n | mean | p95 |
|---|---|---|---|
| shipped | 843 | 0.0264 | 0.0539 |
| shipped + NBS/ISCC | 1052 | 0.0234 | 0.0468 |

An 11% improvement in mean distance. It was rejected anyway, because measuring
*which* names win shows what that improvement buys: **NBS/ISCC-only names would
be chosen for 20.7% of real palette colors**, and they look like this —

> `light orange yellow` (25 hits), `grayish yellowish pink` (17),
> `pale yellowish pink` (19), `light blue, sky blue` (22 — the name contains a
> comma), `brilliant orange yellow` (10), `purplish black` (12)

One palette in five would be titled "Grayish yellowish pink to brilliant orange
yellow". A tenth of a JND of accuracy is not worth that. **This is the lesson
of the whole exercise: nearest-name accuracy is the wrong objective to maximise
on its own.** The 843-name corpus is deliberately *not* the most accurate one
available.

**Other things that did not work:**

- **Sequential agglomerative clustering** was the first segmentation attempt:
  merge the closest adjacent pair of stops until the smallest adjacent gap
  clears a threshold. It fails on dark neutral ramps, which produce chains of
  mutually-close names where each *adjacent* gap clears the bar but the set as a
  whole is one color — `#141916 → #002a36` came out as "almost black to charcoal
  gray to dim gray to dark blue gray" at every threshold from 0.06 to 0.12. The
  fix was to check each candidate against *every* already-chosen name rather
  than only its neighbour.
- **A single separation threshold** collapsed genuinely two-tone gradients. At
  0.12, `#8ec5fc → #e0c3ff` (a real blue→lavender ramp, endpoints 0.105 apart)
  came back as just "Sky". The endpoints needed their own looser bar.
- **`whitesmoke` / `yellowgreen` as atomic split tokens** — a greedy longest-token
  split silently accepted them whole. Caught by eyeballing all 148 CSS splits.

---

## 3. The naming algorithm

### RGB → OkLab

Holding the corpus fixed at 843 and changing only the metric, **40.2% of the
3,504 real palette colors get a different name.** Hand-checking says the OkLab
answer is better essentially every time, because squared-RGB over-weights green
(which carries most of the luma) and under-weights blue:

| color | RGB nearest | OkLab nearest |
|---|---|---|
| `#332f26` | charcoal gray | **dark brown** |
| `#ff4a54` | watermelon | **light red** |
| `#507b75` | metallic blue | **battleship gray** |
| `#c6e1ff` | pale sky blue | **lavender** |
| `#cd6d00` | orange brown | **chocolate** |

`#332f26` is a warm dark olive-brown with more red than blue; RGB called it a
gray. `#507b75` is a desaturated slate-green; RGB called it blue.

`hexToOkLch` was refactored to share a new exported `rgbToOklab` rather than
duplicating the matrix. The math is byte-identical, so `harmony.ts` is
unaffected.

### `getUniqueColorNames(hexColors, options?)`

Was: name every stop, drop duplicates, return them all. Two failure modes, both
worse with a larger corpus — a 13-step charcoal ramp returned a dozen
near-synonyms, and callers wanting a short answer took the first N, which is the
head of the ramp rather than a description of it.

Now: **farthest-point (max-min) selection over the stops.**

1. The first stop anchors the ramp.
2. The last joins it if the ends differ at all (`endpointSeparation`, 0.05).
3. Each further stop is admitted only if it is `minSeparation` (0.12) from
   **every** name already chosen.
4. Stop as soon as the best remaining candidate is closer than that, or `max`
   (default 4) is reached. Output in ramp order.

The signature is additive — `getUniqueColorNames(hexColors)` still compiles.

### Threshold derivation

`endpointSeparation = 0.05`. Endpoint distances over 144 seeds run p10 = 0.105,
p50 = 0.333. Every gradient anyone would call two-tone sits well above 0.05, so
this bar only collapses palettes whose ends are literally the same color (p0 =
0.001). The five two-tone cases I hand-picked as "must stay two names" measured
0.105-0.203.

`minSeparation = 0.12`. Swept 0.08/0.10/0.12/0.15 at cap 4 over all 144 seeds:

| sep | 1 name | 2 | 3 | 4 | avg headline |
|---|---|---|---|---|---|
| 0.08 | 1 | 9 | 34 | 100 | 47.7 chars |
| 0.10 | 2 | 19 | 43 | 80 | 44.5 |
| **0.12** | **6** | **20** | **54** | **64** | **42.0** |
| 0.15 | 12 | 32 | 68 | 32 | 36.6 |

0.08 pins almost everything at the cap, which is not adaptive. 0.15 starts
dropping real color changes. 0.12 spreads the distribution.

---

## 4. Adaptive headlines

`paletteHeadline()` passes the **whole ramp** to `getUniqueColorNames` and joins
with " to ", retrying at max 3 then 2 if the result exceeds 52 characters.

The count is not driven by step count. It is driven by how much perceptual
ground the palette covers, which is what "hue diversity" means operationally:

- `#121216 → #3d3e42` at **13 steps** → "Almost black to charcoal gray". The
  interior stops all sit between the endpoints, so none of them can be 0.12 from
  both. Two names, exactly as the owner asked.
- `#dac574 → #500000` at **13 steps** → "Sand to ochre to burnt sienna to
  mahogany". Same step count, four names, because the ramp really does traverse
  that much.
- `#07aeea → #2bf598` at **2 steps** → "Deep sky blue to medium spring green".
  Fewer stops than the charcoal ramp, more distance.

Measured distribution over 144 seeds:

| steps | 1 name | 2 | 3 | 4 | longest headline |
|---|---|---|---|---|---|
| 3 | 1 | 42 | 101 | 0 | 50 chars |
| 7 | 1 | 33 | 81 | 29 | 52 chars |
| 13 | 1 | 23 | 89 | 31 | 52 chars |

Three-step palettes never reach four names — there is no fourth stop to pick —
so the rule degrades correctly at low step counts without a special case.

### Cosine palettes oscillate, and that is the biggest win

The old first-and-last rule was not merely coarse, it was **wrong** on a class
of palettes. `#000004 → #000000` at 7 steps renders:

```
#000004  #000c4f  #5b8183  #e8cd7e  #ffb244  #9e4700  #000000
```

Both ends are black, so the old headline was **"Black"**. The new one is "Black
to sand to burnt umber". Same for `#df3000 → #3a0005`, which passes through
`#72e0e8` — a robin's egg blue that the old headline never mentioned.

---

## 5. Before / after — 20 popular palettes

OLD = 41 names, squared RGB, first and last stop. NEW = shipped. Rendered at
each palette's own default step count.

| # | ends | steps | OLD | NEW | verdict |
|---|---|---|---|---|---|
| 1 | `#fada61 → #ff5acd` | 3 | Khaki to orchid | Light gold to peachy pink to candy pink | better — "khaki" is drab for a bright yellow |
| 2 | `#ffffc4 → #b00012` | 3 | Beige to brown | Cream to coral pink to fire brick | better — `#b00012` is red, not brown |
| 3 | `#a47451 → #000116` | 7 | Gray to black | Mocha to deep sea blue to marine to midnight | much better — `#a47451` is a warm tan; "gray" was flatly wrong |
| 4 | `#07aeea → #2bf598` | 2 | Turquoise | Deep sky blue to medium spring green | much better — both ends collapsed to one name before |
| 5 | `#c5bbb8 → #5b4b74` | 15 | Silver to charcoal | Silver to gray blue to dusk | better — end is violet-toned, not neutral |
| 6 | `#8ec5fc → #e0c3ff` | 5 | Silver to lavender | Sky to light lavender | better — `#8ec5fc` is plainly blue |
| 7 | `#4159d0 → #ffcd70` | 3 | Slate to khaki | Warm blue to medium orchid to light mustard | better, though "medium orchid" is a CSS name and reads stiffer than "purple" |
| 8 | `#000004 → #000000` | 7 | Black | Black to sand to burnt umber | much better — see above |
| 9 | `#abc8de → #ffedc3` | 7 | Silver to peach | Light steel blue to blanched almond | better |
| 10 | `#a9caff → #ffbaec` | 7 | Lavender to pink | Baby blue to powder pink | better, and correctly stays at two |
| 11 | `#fc8ec5 → #ffe0c3` | 5 | Plum to peach | Bubblegum pink to bisque | better — "plum" is far too dark |
| 12 | `#dac574 → #500000` | 13 | Tan to maroon | Sand to ochre to burnt sienna to mahogany | much better |
| 13 | `#df3000 → #3a0005` | 7 | Red to black | Tomato red to robin's egg to dark maroon | accurate but jarring — the cyan really is there, but it surprises |
| 14 | `#ffffd1 → #0bbc91` | 7 | Beige to teal | Eggshell to maroon to black to green blue | **arguably worse** — accurate (the ramp does hit `#730000` then `#000000`) but "black" mid-headline reads like a mistake |
| 15 | `#0a4a59 → #2fffff` | 13 | Charcoal to cyan | Dark teal to clear blue to deep sky blue to aqua | better, though the three blues are repetitive |
| 16 | `#7b84ff → #aeff6f` | 7 | Orchid to khaki | Periwinkle to robin's egg to key lime | better — "orchid to khaki" describes neither end |
| 17 | `#fa61da → #ffcd5a` | 3 | Orchid to khaki | Candy pink to blush pink to maize | better |
| 18 | `#d9b3e2 → #522ca4` | 13 | Plum to indigo | Light violet to medium orchid to rebecca purple | better |
| 19 | `#121216 → #3d3e42` | 13 | Black to charcoal | Almost black to charcoal gray | equal, correctly — a subtle ramp stays two names |
| 20 | `#312c00 → #113ccc` | 7 | Black to blue | Dark brown to marine blue to sapphire | better — `#312c00` is a dark olive-brown |

Honest count: 17 clearly better, 2 accurate-but-jarring (13, 15), 1 arguably
worse (14), 1 deliberately unchanged (19). The failure mode in 13/14 is the same
one: when a cosine palette dives through black or through an unexpected hue, the
new headline reports it truthfully and the truth is surprising. The old headline
hid it, which is not better — it is just quieter.

Residual whimsy: the corpus keeps a handful of xkcd names that are real but
informal — `key lime`, `macaroni and cheese`, `bubblegum`, `robin's egg`,
`british racing green`. They are legitimate color terms and people do search
some of them, but they can read oddly in a title.

---

## 6. Bundle cost

`color-utils.ts` is **server-only** — verified two ways. The client bundle is
`src/islands/entry.tsx` and its transitive imports (`vite.config.ts` declares it
as the sole rollup input); those reach `@repo/data-ops/gradient-gen/*`,
`serialization` and `valibot-schema/grabient`, and nothing else. Only three
files import `color-utils` at all, all server-side: `palette-json.ts`,
`semantic-search.ts`, `popular-searches.ts`. The corpus costs Worker bundle
only.

`wrangler deploy --env staging --dry-run`, same tree, corpus swapped:

| variant | Total Upload | gzip | worker `index.js` raw / gzip |
|---|---|---|---|
| A · 41 names, new code path | 5866.10 KiB | 1528.38 KiB | 3,456,145 / 592,774 |
| **B · 843 packed string (shipped)** | **5880.75 KiB** | **1534.83 KiB** | **3,471,144 / 599,315** |
| C · 843 as an object literal | 5905.70 KiB | 1536.98 KiB | 3,496,691 / 601,832 |

- **Corpus cost (B − A): +14.65 KiB upload, +6.45 KiB gzipped.**
- **Packing saves (C − B): 24.95 KiB raw, 2.15 KiB gzipped**, plus 843 object
  literals the engine no longer parses at startup.

Total worker is 1534.83 KiB gzipped against Cloudflare's 10 MiB compressed
limit — about 15% used. The corpus is 0.06% of the budget. There is no size
argument against this corpus.

Encoding is `"name:rrggbb,"` pairs in one string, split at module init: 15.5 KiB
of source against 43 KiB for the equivalent object literal.

---

## 7. Files changed

| file | change |
|---|---|
| `packages/data-ops/src/color-utils.ts` | corpus, `rgbToOklab`, `oklabDistance`, `NAMED_COLORS`, `matchColorName`, rewritten `hexToColorName` / `colorNameToHex` / `isColorName` / `getUniqueColorNames` |
| `apps/web/src/palette-json.ts` | `paletteHeadline` names the whole ramp with a 52-char budget |
| `apps/web/src/semantic-search.ts` | `queryHeading` max 3; `normalizeSemanticQuery` max 5; `colorTextParts` gains opt-in multi-word matching; `queryHeadingParts` enables it for seeds only |

**Deliberately not changed:**

- `apps/web/src/popular-searches.ts` — `getColorsWithHex()` / `getColorsWithHue()`
  still return `BASIC_COLORS`. The chip rotation is a menu a person reads;
  rotating 843 names through it would surface "pale grey green" as a suggested
  search. This is why `BASIC_COLORS` was kept as a separate curated list rather
  than replaced.
- `packages/data-ops/src/gradient-gen/palette-tags.ts` — carries its own private
  41-name copy feeding `analyzeCoefficients` → palette tags → **Vectorize
  metadata**. Those tags were written at index time; changing the vocabulary
  here would desync the index from the query path. Left alone deliberately.

### Backwards compatibility

All existing export signatures still work. `colorNameToHex` resolves against the
full corpus now, but `BASIC_COLORS` claimed its names first during the build, so
every one of the 41 curated answers is byte-identical — `blue` `#0000ff`,
`purple` `#800080`, `rose` `#ff007f`, `azure` `#f0ffff`, `teal` `#008080`. The
existing assertions in `semantic-search.test.js` pass unchanged.

`colorTextParts` defaults to `maxWords: 1`, and that default is load-bearing:
`blue purple` is itself a corpus name, so greedy multi-word matching would merge
two of a user's three requested colors into one swatch. Only a caller that
generated the text from the corpus itself (the seed heading) opts in.

---

## 8. Verification

- `pnpm build:data-ops` clean.
- `cd apps/web && pnpm typecheck` clean (both tsconfigs).
- `pnpm test`: **3 files / 6 tests failing, identical to the pre-change
  baseline** — `analytics.test.js` (1), `export.test.js` (1), `fit-bench.test.js`
  (4, another workstream's). Nothing new broken.

### Open risks

1. **Search relevance is unverified end-to-end.** `normalizeSemanticQuery`
   feeds `@cf/google/embeddinggemma-300m`, and its text changed — a seed query
   now embeds "mocha deep sea blue marine midnight" instead of "gray black".
   The Vectorize index is built outside this repo, so I could not A/B retrieval.
   The new text is strictly more specific, which should help, but it is an
   assumption. Worth a spot check against `/palettes/{seed}` after deploy.
2. **No new tests were added.** `semantic-search.test.js`, `seo.test.js` and
   `semantic-route.test.js` all have uncommitted edits from another workstream;
   adding assertions there risked a conflict. The naming behavior deserves a
   test — `getUniqueColorNames` thresholds in particular are tuned constants
   with nothing pinning them.
3. **`bluegrey` and `kelley green` resolve to `null`.** Both are filtered
   misspellings that did not get alias entries. Harmless — nobody types them —
   but inconsistent with the other filtered forms, which all alias to their
   standard spelling.

### Out of scope but worth flagging

The seed page `<title>` is `#fada61 → #ff9188 → #ff5acd Gradient Palette |
Grabient` (`pages.ts`, ~line 760). Hex codes have almost no search volume;
"light gold to peachy pink to candy pink gradient" has some. `paletteHeadline`
is already computed on that render and is now good enough to carry a title.
Changing it is a live SEO decision, so it was left alone.
