# Palette naming & modifiers — passoff

> Historical passoff. The description system this led to is documented, with
> its acceptance measurements, in [seo-research/palette-prose.md](./seo-research/palette-prose.md).

Owner of this task: whoever picks it up next. Written 2026-08-16 mid-stream, so
the tree is in a known half-state described below. The analytics/dashboard work
continues in a separate session — **do not touch `apps/admin/`**.

---

## Why this matters more than it looks

Three consumers, and the third is the one that raises the stakes:

1. **The visible heading** on every palette page (`<h2>`), and the `<title>`.
2. **Search-engine relevance** — the name is the only prose distinguishing 866
   otherwise-identical palette pages. URL Inspection reports roughly half the
   seed corpus as "Discovered – currently not indexed", Google's verdict on
   templated pages.
3. **The embedding text for saved palettes.** These values get embedded into the
   text that backs semantic search, so a bad or generic name degrades
   *retrieval*, not just presentation. A palette described as "gray" when it is
   a duotone will not be found by someone searching for a duotone. This is the
   highest-consequence consumer and the reason to get modifier detection right
   rather than approximately right.

## Hard constraint: the Vectorize index

`packages/data-ops/src/gradient-gen/palette-tags.ts` output is written into
Vectorize metadata **at index time by a pipeline outside this repo**. Changing
existing tag *values* desyncs the index against what is already stored.

Classify every change as one of:

- **serve-time additive** — new modifiers computed on the fly for names,
  headings and meta. No reindex. Prefer these.
- **requires reindex** — changes existing values, or adds tags that must be
  searchable/embedded. Legitimate, but must be planned with a reindex.

The embedding-text requirement above means some modifiers genuinely fall in the
second bucket. Say which, explicitly, rather than quietly shipping them.

## What exists today

| Piece | Where | What it does |
|---|---|---|
| Tag axes | `packages/data-ops/src/gradient-gen/palette-tags.ts` | `dominantColors[]` + texture (monochrome\|subtle\|soft\|rich\|bold\|vivid\|electric), warmth (warm\|cool\|neutral), journey (warming\|cooling\|stable), contrast (gentle\|smooth\|dynamic\|dramatic) |
| Color corpus | `packages/data-ops/src/color-utils.ts` | 843 names (filtered xkcd CC0 + CSS Color 4), OkLab distance, `getUniqueColorNames` with farthest-point selection |
| Headline | `apps/web/src/palette-json.ts` → `paletteHeadline()` | "Pale blue to dark magenta to bright sky blue" |
| Live editor | `apps/web/src/islands/edit.tsx` | has `applied` (post-globals coeffs) and `hexColors()` as reactive memos |

### The model, for reference

Each RGB channel is `clamp01(a + b·cos(2π(c·t + d)))`, sampled at
`t = i/(steps-1)`. Four global modifiers are baked into the coefficients before
sampling: exposure adds to `a`, contrast multiplies `b`, frequency multiplies
`c`, phase adds to `d`. `paletteJson` exposes the globals separately.

## Work completed today (shipped to staging)

- **Names are steps-aware.** The same seed at 3 vs 13 steps now produces
  different names, because the palette genuinely is different. Verified live.
- **Per-surface budgets.** Heading 80 chars / 6 names; `<title>` and the meta
  description opener 44 chars / 4 names. Raising the ceiling is safe: measured
  across ceilings 3–8, a subtle charcoal ramp stays 1 name and a two-tone stays
  2 — only genuinely wide palettes gain names.
- **The name is a visible `<h2>`** above the (removed) related links, with an
  sr-only description carrying hex codes and tags.
- **Related chips were removed** at the owner's request. Note the cost: they
  were the only outbound links on seed pages. If modifiers make good link
  targets, this is worth revisiting *visually* (a related-palettes row showing
  gradients, not word pills).

## The half-finished thing — read this before writing code

`apps/web/src/palette-name.ts` **exists but nothing imports it.** It is a
server-dependency-free extraction of the naming logic (`headlineFromColors`,
budgets, `styleLabel`, `paletteDescription`), created to let the editor island
import naming without dragging in valibot and request parsing.

