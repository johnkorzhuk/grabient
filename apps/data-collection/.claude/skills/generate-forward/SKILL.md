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
2. Author **8–10 queries** aimed at those gaps, spread across the taxonomy.
   Queries are **strictly color exploration** (like Adobe Color search): what
   the user wants to *see*, never how it should be rendered. No
   parameter-dictating words — "radial", "angular", "swatches", "conic",
   step counts ("5 color"), or angles — in any query. The bare nouns
   "gradient" and "palette" are fine (real users type them constantly); it's
   rendering *parameters* that must stay out. Query kinds:
   Imagine the whole population of people who search for color: designers,
   illustrators, artists, hobbyists — worldwide. Mix WHO is typing:
   - working designers with a brief: brand/UI/packaging/editorial/interior/
     fashion/motion ("colors for a specialty coffee brand", "trustworthy but
     not corporate fintech", "kids cereal box")
   - fuzzy, underspecified intent — people often can't name what they want
     ("something calm but expensive", "warm but not orange-y", "less loud
     version of sunset colors")
   - concrete scenes, objects, nature, moods, aesthetics, seasons — the
     evocative register
   - color-explicit requests naming actual hues
   - global cultural references, not just anglo/US ones (festivals, cuisines,
     places, crafts, film/music scenes from anywhere)
   - roughly one query per iteration in a non-English language a real user
     would type (rotate: es, pt, fr, de, ja, ko, zh, it, tr, id, hi, ar…),
     natural phrasing, not a translation exercise
   Vary register deliberately: some terse (1–2 words), some verbose sentences,
   one casual/typo'd, and **one emoji query** (see the Emoji queries section
   of the shared reference — sequence is order, repetition is proportion;
   styleHint "emoji"). Set `category` and `styleHint` honestly — they feed
   coverage stats.

   **Head terms**: real search traffic is Zipfian — "sunset", "ocean",
   "forest", "neon", "pastel" get typed constantly. Include **2 short
   high-traffic queries** (1–2 words) per iteration. These MAY already exist
   in the dataset — that is fine and intended: the server links your new
   candidates to the existing query, deepening its answer pool. When one comes
   back `duplicate`, your candidates still land; just make them genuinely
   different from what the dedup feedback shows.

   Anti-template rule: transition narration ("X into Y", "fading",
   "drifting", "melting") is over-represented in the corpus — at most one
   such query per iteration; prefer queries that NAME colors, scenes, moods,
   objects, or use-cases.

   Hard rules: never reuse or lightly reword the example phrases in this file
   (they are documentation, not seeds — thousands of iterations copying them
   collapses diversity). Never dodge a duplicate rejection by suffixing the
   text ("(retry)", "v2", punctuation tweaks) — a duplicate means the CONCEPT
   is taken; move to a different concept.
3. For each query author **2–4 distinct candidates**. Distinct means different
   hue families or luminance shapes, not the same gradient nudged. Mix
   authoring modes: some as `hexColors` (easier to reason about), some as
   direct `coeffs`. A palette must plausibly satisfy the query — imagine a
   user typing it and seeing the result. Give each candidate the `style` /
   `steps` / `angle` that best fit **that palette** — chosen from how the
   palette reads, never from the query (see the Presentation section of the
   shared reference). Omit them if unsure; the server derives defaults.
4. Across the iteration include at least **2 vivid, high-contrast candidates**
   (strong amplitudes, complementary hues — the 0.25+ contrast band) and
   occasionally a very dark or very light palette; the pool skews mid-tone
   without deliberate effort at the edges.
5. Submit each query with `POST /api/submit/forward`.
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
