---
name: caption
description: One backward-captioning iteration - lease uncaptioned palettes and write realistic user queries for each, submitting via the harness API. Invoked by harness/loop.sh as /caption run_id=<id>.
---

Read `.claude/skills/shared/cosine-palettes.md` first for API shapes and rules.
Use the `run_id` from your invocation in every request.

## Procedure

1. Lease palettes into a file, then render them so you can SEE them:
   ```
   harness/dc-api.sh /api/caption/lease -X POST -H "Content-Type: application/json" \
     -d '{"runId":"<run_id>","limit":12}' > harness/renders/caption-<run_id>.lease.json
   npx tsx harness/palette-strips.ts --in harness/renders/caption-<run_id>.lease.json \
     --out harness/renders/caption-<run_id>
   ```
   (the strips tool creates the output directory). If the lease is empty,
   print "nothing to caption" and stop.
2. Read `harness/renders/caption-<run_id>/0.png` (and `1.png` if present) —
   8 palettes per image, row index = order in `lease.json`. Caption from what
   you SEE: these are true site renders with the palette's style/steps/angle
   applied. Use `lease.json` (`hexStops`, `tags`, `brightness`, `contrast`)
   as supporting data, not the primary source.
3. Write **2–3 queries per palette**: text a real user would type into a
   palette search box *before* ever seeing this palette — and for which this
   palette would be a satisfying result. At most ONE may be a literal
   color-path reading ("indigo drifting into teal…") — the rest must come from
   intent: a mood, a scene, a design use-case, a short head term ("dusk",
   "deep sea"), or occasionally an emoji sequence mirroring the palette's
   order and proportions (see the shared reference; styleHint "emoji"). Literal descriptions are the easy register and the
   dataset drowns in them if every caption leans that way. Your users are designers and artists
   worldwide: mix professional briefs ("packaging for herbal tea"), fuzzy
   intent ("cozy but not childish"), evocative scenes/moods, and occasionally
   a natural non-English query.
   - Different registers across the set: terse, descriptive sentence, casual.
   - Different angles: literal color reading, scene/object association, mood,
     design use-case.
   - Never mention coefficients or parrot tag names verbatim — users type
     "rainy window evening", not "cool dynamic journey". The bare nouns
     "gradient"/"palette" are fine ("moody sunset gradient" is a real
     search); parameter words (radial/angular/swatches/counts/angles) are
     not.
   - Never reuse example phrases from this file, and never dodge a duplicate
     with suffixes/rewording — a duplicate means the concept is taken.
   - **Anti-template rule**: transition narration ("X into Y", "fading",
     "drifting", "melting", "…to…") is a machine crutch — it is already ~30%
     of the corpus and real searchers rarely phrase things that way. At most
     ONE transition-phrased query per palette; the rest must NAME things:
     colors, scenes, moods, objects, use-cases.
4. `POST /api/caption/submit` per seed. Include `themes`: 3–5 free-form
   lowercase phrases naming what the palette evokes (see the Themes section of
   the shared reference) — honest associations, not creative writing. Queries
   are strictly color exploration — never mention presentation ("radial",
   "swatches", "gradient", counts, angles). If the leased palette's
   `style`/`steps`/`angle` don't fit how it actually reads, include a
   `presentation` object with better values. If a query comes back
   `duplicate`, the concept is taken: replace it with a different association
   (or drop it), don't just reword. One replacement pass max.
5. Print the summary line: palettes captioned, queries inserted/duplicate.

## Quality bar

A stranger shown the palette and your queries should say "yes, that's what
I'd expect to get for that search". If a palette is so muddy or broken you
can't caption it honestly, skip it and say so in the summary.
