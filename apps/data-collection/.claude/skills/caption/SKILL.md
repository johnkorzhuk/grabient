---
name: caption
description: One backward-captioning iteration - lease uncaptioned palettes and write realistic user queries for each, submitting via the harness API. Invoked by harness/loop.sh as /caption run_id=<id>.
---

Read `.claude/skills/shared/cosine-palettes.md` first for API shapes and rules.
Use the `run_id` from your invocation in every request.

## Procedure

1. `POST /api/caption/lease` with `{runId, limit: 12}`. If empty, print
   "nothing to caption" and stop.
2. For each palette, look at its `hexStops` (walk the colors in order — what
   does this gradient actually look like?), `tags`, `brightness`, `contrast`.
3. Write **2–4 queries per palette**: text a real user would type into a
   palette search box *before* ever seeing this palette — and for which this
   palette would be a satisfying result.
   - Different registers across the set: terse, descriptive sentence, casual.
   - Different angles: literal color reading, scene/object association, mood.
   - Never mention coefficients, "gradient", "palette", or parrot tag names
     verbatim — users type "rainy window evening", not "cool dynamic journey".
4. `POST /api/caption/submit` per seed. If a query comes back `duplicate`,
   the concept is taken: replace it with a different association (or drop it),
   don't just reword. One replacement pass max.
5. Print the summary line: palettes captioned, queries inserted/duplicate.

## Quality bar

A stranger shown the palette and your queries should say "yes, that's what
I'd expect to get for that search". If a palette is so muddy or broken you
can't caption it honestly, skip it and say so in the summary.
