---
name: judge
description: One judging iteration - score pending query-palette pairs 0-10 against rendered previews and submit verdicts. Invoked by harness/loop.sh as /judge run_id=<id>.
---

Read `.claude/skills/shared/cosine-palettes.md` first for API shapes and rules.

The loop has already leased the queue and rendered it into the directory
passed as `render_dir=<dir>` in your invocation (fallback:
`harness/renders/judge`):
- `<dir>/queue.json` — the pairs in index order
- `<dir>/<n>.png` — preview strips, 8 rows per image, each row labeled with
  its index

If `queue.json` is missing or empty, lease and work text-only via
`POST /api/judge/lease` (hexStops + tags are enough in a pinch).

Some pairs carry `triageVotes` — votes from a panel of small free models
that pre-screened the queue. Treat them as a WEAK HINT at most: your eyes on
the rendered gradient outrank the panel every time, and you must never
lower a score merely because the panel leaned negative.

Your invocation may include `tier=easy|hard` and `judge_model=<model>`.
`tier=easy` means every pair in this queue was voted unanimously "good" by
the triage panel — that is why a faster model is judging them. It changes
NOTHING about the rubric: score independently, use the whole scale, and if
a pair is actually bad, say so — unanimous panel approval has been wrong
before and catching that is exactly your job.

## Procedure

1. Read `queue.json`, then Read each PNG and look at the actual gradients.
2. Score every pair with two gates:
   - **Gate 1 — palette quality** (ignore the query): muddy grays, hard
     clipping bands, stripey high-frequency repeats, near-flat or near-black →
     verdict `bad-palette`, score 0–2, note why.
   - **Gate 2 — query fit** (only if gate 1 passes): would a user who typed
     this query be satisfied seeing this palette?
     - 9–10: exactly what the query evokes; colors, mood, and structure all fit
     - 7–8: clearly appropriate, minor mismatch (temperature slightly off, one
       stray stop)
     - 5–6: defensible but generic — would fit many queries equally well
     - 3–4: recognizable effort, wrong dominant impression → verdict `bad-match`
     - 0–2: unrelated → verdict `bad-match`
     Verdict is `ok` for scores 5+ when the palette itself is sound.
3. Be harsh. Target mean around 6 and use the whole scale; a wall of 7s and 8s
   makes the dataset unable to teach the difference between good and great.
   Score each pair independently — no curve within the batch.
   Also emit `ambiguity` per pair — how constraining the QUERY is, independent
   of this palette: `low` = query pins the palette down ("teal to burnt
   orange"), `medium` = clear direction, many valid answers ("autumn forest"),
   `high` = nearly anything defensible ("energy", "vibes"). This calibrates
   eval scoring later: a miss on a low-ambiguity query is meaningful, on a
   high-ambiguity one it isn't.
4. Keep notes short and machine-readable, e.g. "too warm for 'arctic'",
   "clips to white at t>0.8".
5. Submit all results in one `POST /api/judge/submit` (batch ≤ 50), passing the
   `run_id` you were invoked with as `runId`. If your invocation included
   `judge_model=<model>`, include it as `judgeModel` in the body (this is how
   audit measures per-model agreement — never omit or misstate it).
6. Print the summary line: pairs scored, score histogram, bad-palette count.
