# Query-space map (version: 1)

The axes of real palette-search space. Generation should, over many
iterations, cover the *cross product* — most sits empty by default because
models gravitate to the same comfortable center (scene + mood + English +
medium length). Skills read this to know which directions exist; the
coverage report says which are currently thin.

**The guard (the "3am" rule)**: everything below is vocabulary and axis
labels, not query text. Never reuse, paraphrase, or riff on any phrase from
this file (or any SKILL.md) in generated query text. Single vocabulary words
(scheme names, hue names, movement names) are fine — real users type those;
it is composed *phrases* that must be invented fresh every time.

## Axes

**1. Color-theory scheme** — measured via `category: "color-theory"` on
queries and harmony tags on palettes (coverage `tagHistogram`).
Vocabulary: monochromatic, analogous, complementary, split-complementary,
triadic, tetradic; plus adjacent designer language — warm/cool temperature
contrast, duotone, accent-on-neutral, 60-30-10 proportions, shades/tints of
a single hue, "opposite colors". Real scheme queries ANCHOR the scheme word
to hues, a mood, or a use-case; a bare scheme name alone is a head term.

**2. Subject matter** — measured via the other `category` values: scene,
mood, aesthetic, color-explicit, object, nature, abstract,
season-weather-time.

**3. Vocabulary sophistication** — prompt-steered. Layperson ("goes with",
"not too bright") → enthusiast (pastel, jewel tones, earthy) → designer
(muted, desaturated, high-key, tonal) → colorist/print jargon (CMYK-safe
feel, overprint, riso, Pantone-ish references). Most corpora over-index the
middle; deliberately visit both ends.

**4. Use-case / professional context** — prompt-steered. Brand identity,
UI/app, packaging, editorial, interior, fashion, motion/title design, data
viz, wedding/event, game art, tattoo flash, ceramics/craft.

**5. Art & design movements** — prompt-steered. Bauhaus, impressionism,
fauvism, art deco, art nouveau, memphis, brutalism, swiss/international,
ukiyo-e, de stijl, psychedelia, vaporwave and other net aesthetics.

**6. Era / decade** — prompt-steered. 50s kitchens through 70s earth tones,
80s neon, 90s grunge, y2k chrome, plus deeper history (victorian, baroque,
medieval manuscript).

**7. Culture / region** — prompt-steered; measured loosely via
`nonEnglishPct`. Festivals, cuisines, textiles, crafts, cinema and music
scenes from anywhere on earth — not just anglo/US references. ~1 non-English
query per iteration (rotate: es, pt, fr, de, ja, ko, zh, it, tr, id, hi,
ar…), natural phrasing.

**8. Register & length** — measured via `styleHint` (short, verbose, typo,
casual, emoji) and `headTermPct` (1–2 word queries, target 8%). Terse head
terms, full-sentence briefs, fuzzy underspecified intent, casual/typo'd,
emoji sequences.

## Measured vs prompt-steered

Measured axes (category counts, harmony tags, headTermPct, nonEnglishPct,
colorTheoryPct, styleHint counts) appear in `GET /api/coverage` and the
dashboard — trust those numbers over intuition when choosing targets. The
prompt-steered axes have no counter yet: rotate through them deliberately,
using the `focus` themes and `lens` directive as your randomizer.
