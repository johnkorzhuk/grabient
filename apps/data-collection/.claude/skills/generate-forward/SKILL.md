---
name: generate-forward
description: One forward-generation iteration - invent user queries targeting coverage gaps and author candidate palettes for each, submitting via the harness API. Invoked by harness/loop.sh as /generate-forward run_id=<id>.
---

Read `.claude/skills/shared/cosine-palettes.md` first for the formula, API
shapes, and rules. Use the `run_id` from your invocation in every request.

If your invocation includes a `focus="<theme>|<theme>"` argument (two themes
separated by `|`), let them color this iteration: at least half of your
queries should relate to one of them — directly, laterally (a material, place,
mood, or era it evokes), or, best of all, to their *collision*. The rest still
target coverage gaps as usual. The themes exist to decorrelate iterations;
don't mention them in query text verbatim unless it naturally reads like a
real search.

**Wildcard mandate**: 1–2 queries per iteration must be deliberately unusual —
a niche subculture, an obscure material, a sensation, a specific unglamorous
place ("hospital vending machine at 3am"), a wrong-but-evocative color pairing.
The safe center of query-space fills itself; the edges only get covered on
purpose. Same bar applies: a real person could plausibly type it.

## Procedure

1. `GET /api/coverage`. Pick the 2–3 most underrepresented gaps (mix kinds:
   a tag gap, a query-category gap, a brightness/contrast band).
2. Author **6–8 queries** aimed at those gaps, spread across the taxonomy.
   About **1 in 4 queries should explicitly constrain presentation** ("5 color
   palette for…", "…swatches", "radial sunburst…", "horizontal ocean fade") —
   these teach the model to map presentation language to parameters. The rest
   must not mention presentation at all. Query kinds:
   - concrete scenes ("sunset over the ocean", "foggy harbor at dawn")
   - moods/emotions ("melancholy", "quiet optimism")
   - aesthetics ("cyberpunk neon", "cottagecore", "vaporwave")
   - color-explicit ("teal to burnt orange", "dusty pastels")
   - objects/nature ("ripe peaches", "deep kelp forest")
   - abstract/product ("energy", "calm finance dashboard")
   - season/weather/time ("first frost", "golden hour in july")
   Vary register deliberately: some terse (1–2 words), some verbose sentences,
   one casual/typo'd ("sunst over ocean"). Set `category` and `styleHint`
   honestly — they feed coverage stats.
3. For each query author **2–4 distinct candidates**. Distinct means different
   hue families or luminance shapes, not the same gradient nudged. Mix
   authoring modes: some as `hexColors` (easier to reason about), some as
   direct `coeffs`. A palette must plausibly satisfy the query — imagine a
   user typing it and seeing the result. When (and only when) the query
   dictates presentation, give each candidate matching `styleOverride` /
   `stepsOverride` / `angleOverride` (see the Presentation section of the
   shared reference); otherwise omit them — the server derives defaults.
4. Submit each query with `POST /api/submit/forward`.
5. Read rejections. For `duplicate`: you now know the neighbor exists — author
   ONE genuinely different replacement (different hue family / structure) and
   resubmit that query once. For `bad-fit`/`invalid-range`: fix the authoring
   mistake once. No second retries.
6. Print the summary line: queries submitted/duplicate, palettes
   accepted/rejected by reason.

## Quality bar

- Queries must read like real search input, not like tag lists.
- No palette should require explanation to connect to its query.
- Across the iteration, hit at least 3 different hue families and both light
  and dark palettes.
