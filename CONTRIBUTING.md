# Contributing

## Prerequisites

- **Node 22 or newer.** Wrangler refuses to run on older versions. If you use
  nvm, `nvm use 25`.
- **pnpm 10.14** (pinned via `packageManager`).

```bash
pnpm setup    # install + build packages/data-ops
pnpm dev      # http://localhost:3001
```

## The one thing that will catch you out

**`packages/data-ops` must be rebuilt after every change to its source.**

Apps import its compiled `dist/`, not `src/`. Edit a query and forget to
rebuild, and the app keeps running the old code with no error to tell you why:

```bash
pnpm build:data-ops
```

The build now starts with a `clean` step. It did not always, which is how `dist/`
came to hold 24 compiled files whose sources had been deleted — including one
that a deleted app was still importing, which kept it building long after it
should have failed.

## Changing the database schema

1. Edit `packages/data-ops/src/drizzle/app-schema.ts`.
2. `cd packages/data-ops && pnpm drizzle:generate` to produce migration SQL.
3. Apply it:
   ```bash
   pnpm wrangler d1 migrations apply grabient --local        # local
   pnpm wrangler d1 migrations apply grabient --remote       # staging
   pnpm wrangler d1 migrations apply grabient-prod --remote  # production
   ```
4. `pnpm build:data-ops`, then restart the dev server.

### Drizzle + SQLite: aliases in ORDER BY

SQLite cannot reference a `SELECT` alias from `ORDER BY`. Reuse the same `sql`
expression object in both places rather than referring to the alias by name:

```ts
const likesCountSql = sql<number>`COALESCE(COUNT(${likes.id}), 0)`;

db.select({ likesCount: likesCountSql })
  .orderBy(desc(likesCountSql));   // not sql`likesCount`
```

## Tests and types

```bash
pnpm test        # data-ops (67) + web (240)
pnpm typecheck   # web's two TypeScript projects
```

`apps/web` has two TypeScript projects on purpose, and they do not overlap:

- `tsconfig.json` — worker code. `@cloudflare/workers-types`, no DOM lib, and it
  **excludes `src/islands`**.
- `tsconfig.islands.json` — browser code. DOM lib, Solid JSX, and `checkJs` on so
  the plain-`.js` client files are type checked through JSDoc.

That split is what keeps DOM types out of the worker and Workers types out of the
browser bundle. If you add a file to the wrong one, it will typecheck against the
wrong global environment and fail confusingly.

`src/app.client.js` is the single exception: it carries `@ts-nocheck` and a header
explaining why. If you work in it, consider annotating the part you touched.

## Deploying

```bash
pnpm deploy:staging       # grabient-lite
pnpm deploy:production    # grabient-production, i.e. grabient.com
```

Always deploy to staging first and smoke test it. Before a production deploy,
record the current version so you have something to roll back to:

```bash
pnpm --filter web exec wrangler deployments list --name grabient-production
```

A bare `wrangler deploy` cannot reach either environment — the top-level config
has no bindings by design. See the comment at the top of `apps/web/wrangler.jsonc`.

## Conventions

- Commit messages are lowercase, `type(scope): summary`, and explain *why* in the
  body when the reason is not obvious from the diff.
- Comments should record decisions and incidents, not restate the code. Several
  comments in `wrangler.jsonc` and `src/index.ts` document real production
  failures — please keep them.
