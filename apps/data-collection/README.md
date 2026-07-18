# data-collection

Training-data harness for a custom model that maps user queries to cosine
palette coefficients (`color(t) = a + b·cos(2π(c·t + d))`, 12 floats).

Two halves:

1. **Cloudflare Worker** (this app's `src/`) — owns all dataset state:
   - **D1** `grabient-dc`: palettes (candidate pool with draft/approved/rejected
     lifecycle), queries, query↔palette pairs with judge scores, run bookkeeping.
   - **Vectorize** `grabient-dc-palettes` (24-dim LAB feature vectors
     zero-padded to Vectorize's 32-dim minimum, euclidean) +
     `grabient-dc-queries` (768-dim bge-base embeddings, cosine):
     similar-palette search so near-duplicate palettes are rejected at submit
     time, and semantic query dedup.
   - **Workers AI**: query embeddings.
   - **R2** `grabient-dc-exports`: JSONL dataset exports (SFT + DPO formats).
2. **Local harness** (`harness/`) — runs Claude Code in a loop. Each iteration
   is one headless `claude -p /<skill>` invocation in one of four modes:
   - `generate-forward` — invent queries targeting coverage gaps, author
     candidate palettes for each
   - `caption` — deterministic coeff-space sampler (`sample.ts`) fills coverage
     gaps, then Claude writes realistic queries for uncaptioned palettes
   - `judge` — blind-score pending pairs 0–10 against rendered PNG previews
   - `audit` — blind re-judge of a random scored sample; drift + slip-through
     detection

## Setup (one time)

```sh
pnpm install
pnpm run build:data-ops           # from repo root; the Worker imports its dist/
cd apps/data-collection
bash scripts/create-resources.sh  # creates D1, 2 Vectorize indexes, R2 bucket
# paste the printed database_id into wrangler.jsonc, then:
pnpm run db:migrate:remote
npx wrangler secret put HARNESS_API_KEY
pnpm run deploy
```

## Running the loop

```sh
export DC_API_URL=https://grabient-data-collection.<account>.workers.dev
export DC_API_KEY=<the HARNESS_API_KEY secret>
pnpm harness:loop 5     # burn-in: 5 iterations
pnpm harness:loop       # run forever (ctrl-c to stop)
```

Progress: `curl -H "Authorization: Bearer $DC_API_KEY" $DC_API_URL/api/stats`.

## Exporting the dataset

```sh
curl -X POST -H "Authorization: Bearer $DC_API_KEY" "$DC_API_URL/api/export?format=sft"
curl -X POST -H "Authorization: Bearer $DC_API_KEY" "$DC_API_URL/api/export?format=dpo"
npx wrangler r2 object get grabient-dc-exports/<r2Key> --file dataset.jsonl
```

SFT rows: `{query, coeffs, seed, score, tags, source, split}` for pairs scored
≥ 7 with verdict `ok`. DPO rows: `{query, chosen, rejected, scoreGap, split}`
for queries whose best/worst scored palettes differ by ≥ 3. Splits are a
deterministic 90/5/5 hash of the query id, so all pairs of a query share a
split and re-exports are stable.

## Dedup design

Submit-time, three tiers: exact seed / coarse similarity-key match in D1 →
Vectorize kNN over LAB feature vectors queried in both orientations
(reversal invariance) → exact average-deltaE rescore of the retrieved
candidates; below 8 avg deltaE is rejected as a duplicate with the nearest
seed returned so the generator can deliberately diverge. Queries dedup via
normalized-text unique index plus embedding cosine similarity > 0.92.
