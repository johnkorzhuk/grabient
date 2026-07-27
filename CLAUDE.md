# Working in this repo

Read [CONTRIBUTING.md](./CONTRIBUTING.md) first — it covers setup, the data-ops
build step, schema changes and the deploy commands. This file records the things
that are easy to get wrong and expensive to get wrong.

## Environment

- **Node 22+ is required.** Wrangler exits immediately on Node 20. `nvm use 25`.
- After changing anything under `packages/data-ops/src/`, run
  `pnpm build:data-ops`. Apps import `dist/`, so without it your change silently
  does nothing.

## Deploying

`apps/web` serves grabient.com in production. Always pass `--env`:

```bash
pnpm deploy:staging      # grabient-lite
pnpm deploy:production   # grabient-production — this is the live site
```

Never deploy to production without a staging smoke test first. Two applications
once both claimed the worker name `grabient-production`, so a deploy from the
wrong directory replaced the live site. The top-level wrangler config is now
deliberately inert to prevent a repeat — do not add bindings to it.

Do not add `routes` or `custom_domain` to `wrangler.jsonc`. The hostnames are
attached in the Cloudflare dashboard; adding them here would change live routing.

## Things that look like bugs but are not

- **Duplicated bindings across environments.** Cloudflare does not inherit
  bindings into named environments. The duplication is required.
- **`disableCookieCache: true` on every session check.** Deliberate; it costs a
  D1 read per request but prevents stale sessions.
- **`no-store` on list pages and every redirect.** List HTML embeds live like
  counts. See the cache section in `apps/web/README.md` — two production
  incidents came from getting this wrong.
- **`cross_version_cache: false`.** Pinned on purpose so each deploy starts from
  a cold edge cache.
- **The two r2.dev URLs.** Each fronts exactly one bucket. Pairing the staging
  URL with the production bucket writes avatar URLs into D1 that 404. This has
  happened.

## Before you claim something is dead

The `packages/data-ops` export map is wildcarded, so a subpath can look unused
while still being imported internally — `valibot-schema/contact` is only reached
through `valibot-schema/auth`. Grep `src/` as well as the apps.

## Style

- Match the surrounding code. `src/pages.ts` is template literals, not JSX.
- Comments explain *why*, especially when they record an incident. Do not delete
  those when refactoring.
- Do not commit or push unless asked.

## Local-only, never commit

`apps/data-collection/`, `.codex/` and `.agents/` are gitignored. `.codex/config.toml`
contains a live API token in plaintext. Do not `git add -A` without checking what
that would stage.
