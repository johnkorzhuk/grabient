---
name: audit
description: Periodic quality audit - blind re-judge a random sample of already-scored pairs, measure drift, and flag slipped-through bad palettes. Invoked by harness/loop.sh as /audit run_id=<id>.
---

Read `.claude/skills/shared/cosine-palettes.md` first for API shapes and rules,
and `.claude/skills/judge/SKILL.md` for the scoring rubric — audit uses the
identical rubric.

The loop has pre-rendered a random scored sample into the directory passed as
`render_dir=<dir>` in your invocation (fallback: `harness/renders/audit`):
- `<dir>/queue.json` — pairs WITHOUT stored scores (stay blind)
- `<dir>/<n>.png` — preview strips
- `<dir>/stored-scores.json` — original scores; do NOT read this until step 3

## Procedure

1. Re-score every pair in `queue.json` using the judge rubric (Read the PNGs;
   do not fetch stored scores first).
2. Write your scores down (print them) BEFORE reading `stored-scores.json`.
3. Read `stored-scores.json` and compare:
   - mean drift (your mean − stored mean)
   - pairs where |your score − stored| ≥ 3
   - pairs you'd call `bad-palette` that are currently approved
   - **per-judge-model split**: rows carry `storedJudgeModel` ("sonnet" =
     easy-tier judge, "opus"/null = main judge). Report mean drift and the
     ≥3-disagreement rate separately for sonnet-judged rows. If sonnet rows
     show |mean drift| > 1.0 or a ≥3-disagreement rate above ~10% (and the
     opus rows don't), say PROMINENTLY that the easy tier is miscalibrated
     and the judge-easy loop should be paused pending a rubric fix.
4. For any pair you scored `bad-palette`, submit the correction via
   `POST /api/judge/submit` with your score/verdict/notes and the invocation
   `run_id` as `runId` (this rejects the palette). Do NOT resubmit ordinary
   disagreements — score noise is expected; only correct structural failures.
5. **Golden promotion**: pairs you independently scored **≥ 8** where the
   stored verdict is `ok` and the stored score is also ≥ 7 have now passed two
   blind reviews — promote them via `POST /api/judge/golden` `{runId, pairs:
   [{queryId, seed}]}`. These become the curated eval set (target: ~300 golden
   queries over time; don't force it per run). The endpoint refuses pairs the
   owner has vetoed — `promoted < submitted` is expected.
6. **Human calibration check**: `GET /api/feedback/summary`. Report the
   disagreement counts — `humanBadJudgeHigh` (owner vetoed, judge scored ≥7
   ok) and `humanGoodJudgeLow` (owner endorsed, judge scored <7) — and up to
   5 example rows with query text and judge notes. This is calibration
   feedback for the judge rubric, NOT a correction signal: never resubmit
   scores based on it. If humanBadJudgeHigh exceeds ~20% of the owner's
   bad-match labels, say prominently that the rubric is too lenient for
   those query types.
7. Print the summary: sample size, mean drift, count of ≥3 disagreements,
   corrections submitted, pairs promoted to golden, human-calibration
   counts. If mean drift exceeds ±1.5, say prominently that the judge rubric
   may be drifting and the threshold constants deserve a look.
