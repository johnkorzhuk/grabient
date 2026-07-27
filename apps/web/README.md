# apps/web

The Grabient site. One Cloudflare Worker serving server-rendered HTML, with
Solid components swapped in for the parts that need to be interactive.

Replaced a React/TanStack Start app in July 2026. The goal was to cut the client
bundle and the dependency surface, so the choices below lean consistently toward
"render on the server, ship as little JS as possible."

## How a page is put together

`src/index.ts` is the whole worker: one Hono instance, no sub-routers. Routes are
registered in order and `/:seed` is the catch-all, so **order matters** — a new
top-level route must go above it.

`src/pages.ts` renders HTML with plain template literals. There is no JSX on the
server. Escaping is manual, via `esc()` from `src/esc.ts` — that lives in its own
module because `src/html.ts` imports build artifacts and so cannot be shared with
client code.

`src/html.ts` wraps everything in the document shell. It inlines the entire
stylesheet into every response as a `<style>` block, which costs bytes per page
but removes a render-blocking request.

### Islands are replacement, not hydration

The server renders complete, working HTML. Then `src/islands/entry.tsx` looks for
three mount points and *replaces* what the server sent:

| Mount | What happens |
|---|---|
| `#grid-island` | Mounted eagerly, then `#grid-ssr` is removed outright. The Solid grid recomputes card gradients client-side from the seed, so hover previews are instant. |
| `#editor-island` | Lazily imports `./edit` on seed pages. |
| `#export-slot` | Lazily imports `./export` on list pages. Plain DOM, no Solid. |

Islands re-mount on a custom `app:swap` event fired by the navigation layer.

`/saved` deliberately opts out (`island: false`): its data is per-user and must
not come from the public `/api/palettes`, so it keeps its server-rendered grid
and repaints previews in place instead.

### src/app.client.js

2,988 lines of vanilla JS re-implementing the parts of TanStack Router and Query
the site actually used: intent preloading, stale-while-revalidate navigation,
in-flight deduplication, scroll restoration, plus tooltips, menus, theme toggle
and the auth/session layer.

This is the biggest maintenance liability in the app and the only file excluded
from type checking. Its header explains the cost of fixing that.

## Two rules that are easy to break

**1. One palette has many seeds.** Legacy ids embed view parameters and v3 ids
embed non-default globals, so several seed strings can render the same palette.
`paletteCoeffKey(seed)` is the identity. Like buttons therefore carry two
attributes: `data-like-seed` (the coefficient key, what likes match on) and
`data-like-row` (the stored row a like is recorded against, so list counts keep
joining). Mixing these up makes hearts appear on the wrong cards.

The like button exists twice — `likeButton()` in `src/buttons.ts` and the Solid
mirror in `src/islands/grid.tsx`. `test/like-button-parity.test.js` asserts they
stay identical.

**2. Anything containing live like counts must not be cached.** List HTML embeds
live totals, so `LIST_HEADERS` is `no-store`. Every redirect sets an explicit
cache policy, because Workers Cache applies a heuristic TTL to header-less 3xx
responses. Two incidents came from this: an anonymous `get-session` response was
edge-cached and served to signed-in users, and the HTTP→HTTPS 301 was cached
against a key the canonical HTTPS URL shared, turning it into a self-redirect.

`cross_version_cache` is pinned to `false` in `wrangler.jsonc` so the worker
version is part of the cache key and every deploy starts from a cold edge cache.
`test/cache-policy.test.js` pins this contract.

## Build

```bash
pnpm build       # tailwind -> dist/styles.css, then vite -> dist/client
pnpm dev         # builds, then wrangler dev --env staging on :3001
pnpm test        # vitest, 240 tests
pnpm typecheck   # both TypeScript projects
```

The order is load-bearing. `wrangler deploy` bundles `src/index.ts`, which
imports `../dist/styles.css` and `../dist/client/.vite/manifest.json` directly.
**A clean checkout cannot typecheck or deploy until `build` has run at least
once**, and `packages/data-ops` must be built too.

This is worth fixing — the official `@cloudflare/vite-plugin` builds worker and
client together and removes the coupling — but it is a real refactor of the build,
not a config tweak.

## Bindings

`DB` (D1) and `UPLOADS` (R2) are required. `AI`, `VECTORIZE`, `SEARCH_CACHE`,
`OG_IMAGE_CACHE` and `RATE_LIMITER` are all optional and genuinely handled:
semantic search returns `[]` and logs a warning without AI or Vectorize, and
rate limiting is skipped entirely without the Durable Object. That is what makes
the app runnable in a bare local environment.

See `src/env.d.ts` for the full contract — it is hand-maintained, not generated.

## Known gaps

- `src/app.client.js` is untyped (`@ts-nocheck`, 536 errors if enabled).
- `src/search-feedback.js` records thumbs up/down into `localStorage` and nothing
  ever reads or transmits it. The backing table was dropped. It currently
  collects into the void — either wire it to an ingestion route or remove it.
- `getLikesCountsByKeys` aggregates the entire likes table in JS. Fine at ~1.2k
  rows; it will not be fine at 100k.
- No tests cover `/api/og*`, `/sitemap.xml`, or the `/e` PostHog proxy.
- `posthog-js` is 168 KB, the largest dependency, for what is a fire-and-forget
  event pipe already proxied through `/e`.

## Further reading

- [`docs/search-refactor-research.md`](./docs/search-refactor-research.md) —
  original research behind the semantic search design.
