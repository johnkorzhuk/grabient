# data-collection app notes

- This Worker imports `@repo/data-ops` from its compiled `dist/`. After any
  change there run `pnpm run build:data-ops` from the repo root, or types and
  runtime will disagree.
- The D1 schema is app-local (`src/db/schema.ts`, migrations in `./drizzle`).
  Do NOT add this app's tables to `packages/data-ops/src/drizzle` — that
  directory is the production Grabient database's migration history.
- Schema change flow: edit `src/db/schema.ts` → `pnpm run drizzle:generate` →
  `pnpm run db:migrate:remote` (or `:local`).
- After editing `wrangler.jsonc`, rerun `pnpm run cf-typegen`.
- Vectorize and Workers AI have no local simulator; those bindings are declared
  `"remote": true` and dev uses `wrangler dev --x-remote-bindings`. The dedup
  and query-embedding code paths fall back gracefully (brute-force D1 scan /
  fail-open) when the bindings are unreachable in pure-local dev.
- The 12-float ↔ 4x4-with-alpha coeffs conversion lives ONLY in
  `src/lib/features.ts` (`toCosineCoeffs`/`toFlat12`). Don't reimplement it.
- Skills in `.claude/skills/` are invoked headless by `harness/loop.sh`; they
  assume `DC_API_URL`/`DC_API_KEY` env vars and must never write repo files.
