# Web-lite handoff — 2026-07-22

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
  (currently 161/161 green).
- **Visual verification** (required before claiming UI work done): headless
  chrome at `~/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`
  with `LD_LIBRARY_PATH=/tmp/chrome-libs/root/usr/lib/x86_64-linux-gnu` (libs
  extracted from `apt-get download libnspr4 libnss3 libasound2t64` +
  `dpkg-deb -x` — no sudo; /tmp is wiped between sessions sometimes, just
  re-download). Scripts: `/tmp/shot.mjs URL OUT W H` (playwright-core
  npm-installed in /tmp), `/tmp/shot-signedin.mjs` (mocks
  `/api/auth/get-session` via page.route to render signed-in client UI — no
  D1 writes needed). Older richer scripts (auth-flows.mjs, forged-cookie E2E)
  were in the session scratchpad
  `/tmp/claude-1000/-home-korz-projects-grabient33-grabient/6f805542-3a5d-4099-a5f4-785b1e8067bd/scratchpad/`
  — now deleted; recreate from the memory file's notes if needed.
- **Seed-page URLs 301 unknown query params** — cache-bust seed pages by
  following redirects (`curl -sL`), not by adding `?cb=`.

## Current deployed state (version 38716531)

Export UI revision — the export feature now mirrors the original site's
layout and reuses the $seed route's components (161/161 tests, typecheck
clean, headless-verified on dev; prod verified right after deploy):

- **Y-stable h1 row**: ONE persistent row (`#list-h1` + `#export-slot`,
  `mb-8 flex items-center justify-between`) — the h1 text swaps "Popular
  gradients" ↔ "N items selected" and the slot holds Export (closed) / Close
  (open) at the SAME position. The h1's line-height exceeds the buttons', so
  the row never resizes and the palette list never moves on the y axis when
  export is toggled (verified numerically: h1 y and first-card y identical
  in both states, desktop + mobile). `#export-bar` is GONE — entry.tsx now
  boots the module off `#export-slot`.
- **Size = the $seed dims component** (edit.tsx ported to vanilla DOM in
  islands/export.ts): monitor icon button (BTN_ICON_SM, brightened
  `border-muted-foreground/30 text-foreground` when W×H set) → body-anchored
  popover (`#export-dims-panel`) with the exact seed markup (floating
  width/height labels, h-7 font-mono inputs, × separator, "auto" + the same
  8 SIZE_PRESETS, same-preset pick → auto). Same keyboard model: arrows ±1
  (Shift ×10) commit LIVE, Enter commits + blurs, Escape reverts +
  stopPropagation; clamp 40..6000 (MIN_DIM/MAX_DIM from src/search.ts).
  positionFixedPanel port; outside pointerdown closes without refocus;
  scroll/resize reposition; the export view's Esc-close guard now excludes
  `#export-dims-panel`. The old 30-item grouped presets menu (`PRESET_GROUPS`)
  and the inline W×H panel inputs are deleted; `auto` still means "measured
  from the first export card" (fallback 800×400).
