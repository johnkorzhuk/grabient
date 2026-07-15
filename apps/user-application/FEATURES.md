# Grabient — Feature Map (user-application)

High-level context file for `apps/user-application` — the TanStack Start app serving grabient.com.
Grabient is **free**. Payments/Pro (Polar) code exists behind a disabled flag and is out of scope here.

Stack: TanStack Start (file-based routing) + React 19 (React Compiler) + TanStack Query on **Cloudflare Workers**, with D1 (Drizzle ORM), R2, KV, Vectorize, Workers AI, and a Durable Object rate limiter. Shared logic lives in `@repo/data-ops` (`packages/data-ops`): drizzle schema, Better Auth setup, cosine gradient math, seed serialization, valibot schemas.

---

## 1. Core concept: the Gradient Hex — URL-encoded cosine palettes

A palette is a **cosine gradient**: `color(t) = a + b * cos(2π * (c*t + d))` per RGB channel
(`packages/data-ops/src/gradient-gen/cosine.ts`).

The palette lives entirely in the URL — the `$seed` path param is its **Gradient Hex**:
like a hex color code scaled up to a whole gradient, every value owns fixed character
positions (`serializeCoeffs` / `deserializeCoeffs`, `packages/data-ops/src/serialization.ts`):

- `_` + twelve 3-char base64url groups (18-bit fixed point, 3-decimal precision), row order `a` (base) → `b` (amplitude) → `c` (frequency) → `d` (phase), each row R,G,B — 37 chars total.
- Non-default globals `[exposure, contrast, frequency, phase]` (defaults `[0, 1, 1, 0]`) append four 2-char groups (12-bit) — 45 chars.
- **Positionally editable**: changing one char group changes exactly one coefficient, so URLs are hackable by hand. `public/llms.txt` documents the color model and encoding so LLMs can construct valid palette URLs from scratch (validated byte-exact against the encoder, including by cold-start agents given only the doc).
- Coefficients **clamp** to `COEFF_MIN`/`COEFF_MAX` = ±131.072/131.071 in the valibot schemas (`valibot-schema/coeffs.ts`) — the encodable range is a hard invariant (`serializeCoeffs` throws otherwise); repeated tare/tether saturates instead of overflowing.
- `isValidSeed` gates routing (bad seed → redirect `/`) and distinguishes seed vs. text in search URLs; `$seed.route.tsx` 301s any non-canonical seed to its canonical Gradient Hex.
- Legacy compat: 2024-era lz-string seeds still decode (including the old `-π..π` phase rescale) and 301 to their Gradient Hex. The short-lived v2 bit-packed format (July 2026, also `_`-prefixed) is intentionally not decoded — those URLs bounce home.

Rendering options are **search params** (valibot-validated, `packages/data-ops/src/valibot-schema/grabient.ts`), with defaults stripped from the URL (`stripSearchParams`):

| Param | Values | Default |
|---|---|---|
| `style` | `linearGradient` \| `angularGradient` \| `linearSwatches` \| `angularSwatches` \| `radialGradient` \| `radialSwatches` \| `auroraMesh` | `linearGradient` |
| `angle` | 0–360 | 90 |
| `steps` | 2–50 | 7 |
| `size` | [w, h] 40–6000 | [800, 400] |
| `mod` | which modifier panel is open | `auto` |
| `sort` | `popular` \| `newest` \| `oldest` (search route) | `popular` |
| `page` / `limit` | pagination, limit 12–96 | 1 / 24 |

`"auto"` is a sentinel meaning "unset — use default".

## 2. Gradient editor — `/$seed` (`src/routes/$seed.route.tsx`)

The main product page: header, navigation controls (style/angle/steps), full-bleed gradient preview, sidebar.

- **URL is the source of truth.** Slider drags are held in local React state (mirrored to `stores/ui.ts` for live preview) and re-serialized to a new `/$seed` via a 300ms-debounced `navigate`.
- **Global modifier sliders** (applied by `applyGlobals` in `cosine.ts`):
  - `exposure` [-1, 1] — added to offset `a` (brighten/darken)
  - `contrast` [0, 2] — multiplies amplitude `b`
  - `frequency` [0, 2] — multiplies frequency `c`
  - `phase` [-1, 1] — added to phase `d`
