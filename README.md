# Grabient

Gradient generator and color palette search, at [grabient.com](https://grabient.com).

Palettes are stored as **cosine gradients** — four 3-channel coefficients that
reconstruct a full gradient from twelve numbers, using
[Inigo Quilez's technique](https://iquilezles.org/articles/palettes/). A palette's
whole identity fits in its URL, so there is nothing to look up to render one.
Search is semantic: your query is embedded and matched against palette vectors,
rather than matched on color names.

## Layout

```
apps/web/          The site. A Cloudflare Worker: Hono + server-rendered HTML,
                   with Solid "islands" swapped in for the interactive parts.
packages/data-ops/ Shared database schema, queries, auth setup, gradient math
                   and seed serialization. Consumed by apps/web.
```

A pnpm workspace. There is no turbo/nx — just pnpm filters.

## Quickstart

Requires **Node 22+** (wrangler will refuse to start otherwise) and pnpm 10.

```bash
pnpm setup                      # install, then build packages/data-ops
cp apps/web/.dev.vars.example apps/web/.dev.vars   # then fill it in
pnpm dev                        # http://localhost:3001
```

`pnpm setup` builds `packages/data-ops` as a separate step because apps import
its compiled `dist/`, not its `src/`. You will need to re-run
`pnpm build:data-ops` after editing anything in that package —
see [CONTRIBUTING.md](./CONTRIBUTING.md).

To populate the local database with sample palettes, run the dev server once so
D1 initializes, then:

```bash
pnpm db:seed
```

## Environments

Cloudflare does **not** inherit bindings between environments, so every binding
is declared per environment in `apps/web/wrangler.jsonc`.

| | Worker | Database | Command |
|---|---|---|---|
| **Local** | — | local SQLite in `.wrangler/` | `pnpm dev` |
| **Staging** | `grabient-lite` | D1 `grabient` | `pnpm deploy:staging` |
| **Production** | `grabient-production` | D1 `grabient-prod` | `pnpm deploy:production` |

Local development uses the staging configuration (`wrangler dev --env staging`)
but simulates D1 locally, so it never writes to the staging database. Vectorize,
Workers AI, KV and R2 are marked `remote` and do talk to the real staging
resources, because their local emulation is not useful.

There is deliberately **no deployable top-level configuration**. A bare
`wrangler deploy` resolves to an inert worker with no bindings and cannot reach
either real environment. Always pass `--env`.

Deploys are manual. There is no CI pipeline in this repo, and no `main` branch —
the default branch is `master`.

### Custom domains

`grabient.com` and `cdn.grabient.com` are attached to their workers in the
Cloudflare dashboard, not in `wrangler.jsonc`. There is no `routes` or
`custom_domain` key here; adding one would change live routing.

## Database

D1, accessed through Drizzle. Schema and migrations live in
`packages/data-ops/src/drizzle/`.

```bash
pnpm db:studio                  # browse the local database

cd packages/data-ops
pnpm drizzle:generate           # generate migration SQL from schema changes
pnpm wrangler d1 migrations apply grabient --remote        # staging
pnpm wrangler d1 migrations apply grabient-prod --remote   # production
```

Seeding staging or production is `pnpm db:seed remote --db=grabient` and
`pnpm db:seed:prod --db=grabient-prod`, from `packages/data-ops`.

## Testing

```bash
pnpm test        # data-ops + web
pnpm typecheck   # both of web's TypeScript projects
```

## Acknowledgments

Built using [saas-kit](https://github.com/backpine/saas-kit) by Backpine (MIT License).

Gradient generation follows [Inigo Quilez's cosine gradient technique](https://iquilezles.org/articles/palettes/)
and [thi-ng/cgg](https://github.com/thi-ng/cgg).

## License

Functional Source License 1.1, Apache 2.0 Future License (FSL-1.1-ALv2).

- You can use, modify, and distribute this code
- You can build non-competing products
- You cannot build a competing commercial color palette service
- After 2 years, becomes Apache 2.0 (fully open source)

See [LICENSE.md](./LICENSE.md) for details.
