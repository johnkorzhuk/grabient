# Web-lite handoff — 2026-07-21

Continuation doc for the grabient "web-lite" rebuild. A long-form memory of the
whole project also lives at
`/home/korz/.claude/projects/-home-korz-projects-grabient33-grabient/memory/web-lite-rebuild.md`
— read it before making changes; it records the gotchas that will bite you.

## Where everything lives

| Thing | Location |
|---|---|
| Worktree (work here) | `/home/korz/projects/grabient33/grabient/.claude/worktrees/web-lite/` |
| Branch | `worktree-web-lite` (main repo checkout: `/home/korz/projects/grabient33/grabient`, master branch) |
| The app | `apps/web/` (this directory) — minimal SSR (Hono) + Solid islands on Cloudflare Workers |
| Reference app being replaced | `apps/user-application/` (TanStack Start; use it as the spec, don't edit it) |
| Shared package | `packages/data-ops/` — auth factory, drizzle schemas, palette queries. **After editing it: `pnpm build` in that dir** (web imports its `dist/`) |
| Deployed preview | https://grabient-lite.jkorzhuk.workers.dev (worker `grabient-lite`, default env = staging D1 `grabient` acb5748b…; `production` env = `grabient-prod` 8902a4a8… — same DBs as the live site, so auth users/likes are real shared data) |

**Git state (everything is uncommitted):** `apps/web/` is entirely untracked;
`packages/data-ops/src/queries/palettes.ts` and `pnpm-lock.yaml` are modified.
Nothing has been committed or pushed (per John's standing instructions — don't
commit/push unless asked).

## Environment / workflow essentials

- **Node**: `source ~/.nvm/nvm.sh && nvm use 25` before ANY pnpm/node/wrangler
  command (system node v20 breaks vite + CDP scripts). Shell cwd resets between
  commands — `cd .../apps/web` first every time.
- **Deploy**: `cd apps/web && CLOUDFLARE_ACCOUNT_ID=f846204052f664d57da7acde8f6803cd pnpm run deploy --env=""`
- **Checks**: `pnpm run typecheck` (two tsconfigs) and `pnpm exec vitest run`
  (currently 93/93 green).
- **Visual verification** (required before claiming UI work done): headless
  chrome at `~/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`
  with `LD_LIBRARY_PATH=<scratchpad>/libs/usr/lib/x86_64-linux-gnu`; ready-made
  scripts in the session scratchpad
  `/tmp/claude-1000/-home-korz-projects-grabient33-grabient/6f805542-3a5d-4099-a5f4-785b1e8067bd/scratchpad/`:
  `cdp-shot.mjs URL OUT W H`, `auth-flows.mjs` (signed-out flows),
  `auth-signed-in.mjs` (forged-cookie signed-in E2E), `count-hearts.mjs`.
  Note: scratchpad is session-scoped and may be gone in a new session — the
  scripts are small; recreate from the memory file's notes if needed.
- **Seed-page URLs 301 unknown query params** — cache-bust seed pages by
  following redirects (`curl -sL`), not by adding `?cb=`.

## Current deployed state (version d9e45f66)

Auth + saved palettes are LIVE and verified end-to-end:

- better-auth at `/api/auth/*` via `src/auth.ts` (data-ops `setAuth`: D1 drizzle
  "sqlite", Google OAuth + magic-link via Resend — same config/email as the
  original `apps/user-application/src/server.ts`).
- Secrets set on the worker AND in `apps/web/.dev.vars` (gitignored):
  `BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, RESEND_API_KEY, EMAIL_FROM`.
- Routes: `GET /login` (SSR, no-store), `GET /saved` (per-user list, island
  disabled, in-memory pagination), `GET /api/likes`, `GET /api/like-info?seed=`,
  `POST /api/likes/toggle` (valibot-validated, 401 signed out).
- Client (`src/app.client.js`, auth section at bottom): session boot gated on
  `#auth-slot`, avatar + dropdown (Saved palettes / Sign out), liked hearts via
  generated `<style id="liked-style">` keyed on `[data-like-seed]` (survives
  body swaps + island re-renders), optimistic toggle with rollback, login-page
  Google/magic-link handlers hitting better-auth REST directly.
- `likeButton()` in `src/pages.ts` is the SSR heart markup; `LikeButton` in
  `src/islands/grid.tsx` mirrors it EXACTLY — keep them in sync. Seed-page
  button has `data-like-current` (seed read from URL at click time) +
  `data-like-info` (client fetches count); it must stay SSR (exists at boot).
  The edit island's old decorative heart was REMOVED — do not re-add.

**Caveats told to John:**
1. Google sign-in on the workers.dev domain needs
   `https://grabient-lite.jkorzhuk.workers.dev/api/auth/callback/google` added
   to the Google OAuth client's authorized redirect URIs (Google Console).
   Magic link works today.
2. No rate limiting on like-toggle (original uses a Durable Object, 20/min) —
   revisit before custom-domain cutover.

## In-flight work (implemented locally, NOT deployed)

**1. Default favicon + logo-bar palette** — DONE locally, typecheck+tests green,
needs deploy + visual check. John picked seed
`_gKdgHPgKkgGhgFxgD_gJkgL8gLOgXRgEsgNK` (linearGradient, steps=8, angle=45):
- `src/palette.ts` (bottom): `DEFAULT_PALETTE`, `DEFAULT_FAVICON` (data-URI via
  `faviconDataUri`), `DEFAULT_LOGO_COLORS` (hexColors sampled start/mid/end).
- `src/html.ts`: `meta.favicon ?? DEFAULT_FAVICON ?? FAVICON`.
- `src/icons.ts`: `LOGO()` default stops = `DEFAULT_LOGO_COLORS` (old
  `BRAND_STOPS` kept as fallback only).

**2. Sized-preview space efficiency (canvas mode) — NOT started, investigation
notes:** John's complaint: on `/​<seed>?size=WxH` at canvas breakpoints
(<64rem), the aspect-fitted preview is far smaller than the space available —
it should get the full area the unsized gradient enjoys (edge-to-edge up top).
Root cause direction: below lg, `main.seed-stage` has NO fixed height (the
`lg:h-[calc(100dvh-174px)]` only applies ≥lg) and canvas CSS sets
`.seed-hero #preview-box { min-height: 0 }`, so `#preview-box`'s `flex-1` has
nothing to stretch into and the fitted box collapses toward its content size.
Relevant code: `src/app.css` `@media (width < 64rem)` block (~line 486+:
`.seed-hero:not(.has-size) #preview-fit/#edit-preview` full-bleed rules,
`.seed-hero .seed-stage` flex column) and `src/islands/edit.tsx` `applyFit()`
(computes width/height from `#preview-box` rect — if the box gets taller, the
fit follows automatically). Likely fix shape: in canvas mode give
`.seed-hero.has-size` a stretched preview area (e.g. make `.seed-stage`'s
column let `#preview-box` flex-grow with a real height basis — the hero is
already `height: 100dvh`), then verify: sized portrait + landscape at ~683×1000
and ~980×700, unsized canvas mode unchanged (full-bleed regression is the #1
risk — see memory: adding positioning/heights near `#preview-box` broke
edge-to-edge before), and desktop (≥64rem) untouched. Screenshot everything.

**3. TypeGPU login companion — NOT started (agent was killed before producing
anything; no files written).** Brief: research TypeGPU (Software Mansion
WebGPU lib) and build an animated cosine-gradient shader that cycles through
predefined palettes, as a decorative panel beside the login form on `/login`.
Constraints: must be code-split so only /login pays (mirror the editor
island's lazy `import()` in `src/islands/entry.tsx`), WebGPU feature-detect
with graceful fallback (CSS/canvas-2d animation or hide panel), respect
prefers-reduced-motion, honest bundle-size verdict (site is aggressively
minimal — if TypeGPU costs 30KB+ gz for a fullscreen-quad shader, raw WebGPU
may be the better ship, but John explicitly asked for TypeGPU so deliver that
variant too). Palette math: `packages/data-ops/src/gradient-gen/cosine.ts`
(`color(t) = a + b*cos(2π(c*t+d))`), seeds decode via
`@repo/data-ops/serialization` `deserializeCoeffs`.

## Roadmap after that (acknowledged, unscheduled)

og/png endpoint port (KV `OG_IMAGE_CACHE`), tags autocomplete, sitemap,
Cache-Tag purge, custom-domain cutover, real contact email (Resend POST route —
currently mailto fallback), like-toggle rate limiting.
