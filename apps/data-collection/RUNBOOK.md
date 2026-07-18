# RUNBOOK — data-collection harness

Operational reference for restarting, monitoring, and maintaining the
query→palette training-data system with zero prior context. Companion docs:
`README.md` (setup from scratch), `TRAINING.md` (consuming the dataset),
`CLAUDE.md` (dev conventions). Branch: `data-collection` (contains master).

## What runs where

- **Cloudflare Worker** `grabient-data-collection` — owns ALL state (D1
  `grabient-dc`, Vectorize `grabient-dc-palettes`/`-queries`, R2
  `grabient-dc-exports`, Workers AI). Deploy: `pnpm run deploy` from this
  directory. NOTE: requests right after a deploy can hit the OLD version for
  ~30s — not a bug.
- **Two local loops** (WSL, this machine) invoking headless `claude -p` on
  the owner's Claude Code subscription (never API-billed):
  - generate role: Sonnet; generate-forward / caption / audit
  - judge role: Opus; triage + judge / audit
- **Dashboard**: https://grabient-data-collection.jkorzhuk.workers.dev/dashboard
  (key-gated; same key as below).
- **grabient.com/api/png** (in `apps/user-application`, on master, deployed
  to prod): bare palette renders the harness fetches for judge/caption
  vision strips.

## Credentials & key files

- `harness/.env` (gitignored): `DC_API_URL`, `DC_API_KEY` — auto-sourced by
  loop.sh, which also generates `harness/dc-api.sh` (pre-authenticated curl
  wrapper skills use; headless sessions CANNOT read env vars — sandbox).
- Wrangler needs `CLOUDFLARE_ACCOUNT_ID=f846204052f664d57da7acde8f6803cd`
  (account has two orgs; non-interactive commands fail without it).
- Optional future: `MISTRAL_API_KEY` secret → third triage seat.

## Start / stop / verify

```sh
cd apps/data-collection
# start (detached, survives terminal close)
LOOP_ROLE=generate GEN_BACKPRESSURE=1200 nohup pnpm harness:loop > harness/logs/loop-generate.out 2>&1 &
LOOP_ROLE=judge nohup pnpm harness:loop > harness/logs/loop-judge.out 2>&1 &

# verify
pgrep -af "harness/loop[.]sh"        # expect 2 (plus pnpm wrappers)
tail harness/logs/loop-generate.out harness/logs/loop-judge.out

# stop (kill-anytime is safe: leases expire in 15m, writes are idempotent)
pkill -f "harness/loop[.]sh"         # bracket trick avoids self-match
pkill -f "claude -p /"               # any in-flight headless iterations
```

Health check one-liner (works from anywhere):

```sh
KEY=$(grep DC_API_KEY apps/data-collection/harness/.env | cut -d= -f2)
curl -s -H "Authorization: Bearer $KEY" https://grabient-data-collection.jkorzhuk.workers.dev/api/stats
curl -s -H "Authorization: Bearer $KEY" https://grabient-data-collection.jkorzhuk.workers.dev/api/health
```

**Babysitter**: in a Claude Code session, re-arm with:
`/loop Periodically babysit the grabient data-collection harness: check whether harness/loop.sh is running (pgrep -f "harness/loop"), curl /api/stats and /api/recent for failed runs, judge backlog, duplicate-rejection rate, and score clustering; tail the newest harness/logs/*.log for errors; if the loop process died while it should be running, restart it with nohup; fix systematic issues and report findings briefly.`

## Hard-won operational rules (violate at your peril)

1. **Max ONE Opus judge loop.** Two concurrent → subscription limits →
   ~50% "Execution error" failures. Solo = ~0%. Judge failures that do
   happen self-heal via lease expiry.
2. **Never a second generate loop** — generators converge and burn tokens
   on duplicate rejections. Scale = role-split only.
3. **Skills must use `harness/dc-api.sh`**, never `$DC_API_KEY` expansion —
   the headless sandbox blocks env reads intermittently.
4. **Parallel judges need per-run render dirs** (loop.sh already passes
   `--out-dir harness/renders/<run_id>`; render wipes its dir first).
5. **Backpressure**: generate pauses when pending pairs > GEN_BACKPRESSURE
   (default 600; run with 1200 during Opus throttles). Unscored pairs are
   durable inventory — a deep queue is fine, a starved judge is not.
6. **Opus throttle pattern** (seen daily): judge slows/errors after hours of
   sustained use; generation keeps working. Correct response: nothing —
   backpressure buffers, judge catches up when the window resets.
7. **Turn caps**: 50 max-turns everywhere. An undersized cap kills an
   iteration mid-work and wastes everything it spent.
8. **Triage budget is self-enforced** (D1 `counters` row, 1,200 AI calls/day
   cap) because Workers AI overage on paid plans BILLS SILENTLY past the 10k
   free neurons/day. Fail-closed: at cap, triage stops, judge sees all.
9. **Skill example phrases leak into generated data** (the "3am" incident).
   Any memorable example in a SKILL.md needs the don't-reuse guard.
10. **Purge pattern** for bad queries: delete from `pairs` + `queries` (D1)
    AND `wrangler vectorize delete-vectors grabient-dc-queries --ids <id>`.
    Rejected palettes keep their vectors on purpose (region stays blocked).

## Data-quality invariants (enforced; know why)

- Queries are color exploration only — no rendering parameters
  (radial/swatches/step counts/angles); bare "gradient"/"palette" allowed.
- style/steps/angle are palette-level, LLM-chosen or derived; gradient
  styles get a banding floor (≥10 steps per frequency cycle).
- Emoji-only queries skip embedding dedup (bge can't tell them apart —
  they all collapsed into one query once).
- Triage may only auto-reject on unanimous "bad" with no dissent; the Opus
  judge is the quality gate; audits blind-re-judge and promote golden.
- Owner (human) feedback: labels on `pairs.human_label` are the export
  source of truth; golden = eval membership (excluded from training);
  human "good" = 3x SFT weight, floor 5. Owner queries (source `human`)
  are serviced first by generation and judged with priority.

## Routine tasks

```sh
# migrations (drizzle-kit generate is BROKEN here - hand-write SQL)
#   add drizzle/000N_name.sql -> pnpm run db:migrate:remote
# exports (JSONL to R2; fetch with wrangler r2 object get)
curl -s -X POST -H "Authorization: Bearer $KEY" "$BASE/api/export?format=sft"   # also: dpo, eval
# d1 ad-hoc queries
CLOUDFLARE_ACCOUNT_ID=... npx wrangler d1 execute grabient-dc --remote --json --command "select ..."
```

## When is it done?

Dashboard "Training readiness" panel = live gates. Real training run at
~10k SFT pairs / ~8k distinct queries / ~300 golden. Then follow
`TRAINING.md` end to end. As of 2026-07-18 evening: ~1.75k SFT pairs,
~1.65k queries, 70 golden, growing ~3-4k scored pairs/day when unthrottled.

## Deploy checklist (Worker changes)

`pnpm run typecheck && pnpm run test` → `pnpm run deploy` → wait ~30s
propagation → verify the touched endpoint live → if dashboard JS changed,
extract `<script>` from the live page and `node --check` it (template-literal
escapes have bitten before: write `\\n` in TS to emit `\n` in JS).