- Selecting a specific modifier (`mod` search param) reveals **per-channel R/G/B sliders** [-π, π] for it; a **tare** button redistributes a global back into raw coefficients (`tareModifier`).
- **Channels chart**: optional Recharts visualization of R/G/B curves (`gradient-channels-chart.tsx`).
- Clipping-edit mode via `clipping` search param.
- Deterministic output → aggressive browser + CDN cache headers; per-seed OG image via `/api/og`.
- Style/angle/steps changes carry over when navigating back to list routes (`onLeave` + ui store).

Key components: `gradient-modifier-controls.tsx`, `modifier-slider.tsx`, `rgb-channel-sliders.tsx`, `gradient-preview.tsx`, `gradient-sidebar.tsx`, `gradient-navigation-controls.tsx`.

## 3. Browsing — `_paletteList` layout routes

`/` (popular), `/newest`, `/oldest`, `/saved` — all render `AppLayout` + `VirtualizedPalettesGrid` (+ pagination):

- Popular = distinct-user like count desc; newest/oldest = `palettes.created_at`.
- Server fn `getPalettesPaginated` (`src/server-functions/palettes.ts`) joins `palettes` ↔ `likes`.
- Virtualized grid (`@tanstack/react-virtual`), responsive 1–6 columns; each `PaletteCard` shows preview, relative time, edit/copy/export, and the like button.
- `/saved` is auth-gated (`redirect` to `/login?redirect=/saved`), shows the user's liked palettes with an **Undo** button (10s window, `stores/undo.ts`) for accidental unlikes.

## 4. Likes / saves (D1 persistence)

The only regular-user write path. Palettes exist as seed strings until someone likes one.

- **Schema** (`packages/data-ops/src/drizzle/app-schema.ts`):
  - `palettes` — PK `id` **is the seed string**, plus `style`, `steps`, `angle`, `created_at`.
  - `likes` — composite PK `(user_id, palette_id)`, denormalized `steps/style/angle`, `created_at`.
- **Lazy palette creation** (`toggleLikePalette`, `packages/data-ops/src/queries/palettes.ts`):
  1. Like exists → delete it (unlike). Palette row stays.
  2. No like → insert `palettes` row `.onConflictDoNothing()` (first like materializes the palette), then insert the `likes` row.
  3. **Uniform (single-color) palettes** are liked but never written to `palettes` — kept out of public listings; the like renders from its denormalized columns.
- Server fn `toggleLikePalette` is auth-protected + rate-limited (`toggleLike`, 20/min via Durable Object).
- **Client** (`src/mutations/palettes.ts` `useLikePaletteMutation`): logged-out click redirects to `/login?redirect=<path>`; otherwise full optimistic updates across the `user-liked-seeds` Set, per-seed like info, and every cached palette list (popular/newest/oldest/search/saved), with snapshot rollback on error. Like state is read reactively from the query cache via `useSyncExternalStore` (`save-button.tsx`).

## 5. Search — `/palettes/$query`

`$query` is either a **seed** (detected by `isValidSeed`) or a **text query** (spaces as hyphens, e.g. `/palettes/fern`).

- Server fn `searchPalettes` (`src/server-functions/search.ts`): normalizes query (hex → color names), embeds with Workers AI `@cf/google/embeddinggemma-300m`, queries the **Vectorize** index (`grabient-palettes`). Results KV-cached 3 days (`SEARCH_CACHE`); like-counts always re-fetched fresh from D1. Rate-limited (40/min).
- Query validation (`src/lib/validators/search.ts`): gibberish detection, 100-char max, seed → color-name transform, samples ≤8 hex codes from long inputs.
- Client-side `sort` (popular/newest/oldest) on results.
- **Fuzzy autocomplete** (`src/lib/fuzzy-search.ts`, fuzzysort): style tags, emoji tags, named colors; hex input resolves to the closest named color.
- **Tags** (`src/lib/tags.ts`): ~50 emoji tags + style/mood tags; `getPopularTagsFn` serves 24 rotating daily tags.
- **Search feedback**: thumbs-up/down per result, stored in localStorage (`stores/search-feedback.ts`) + PostHog event.

## 6. AI generation — `/palettes/$query/generate` (feature-flagged OFF)

Exists in code behind `VITE_ENABLE_PRO` (default false — route redirects, server middleware 503s). Not part of the current free product; summarized for context only:

- Two-stage Composer → Painter pipeline (`src/server-functions/generate-v6.ts`): vector-search examples → one composer model streams 6 variations → 5 painter models in parallel produce ~30 palettes; hex output is fit to a cosine gradient (`fitCosinePalette`) and serialized to seeds. Streamed via SSE.
- Sessions persist to the `refine_sessions` D1 table (versioned seeds + good/bad feedback); anonymous sessions supported.

