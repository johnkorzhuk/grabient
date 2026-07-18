#!/usr/bin/env bash
# One-time Cloudflare resource creation for the data-collection app.
# Run from apps/data-collection with wrangler authenticated (wrangler login).
#
# After the D1 create, paste the printed database_id into wrangler.jsonc,
# then run migrations and set the API secret.
set -euo pipefail

npx wrangler d1 create grabient-dc
npx wrangler vectorize create grabient-dc-palettes --dimensions=32 --metric=euclidean
npx wrangler vectorize create grabient-dc-queries --dimensions=768 --metric=cosine
npx wrangler r2 bucket create grabient-dc-exports

cat <<'EOF'

Next steps:
  1. Copy the database_id printed above into wrangler.jsonc (d1_databases[0].database_id)
  2. pnpm run db:migrate:remote
  3. npx wrangler secret put HARNESS_API_KEY   (pick a long random string)
  4. pnpm run deploy
  5. export DC_API_URL=<the workers.dev URL from deploy>
     export DC_API_KEY=<the secret from step 3>
  6. pnpm harness:loop 5    # short burn-in, then run without a count
EOF