- **Copy/Download moved inside the preview**: hover-revealed icon buttons
  top-right in a `group relative` wrapper around `#export-preview` (the
  #preview-actions reveal pattern: `group-hover:flex group-focus-within:flex
  pointer-coarse:flex`). Menus stay on window.__menu (Data/SVG/PNG;
  SVG/PNG). Copy feedback is the seed's icon→check swap for 1.2s
  (flashCheck; original svg stashed in `data-icon`). app.css's letterbox
  rule is now `#export-preview > svg` (direct child) so it can't stretch the
  button icons.

## Previous deployed state (version 9f5b3c7c)

Multi-palette **export feature** ported from the original site (157/157 tests,
typecheck clean, headless-verified on dev + prod). Select cards with the
hover-revealed +/− toggle (always visible on touch), "N selected · Export" bar
above the grid, full export view (?export=true) with sticky options panel
(W×H auto = measured card size, Gap, Border %, Columns, grouped size-presets
menu, live SVG preview), Copy Data/SVG/PNG + Download SVG/PNG.

- **Storage compat is deliberate**: `export-list` keeps the original's v1 shape
  EXACTLY (id = fnv1a over `JSON.stringify({seed, coeffs, style, steps,
  angle})` — field order matters, pinned by a reimplementation test in
  `test/export.test.js`), so selections survive the custom-domain cutover in
  either direction. `export-options` is v2 (width/height nullable — null =
  auto/measured) with a v1 read-migration of the original's
  `containerDimensions`.
- **`src/islands/export.ts`** (~950 lines) is the whole feature: delegated
  click/change/keydown wiring, generated `#export-style` sheet keyed on
  `[data-export-id]` for the selected state (survives body swaps + island
  re-renders — the liked-hearts trick), URL state (`?export=true` pushed on
  open; Close/Esc unwinds via history.back when we pushed, replaceState on
  reload-mounted views; `window.__popstateHandler` consumes pure flag flips),
  SVG grid (near-verbatim port of the original's generateSVGGrid.ts incl. the
  Figma-compatible angular foreignObject), and a NATIVE-CANVAS PNG renderer
  (replaces the original's SVG→Image round-trip — deterministic, sync; CSS
  linear/conic/radial math, hard double-stop bands for swatches).
- **Shared markup**: `src/buttons.ts` now owns the button recipes (BTN/CTRL/
  etc. moved out of pages.ts) + `likeButton()` + `exportToggle()` so SSR cards,
  island cards (grid.tsx JSX mirrors), and export-view cards are byte-identical
  — keep all three in sync. `src/esc.ts` was extracted from html.ts because
  html.ts imports build artifacts (worker-only) and buttons.ts ships in the
  client bundle.
- **Menu system**: `window.__menu = { showMenu, menuTrigger, closeMenu }` in
  app.client.js for island-rendered triggers; `showMenu` learned non-
  interactive `{header: true}` category rows (`.menu-header`) for the preset
  groups. Islands announce via `document` CustomEvent `app:announce`.
- **`src/islands/params.ts` updateKey** preserves `?export=true` across
  option/page writes while the view is open (keyToSearch only knows view
  params).

## Previous deployed state (version f46866f9)

Settings feature-parity + the like-identity fix + like-count unification. All
tested (130/130) and deployed; signed-in staging screenshots need a real login
because the deployed `BETTER_AUTH_SECRET` differs from `.dev.vars` (locally
minted cookies get 401).

New since f69e4c55 (deploys 4bb2dcc9 + 44c48e8d + e65673f4 + f46866f9):

- **Like COUNTS unified across aliases (follow-up to like identity).** Counts
  were still per-row: `/api/like-info` canonicalized the seed then counted
  exact `palette_id` matches, and likes almost all live under legacy row ids
  (v3 shipped 2026-07-15), so seed pages showed ~0 and seed-page likes were
  invisible to list cards. Now every count surface uses the cross-alias
  distinct-user total: data-ops `aggregateLikesByKey` (likes table ~1.2k rows
  → JS `Map<key, Set<userId>>`), write-fresh `getLikesKeyTotals`,
  key-based `getPaletteLikeInfo`, `toggleLikePaletteByKey` returning the
  durable key total, and all six list/saved queries
  (`getPopularPalettes[Paginated]`, `getPalettesPaginatedByDate`,
  `getPopularPalettesPage`, `getPalettesPageByDate`, `getUserLikesWithCounts`)
  pass through `withKeyCounts`. Popular ORDER BY still ranks by the row-level
  SQL count — aliases stay separate cards, only the number unifies. Verified
  live: legacy id, canonical id, and the popular card all return 40 for the
  same palette. Regression suite in `test/coeff-key.test.js`.
  Public list HTML and `/api/palettes` are no-store because they contain live
  like totals, so the first paint is authoritative. Cards also reconcile
  through `/api/like-counts` as a mutation-race safety net; totals must never
  use per-isolate memoization because a write and the following refresh can
  land on different Worker isolates.

- **Like identity across seed aliases (the "41→42, still 42 after refresh" bug).**
  One palette = many stored seed strings (legacy ids embed view params, v3 ids
  embed non-default globals). `paletteCoeffKey(seed)` in `src/palette.ts`
  (serialize coeffs under DEFAULT_GLOBALS) is the alias-invariant identity.
  Hearts carry `data-like-seed` = coeffKey (fill/labels/liked set) and
  `data-like-row` = the stored palettes-row id (INSERT key, keeps counts
  joining). `toggleLikePaletteByKey` matches the user's likes by coeffKey —
  unlike deletes ALL aliases — and returns the authoritative `likesCount` the
  client renders instead of an optimistic bump. Regression fixture in
  `test/coeff-key.test.js` (5 real aliases → one canonical).
- **/saved removal**: unliking removes the card (10s undo toast + ⌘Z; Undo
  re-likes and reinserts at the original position; emptying the grid swaps in
  the SSR empty-state). `test/likes-flow.test.js`.
- **SSR auth placeholder circle** on cached pages (`<a data-auth-signin
  data-auth-placeholder>`, same h-8 w-8 as the avatar) — no more "Sign in"
  button flash; the client swaps it once the session resolves.
- **Avatar upload** (the original's S3-presign flow simplified): client
  canvas-crops to 256×256 webp q0.9, single `POST /api/settings/avatar`; R2
  binding `UPLOADS` + `R2_PUBLIC_URL` var, same buckets (`grabient-uploads-dev`
  staging / `grabient-uploads` prod) and key scheme `avatars/{userId}/{ts}.webp`
  as the live site; magic-byte + 5MB validation, best-effort old-avatar delete
  (`src/avatar.ts`), data-ops `updateUserImage`. Change-avatar button, staged
  preview with Cancel, and Save changes uploads before the username save.
  **Config pairing that matters:** each bucket's r2.dev pub URL fronts ONLY
  that bucket — `pub-a081a47d…` = `grabient-uploads-dev` (staging),
  `pub-f6df953a…` = `grabient-uploads` (prod). An earlier deploy paired the
  dev bucket with the prod pub domain and uploaded avatars 404'd (fixed
  2026-07-22, deploy 205c80a3). The original repo's staging value was correct
  all along. Local dev: the UPLOADS binding has `"remote": true` so
  `wrangler dev` writes to the REAL dev bucket and local uploads resolve at
  the pub URL (mirrors the original's presign flow); D1 intentionally stays
  local under dev.
- **Privacy & Consent card** (port of `stores/consent-store.ts`): localStorage
  `consent-preferences` v3, GDPR geo via `cf.country`/`cf.isEUCountry`
  (`src/geo.ts`) baked into the settings SSR as `#privacy[data-gdpr]`; other
  pages lazy-fetch `/api/geo` only when nothing is stored. Zaraz purpose IDs
  (`HdWd`/`mxdH`/`daJQ`) sync on APIReady — no-op on workers.dev. Switches are
  SSR'd `data-state`/`aria-checked` on button + thumb. Tests caught a real bug:
  the `hasInteracted` early-return used to skip toggle wiring, leaving dead
  switches for returning users — wiring now runs on every boot path.

## Previous deployed state (version f69e4c55)

Auth UX fully ported from apps/user-application and verified (curl + unit +
headless screenshots). **The "signed in but UI shows nothing" bug was edge-cache
poisoning, not client code**: Workers Cache heuristically caches header-less 200s
(~2h), and better-auth's `/api/auth/get-session` sends no cache headers — an
anonymous `null` was edge-cached and served to everyone (client-side avatar/hearts
dead while SSR /saved worked; each deploy busted it, then the first anonymous
visitor re-poisoned it). Fix: the `/api/auth/*` route wraps EVERY better-auth
response in `private, no-store` + `CDN-Cache-Control: no-store` (a cached
signed-in payload would have leaked session data to strangers — also a security
fix). Rule of thumb: no worker response may go out without explicit cache headers.

New since d9e45f66:

- `GET /settings` (NO redirect when signed out — Profile card renders under a
  "Sign up to manage your profile" overlay, matching the original; signed-in gets
  Profile with debounced username availability (POST `/api/settings/username/check`,
  unauthenticated `{available}`) and update (POST `/api/settings/username`:
  valibot `updateUsernameSchema` 400, 409 taken, data-ops
  `queries/account.ts` `isUsernameAvailable`/`updateUsername` — case-insensitive,
  excludes self), Account card (created date, email verification, sign out),
  Danger Zone (2-step email-token delete: better-auth `deleteUser` sends the
  Resend email — template mirrors the original, links `/settings?token=…`; the
  client POSTs the token to `/api/settings/delete-account` →
  `initAuth().api.deleteUser`). All NO_STORE.
- Avatar dropdown gained a **Settings** item; heart buttons carry
  `data-tip` Save/Unsave palette + synced aria-labels (MutationObserver covers
  island-added hearts); undo-unsave toast on /saved ("Palette removed · Undo",
  10s, ⌘Z — card stays in place, Undo re-likes).
- `fetchSession` hardened: `cache: "no-store"`, and a failed fetch no longer
  latches (sessionPromise resets on catch).
- Omissions at the time, all since shipped in 44c48e8d: R2 avatar upload,
  Zaraz ConsentSection. Still open: like-toggle rate limiting (DO 20/min —
  before cutover).

## Previous deployed state (version d9e45f66)

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
DEPLOYED with 9f5b3c7c (the export deploy picked it up); visual check pending.
John picked seed
`_gKdgHPgKkgGhgFxgD_gJkgL8gLOgXRgEsgNK` (linearGradient, steps=8, angle=45):
- `src/palette.ts` (bottom): `DEFAULT_PALETTE`, `DEFAULT_FAVICON` (data-URI via
  `faviconDataUri`), `DEFAULT_LOGO_COLORS` (hexColors sampled start/mid/end).
- `src/html.ts`: `meta.favicon ?? DEFAULT_FAVICON ?? FAVICON`.
- `src/icons.ts`: `LOGO()` default stops = `DEFAULT_LOGO_COLORS` (old
  `BRAND_STOPS` kept as fallback only).
- `src/logo-animation.ts` is the shared list/export animation generator.
  Popular/newest/oldest/saved SSR their own palette sequence; the list island
  updates it for live parameter changes, and open export mode overlays it with
  the selected export palettes until the view closes.

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