## 7. Auth — Better Auth

Configured in `packages/data-ops/src/auth/setup.ts`, served by the catch-all `/api/auth/$` route.

- **Providers**: Google OAuth + **magic link** (Resend email). Email/password disabled. No anonymous plugin.
- Tables: `auth_user` (custom fields: `username`, `role`), `auth_session`, `auth_account`, `auth_verification` (D1, same Drizzle db).
- Client (`src/lib/auth-client.ts`): `useSession`, `signIn`, `signOut`; session cached under `["session"]` (5 min stale).
- Middleware (`src/core/middleware/auth.ts`): `protectedFunctionMiddleware` (401), `optionalAuthFunctionMiddleware`, `adminFunctionMiddleware` (role check; bypassed in dev).
- `/login`: magic link (30s resend throttle) + Google, honors `?redirect=`.
- **Settings** (`/settings`): username (availability check, rate-limited), avatar upload, consent management, account deletion (email-token confirmed via Better Auth `deleteUser`).
- **Avatar upload**: client compresses to WebP ≤256px (`browser-image-compression`) → presigned **R2** upload (`src/lib/r2.ts`, aws4fetch) → server confirms with magic-byte + 5MB validation, updates `auth_user.image`, deletes old file.

## 8. Export

Users multi-select palettes into an export list (shift-click range select) and export:

- **Formats**: SVG (single + grid), PNG (single + grid, cached generation), copyable **Data JSON** (includes shareable seed URLs). CSS variables helper: `src/lib/getCSSvars.ts`.
- **Store** (`src/stores/export.ts`): localStorage-persisted, max 50 items; options: container dimensions (≤6000), gap, border radius, columns (1–10).
- **Device presets** (`src/data/device-presets.ts`): mobile / tablet / desktop / social (X, Instagram, TikTok, YouTube, …) / presentation resolutions to set export dimensions.
- Export list is client-only (localStorage) — never persisted server-side.

## 9. Supporting features

- **OG images** (`src/routes/api/og.ts`): `/api/og?seed=…` renders a 1200×630 PNG per palette — SVG composed from the cosine gradient (custom angular-gradient path math), rasterized with `@cf-wasm/resvg`, KV-cached 7 days (`OG_IMAGE_CACHE`), light/dark theme picked by brightness. `/api/og/query` variant for search pages.
- **Contact form** (`/contact`): Turnstile-verified, sends via Resend to john@grabient.com, rate-limited 5/10min.
- **Rate limiting**: `RateLimiter` Durable Object (`src/core/middleware/rate-limit.ts`); buckets: contactForm 5/10min, avatarUpload 10/hr, toggleLike 20/min, accountMutation 30/hr, paletteSearch 40/min. Keyed by `user:{id}` or `ip:{CF-Connecting-IP}`. Skipped in dev.
- **Analytics & consent**: PostHog (lazy, disabled in dev, first-party proxied through `/e/$` to dodge ad blockers), typed event API (`src/integrations/tracking/events.ts`), Cloudflare Zaraz consent with **GDPR-aware defaults** (EU/EEA/UK detected from `request.cf` → opt-out by default; elsewhere opt-in, session replay always off). Sentry loaded lazily, consent-gated.
- **Theme**: system/light/dark, localStorage, no-FOUC inline script (`src/components/theme/`).
- **GitHub stars** badge: fetched server-side, edge-cached 4h.
- **SEO**: `src/utils/seo.ts` meta builder; per-route OG tags.
- **llms.txt** (`public/llms.txt`): machine-readable site guide plus the full Gradient Hex spec — color model, per-value encoding algorithm with worked examples, design recipes, and verification URLs — so LLM agents can design palettes and emit working grabient.com links without touching the codebase.

## 10. Infrastructure bindings (wrangler.jsonc)

| Binding | Service | Use |
|---|---|---|
| `DB` | D1 (`grabient` / `grabient-prod`) | palettes, likes, auth, refine_sessions |
| `UPLOADS` | R2 | avatars |
| `VECTORIZE` | Vectorize (`grabient-palettes`) | semantic palette search |
| `AI` | Workers AI | query embeddings |
| `SEARCH_CACHE` / `OG_IMAGE_CACHE` | KV | search results (3d) / OG PNGs (7d) |
| `RATE_LIMITER` | Durable Object | per-user/IP rate limits |

Migrations live in `packages/data-ops/src/drizzle`; `initDatabase(env.DB)` runs per-request in `src/server.ts`.
