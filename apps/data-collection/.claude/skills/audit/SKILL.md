---
name: audit
description: Periodic quality audit - blind re-judge a random sample of already-scored pairs, measure drift, and flag slipped-through bad palettes. Invoked by harness/loop.sh as /audit run_id=<id>.
---

Read `.claude/skills/shared/cosine-palettes.md` first for API shapes and rules,
and `.claude/skills/judge/SKILL.md` for the scoring rubric — audit uses the
identical rubric.

The loop has pre-rendered a random scored sample:
- `harness/renders/audit/queue.json` — pairs WITHOUT stored scores (stay blind)
- `harness/renders/audit/<n>.png` — preview strips
- `harness/renders/audit/stored-scores.json` — original scores; do NOT read
  this until step 3

## Procedure

1. Re-score every pair in `queue.json` using the judge rubric (Read the PNGs;
   do not fetch stored scores first).
2. Write your scores down (print them) BEFORE reading `stored-scores.json`.
3. Read `stored-scores.json` and compare:
   - mean drift (your mean − stored mean)
   - pairs where |your score − stored| ≥ 3
   - pairs you'd call `bad-palette` that are currently approved
4. For any pair you scored `bad-palette`, submit the correction via
   `POST /api/judge/submit` with your score/verdict/notes and the invocation
   `run_id` as `runId` (this rejects the palette). Do NOT resubmit ordinary
   disagreements — score noise is expected; only correct structural failures.
5. Print the summary: sample size, mean drift, count of ≥3 disagreements,
   corrections submitted. If mean drift exceeds ±1.5, say prominently that the
   judge rubric may be drifting and the threshold constants deserve a look.