It duplicates logic still living in `palette-json.ts`. The tree typechecks and
staging is healthy, but **this duplication must be resolved** — either finish
the extraction (have `palette-json.ts` import from `palette-name.ts`) or delete
the new file. Do not leave two copies.

### Why it was being extracted: the rapid-update requirement

The editor currently updates the name via a **fetch of `/{seed}.json` fired from
the throttled URL write**, so the heading lags the sliders. The owner wants the
name and tags to track the **high-velocity client state** — updating on every
tick, like the preview, graph and swatches already do.

That means computing name and tags **client-side**, which means shipping to the
browser:

- `getUniqueColorNames` + the 843-name corpus (**+6.45 KiB gzipped**, measured)
- `analyzeCoefficients` + `tagsToArray` from `palette-tags.ts` (small; 42 colors)

Both inputs are already reactive in the island: `applied` for the coefficients
and `hexColors()` for the rendered colors. The synchronous update belongs in
`updateStaticSurfaces()` in `edit.tsx`, alongside the existing preview/graph/
swatch updates. The `describePalette` fetch and its call inside `writeUrl`
should then be deleted.

**Check the bundle after.** Client entry is ~196 KB; +6.5 KB gzip is the price
of instant naming and was judged acceptable, but measure rather than assume.

## The research task

An agent is producing `seo-research/palette-modifiers.md` covering: prior art
(thi.ng/cgg, Coolors, Adobe Color, chroma.js, culori, name-that-color, harmony
classification literature), modifiers inferable from raw coefficients, modifiers
inferable from rendered hex in OkLCh, a search-demand cross-check, and
distributions measured across all 866 live palettes at 3/7/13/24 steps.

**The owner specifically wants `monochrome` and `duotone` detected**, plus the
general family: pastel, neon, muted, vivid, dark, high-contrast, rainbow/
multicolor, and harmony classes (analogous, complementary, triadic).

### Rules that apply to anything shipped from that research

1. **No proposal without a measured distribution.** A modifier firing on >60%
   or <2% of the corpus carries no information.
2. **Check step-stability.** Palettes change with `steps`; a modifier that flips
   wildly between 7 and 13 steps is a bug unless it is inherently step-derived
   (cycle count legitimately is).
3. **Search demand decides ties.** A mathematically elegant descriptor nobody
   searches is worth less than a crude one matching a real query. See
   `seo-research/demand-longtail.md` for the observed `{color} gradient
   {modifier}` grammar.
4. **Keep the name readable.** Budgets above. A modifier may be worth more in
   the `<title>` (where it is a search term) than in the name.
5. **State reindex impact** for every modifier that touches embedding text.

## Verification commands

```bash
cd apps/web && pnpm typecheck && pnpm test
```

Known pre-existing failures, unrelated: `test/analytics.test.js`,
`test/export.test.js`, and `test/fit-bench.test.js` (an abandoned
fitting-algorithm workstream — its harness is on disk, the implementation is
not). Anything else failing is yours.

Measurement harness pattern that worked well: pull live seeds from
`https://grabient.com/sitemap.xml`, render with `renderPalette` from
`apps/web/src/palette.ts` in a scratch vitest file under `apps/web/test/`,
print a distribution table, then delete the file.

Staging: `pnpm deploy:staging` from `apps/web`, then curl
`https://grabient-lite.jkorzhuk.workers.dev/...` with `-L` (default params 301
away, and an unfollowed redirect looks exactly like an empty page — this cost
time today). Production deploys are **deferred** by owner decision.

## Files

```
apps/web/src/palette-name.ts        NEW, unimported — resolve the duplication
apps/web/src/palette-json.ts        paletteHeadline, paletteJson, TITLE_HEADLINE
apps/web/src/pages.ts               paletteContext() ~line 667, seedPage() title ~765
apps/web/src/islands/edit.tsx       updateStaticSurfaces ~line 342, describePalette ~450
packages/data-ops/src/color-utils.ts        corpus + getUniqueColorNames ~line 537
packages/data-ops/src/gradient-gen/palette-tags.ts   the four tag axes
seo-research/color-corpus.md        how the 843-name corpus was chosen
seo-research/palette-modifiers.md   the research deliverable (in progress)
```
