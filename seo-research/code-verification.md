# Code verification of the SEO passoff + agent-facing algorithm spec

Verified 2026-08-16 against the working tree at `master` (8c9ef41). Everything below is
MEASURED (read from source) unless tagged otherwise. Line numbers are from the current files.

---

## Part 1 — Verdicts on the 10 blocking/high findings

**1. "96% of sitemap = near-duplicate hex-titled dead ends, one byte-identical description" — CONFIRMED (one wording nuance).**
Sitemap = 4 static + 29 query + up to 1000 seed URLs (`seo.ts:100-116`, `index.ts:1033` `getPopularPaletteIds(1000)`); live count 899 → 866/899 = 96%. Seed title is hex-built: `` `${titleColors.join(" → ")} Gradient Palette | Grabient` `` (`pages.ts:726`). Description is a shared constant — `"Copy as CSS, SVG, or PNG, or customize the colors, angle, and steps in Grabient's gradient editor."` (`pages.ts:733-734`) — byte-identical for every seed. Nuance: "zero outbound links" is literally false (logo `/`, back `/`, 6 footer links) but true for the palette graph: no seed page links any other palette (`pages.ts:645-719`).

**2. "noindex guard is dead code; topK=48 always returns 48" — CONFIRMED.**
`pageRobots: total ? undefined : "noindex,follow"` (`index.ts:472`); `total = ranked.length` (`index.ts:393`). Results come from `VECTORIZE.query(vector, { topK: limit })` with `limit = SEMANTIC_SEARCH_LIMIT = 48` (`semantic-search.ts:22,183-186`) — kNN returns the 48 nearest vectors for *any* embeddable string; no score threshold exists anywhere. The guard can only fire on binding absence, empty normalized query, or embedding failure. Correction to the passoff's citation: the topK evidence is `semantic-search.ts:22` + `183-186`, not `:58-67` (that's `queryFromParam`). And "match.score parsed, unused" is NUANCED: score IS parsed into every result (`semantic-search.ts:54,191`) and used as a popular-sort tiebreaker (`index.ts:390` `b.likesCount - a.likesCount || b.score - a.score`) — but never as a relevance gate. Filtering `results` on a score floor in `handleSemanticSearch` (before `index.ts:393`) would make the guard live and also fix the empty-state.

**3. "/{seed} decodes procedurally, no existence check" — CONFIRMED.**
`app.get("/:seed")` calls only `canonicalSeed(seed)` (`index.ts:1128-1135`), which is try/catch around `deserializeCoeffs`→`serializeCoeffs` (`palette.ts:26-33`). No D1 lookup, no seed-list membership test, anywhere. Any of the three decodable encodings (aligned `_…`, decimal CSV, legacy lz-string — `serialization.ts:213-218`) mints a 200 page; non-canonical encodings 301 to the aligned form (`index.ts:1133-1135`), which is then self-canonical (`pages.ts:727`) with no robots meta. The whole ±131.071³⁶-ish encoding space is indexable by construction.

**4. "Staging duplicates the site, self-canonical" — CONFIRMED, plus an unflagged extra.**
`env.staging.workers_dev: true` (`wrangler.jsonc:66`) with `PUBLIC_ORIGIN: "https://grabient-lite.jkorzhuk.workers.dev"` (`wrangler.jsonc:127`) — canonicals, robots.txt sitemap pointer, and sitemap URLs all self-reference staging (`index.ts:109-111`, `seo.ts:61,95-124`). No `X-Robots-Tag` exists anywhere in `apps/web/src` (grep). **Additionally: production also has `workers_dev: true` (`wrangler.jsonc:144`)** — `grabient-production.jkorzhuk.workers.dev` serves the full site too; its canonicals point at grabient.com (PUBLIC_ORIGIN), which mitigates but doesn't block indexing. Caveat for the fix: staging's URL is the smoke-test surface (CLAUDE.md mandates staging-first deploys), so a host-based noindex header beats `workers_dev:false`.

**5. "Title/H1 intent mismatch on ranking pages" — CONFIRMED.**
`pageTitle: `Grabient — ${heading}`` (`index.ts:467`) where `queryHeading` returns `"{Query} palettes"` (`semantic-search.ts:90-103`). H1 renders the same heading (`pages.ts:538` via `headingParts`). The word "gradient" appears in neither, on the exact `/palettes/{color}` pages GSC shows earning impressions. Description (`index.ts:468`) does contain "CSS gradient". `queryHeading` fan-out if changed: h1, title, description, og:image alt, ItemList name — all on query pages only; the embedding text (`normalizeSemanticQuery`) is a separate function and unaffected.

**6. "182 terms in code; 29 in sitemap; rotation shows 13 themes/crawl" — CONFIRMED (exact numbers).**
Computed from `popular-searches.ts`: `POPULAR_SEARCHES` = 29 (sitemap + fallback; `:17-47`), `CURATED_THEMES` = 170 (`:93-264`), `FEATURED_QUERIES` = 6 (all already in sitemap), `EMOJI_QUERIES` = 40. Distinct text queries = 177; +40 emoji = 217. **148 of 170 themes never reach the sitemap** and appear only via the hourly rotation: each UTC hour renders 24 chips = 6 fixed featured + 13 themes + 2 emoji + 3 generated color combos (`curatedSuggestions`, `:376-424`). Chips are real `<a href="/palettes/{slug}">` links (`pages.ts:463-466`), list HTML edge-caches 300s (`index.ts:98-101`), so one crawl sees 13 of 170 themes. Dual-use trap, corrected: `POPULAR_SEARCHES`'s UI role is only the *default argument* at `pages.ts:443` — every production caller passes provider suggestions (`pages.ts:536,549`; `index.ts:325-329,445-447,830-834`), so **appending to POPULAR_SEARCHES changes the sitemap only, not the visible chips**. The passoff's warning overstates this.

**7. "tags[] parsed then discarded" — CONFIRMED.**
`tags: v.array(v.string())` is parsed on every search result (`semantic-search.ts:29,48`) from Vectorize metadata and never read again: `handleSemanticSearch` builds cards from seed/style/steps/angle/likes only (`index.ts:398-426`). What tags contain: the vocabulary in `packages/data-ops/src/gradient-gen/palette-tags.ts` — 1-3 `dominantColors` from a 40-name list, plus `texture` (7 values), `warmth` (3), `journey` (3), `contrast` (4); written into Vectorize by the (gitignored) data-collection pipeline (INFERRED — no writer in-repo; the derivation module is in-repo). Key implementation fact: tags are *deterministic functions of the coefficients* — `analyzeCoefficients(coeffs)` + `tagsToArray(tags)` (`palette-tags.ts:284,312`) run anywhere, so seed pages can render tags (and link them to `/palettes/{tag}`) with zero Vectorize/D1 dependency.

**8. "/newest, /oldest, /saved orphaned; sort nav is a <select>" — CONFIRMED (with sitemap nuance).**
`sortNav` renders `<select id="nav-select"><option value="/newest">…` (`pages.ts:200-208`); navigation happens in client JS (`app.client.js:391`). No `<a>` to `/newest` or `/oldest` exists on any page; both ARE in the sitemap (`seo.ts:102-103`), so "orphaned" = link-graph-orphaned, not undiscoverable. Their pagination self-links once entered (`pages.ts:279-300`, real `<a>`s). `/saved` is 302-to-login + `noindex,nofollow` + no-store (`index.ts:817-822`, `pages.ts:561`) — orphaned by design. Palette cards ARE crawlable `<a>`s (`buttons.ts:101`), so depth comes from pagination chains, not missing card links.

**9. "Zero <img> tags" — CONFIRMED for every indexable page.**
Grep of all SSR sources: `<img>` exists only in the per-user avatar header (`pages.ts:105` — rendered only on `/saved`/`/settings`, both noindex/no-store), settings avatar (`pages.ts:951`, noindex), and the Google button on `/login` (`pages.ts:820`, noindex). List cards are `<div role="img" style="background:…">` (`pages.ts:261`); the seed hero is a styled `<section>` (`pages.ts:688`). The PNG endpoints (`/{seed}.png` etc.) are never referenced by an on-page `<img>` — only by `og:image` meta (`html.ts:107`). Google Images has literally nothing to index.

**10. "Query pages ~0.9% text ratio, zero <p>, keyword once" — CONFIRMED by structure (ratio itself REPORTED, report 5).**
The query template contains no prose block: h1 (`pages.ts:538`), chip labels, relative ages, pagination digits, footer. `<p>` appears only for empty results or seed/hex context (`pages.ts:485,496,523`). The keyword's only visible occurrence is the h1. JSON-LD is present and half-wrong: `ItemList` sets `numberOfItems: total` (always 48) while `itemListElement` holds only the current page's ≤24 items, and each `url` is the parameterized card href (`/{seed}?style=…&steps=…&angle=…`) rather than the seed page's canonical bare URL (`index.ts:473-483`). Every page also carries sane `WebSite` (+SearchAction pointing at `/palettes/{search_term_string}`) and `WebApplication` JSON-LD (`html.ts:54-91`).

**Other checked claims:** sitemap silent-degradation CONFIRMED — D1 failure is caught, logged, and serves a valid 200 with 33 URLs, edge-cached 24h (`index.ts:1031-1041`: `catch` → `seeds=[]`; `CDN-Cache-Control: max-age=86400, swr=86400`). No `<lastmod>` anywhere (`seo.ts:117-123`). `getPopularPaletteIds` is used *only* by the sitemap route, so extending it is blast-radius-free. http→https cached-200: the Worker's fix (`index.ts:126-135`) only no-stores the redirect; a cached HTTPS 200 shared under the same edge key still short-circuits the worker for http requests (mechanism documented in the code comment `index.ts:130-132`; live behavior REPORTED by the audit) — the real fix is zone-level "Always Use HTTPS", not code. `/palettes/{seed}` duplicate claim NUANCED: it is not a copy of `/{seed}` — it renders a *search-results* page for the seed's color names, self-canonical at `/palettes/{encoded-seed}` (`index.ts:355-358,430`; `querySlug` `semantic-search.ts:70-74`); nothing crawlable links these en masse (they arise from pasting seeds into search), so it's an unbounded near-duplicate *family of query pages*, not a canonical conflict with the editor page. Rendered-DOM risk CONFIRMED as real: `entry.tsx:58` removes `#grid-ssr` after mounting the virtualized island — what Googlebot's renderer sees depends on the island, untested.

---

## Part 2 — The palette algorithm, for an agent-facing spec

**Formula** (`packages/data-ops/src/gradient-gen/cosine.ts:16-55`, Inigo Quilez convention): for each RGB channel independently,
`channel(t) = clamp01( a + b * cos(2π(c·t + d)) )`, sampled at `t = i/(steps-1)` for `i = 0…steps-1` (both endpoints; `t=0` when steps=1), then `rgbToHex`. Coefficients are 4 vectors of `[R,G,B]`: `a` offset (base color), `b` amplitude, `c` frequency, `d` phase.

**Global modifiers** (`apply-globals.ts:12-43`, applied to coefficients *before* sampling): `exposure` adds to `a` (range **[-1,1]**), `contrast` multiplies `b` (**[0,2]**), `frequency` multiplies `c` (**[0,2]**), `phase` adds to `d` (**[-1,1]**, with 0.001 tolerance — `coeffs.ts:75-80`). Defaults `[0,1,1,0]` (`coeffs.ts:90`). These are the four editor sliders (`pages.ts:599-604` `MODIFIER_META`, same names/ranges; the only "exposure" in the UI). Palettes with tared vs. explicit globals that render identically share one identity via `paletteCoeffKey` (`serialization.ts:122-129`).

**Coefficient bounds** (`coeffs.ts:8-19`): 3-decimal fixed point; **clamped** (not rejected) to `COEFF_MIN = -131.072`, `COEFF_MAX = +131.071`.

**Seed format v3** (`serialization.ts:9-58`): `'_'` + base64url chars (`A-Za-z0-9-_`), char-aligned — 12 coefficients × 3 chars (18-bit, offset 2¹⁷) in row order a-R,a-G,a-B,b-R…d-B, then optionally 4 globals × 2 chars (12-bit, offset 2¹¹). **Total 37 chars (default globals) or 45 chars.** Editing one char group edits exactly one value — URLs are deliberately hackable. Decoding also accepts (a) **decimal CSV: 12 or 16 comma-separated numbers** in the same order — the documented "human/LLM-writable form" — and (b) legacy lz-string; both 301 to the canonical aligned seed on `/{seed}` (`index.ts:1133-1135`). Out-of-range globals in a CSV make the seed invalid → 404; out-of-range coefficients are clamped by the schema on re-serialize.

**URL-addressable parameters** (validators in `valibot-schema/grabient.ts`; parsing in `search.ts:39-61`):
- `style`: one of `linearGradient | linearSwatches | angularGradient | angularSwatches | radialGradient | radialSwatches` (default `linearGradient`). Geometry matches CSS: linear angle 0°=up clockwise with CSS gradient-line length; angular = conic from-angle clockwise from top; radial = farthest-corner (`palette.ts:210-278` shader port documents each).
- `steps`: integer **2–50**, default 7. `angle`: integer **0–360**, default 90.
- `page` ≥1, `limit` **12–96** (default 24) on list/query pages; `sort` = `popular|newest|oldest` on query pages (`index.ts:293-298`).
- `size` = `WxH` (each **40–6000**) on seed pages only — preview aspect, island-owned (`search.ts:81-93`); `graph=1` opens the RGB-curves overlay (`index.ts:1143`).
- PNG endpoints: `w`/`h` **16–2400**, clamped, default 1200×630 (`seo.ts:209-218`).
- Invalid/default values are stripped by a 301 to the canonical URL (`search.ts:105-114`, `index.ts:321-322`).

**Knobs in code/UI that are NOT URL-addressable (the agent-API gap list):** nothing is missing for *color definition* — globals ride in the seed itself (45-char or 16-number form), so exposure/contrast/frequency/phase ARE URL-addressable, just not as query params. The true gaps: (1) channel reorder/invert (`invertCoeffs`, RGB-tab reorder — `cosine.ts:262-281`, editor island) exists only as editor state, no param; (2) `modifier` picklist (`grabient.ts:141-149`) is editor-island UI state; (3) no URL form yields machine-readable colors — hex values exist only in rendered HTML/PNG (see Part 3 gap); (4) SVG/CSS/ShaderToy/JSON export strings exist only as on-page copy blocks, not endpoints; (5) `determinePaletteProperties` (auto style/steps/angle from complexity, `cosine.ts:300-357`) and the tag derivation (`palette-tags.ts`) are unexposed.

---

## Part 3.1 — Free-asset inventory (all no-auth)

| Endpoint | Params | Returns | Cache |
|---|---|---|---|
| `/{seed}.png` and `/api/png?seed=` | seed (any of 3 encodings), style, steps, angle, w, h | raw unbranded PNG (`seo.ts:448-481`) | `max-age=86400, s-maxage=604800` + KV 7d (1200×630 only) + edge |
| `/palettes/{query}.png` and `/api/png/query?query=` (`q` alias) | query, style, steps, angle, w, h | PNG montage of top-24 results (`seo.ts:484-526`) | same |
| `/api/og?seed=` / `/api/og/query?query=` | same minus w/h | branded 1200×630 social card (`seo.ts:528-588`) | same |
| `/api/palettes` | sort=popular\|newest\|oldest, page, limit 12-96, style, steps, angle | **JSON** `{palettes: [{seed, key, href, background(CSS string), likesCount, createdAtMs, style, steps, angle}], total, totalPages}` (`index.ts:1012-1016`) | `max-age=60` / CDN 300 |
| `/api/like-counts?keys=a,b` (≤50) | coefficient keys | JSON `{counts}` (`index.ts:728-734`) | no-store |
| `/api/like-info?seed=` | seed | JSON count+liked (`index.ts:715-722`) | no-store |
| `/sitemap.xml`, `/robots.txt`, `/llms.txt` | — | XML / text / text (llms.txt is a static asset at `apps/web/public/llms.txt`, no `_headers` entry → served max-age=0+ETag) | sitemap CDN 24h |

No RSS/Atom feed exists. **Headline gap: no endpoint returns a palette's colors or coefficients as JSON.** `/api/palettes` is real JSON but omits hex colors (only a CSS `background` string + seed); search results have no JSON form at all; a single palette has no JSON form. An agent today must parse the seed itself (the llms.txt math) or OCR a PNG. A `/{seed}.json` (or `Accept: application/json`) emitting `{seed, hexColors, coeffs, globals, css, tags}` — all already computed in `renderPalette`/`coeffsJsonSnippet`/`analyzeCoefficients` — is the single highest-leverage agent feature and is ~30 lines in `index.ts`.

## Part 3.2 — Smallest-diff fix list (implementation backlog)

1. **Retitle query pages** — `semantic-search.ts:95,101-102`: change the three `"… palettes"` suffixes in `queryHeading` to `"… gradient palettes"` (title/h1/description/OG alt all inherit; `index.ts:467` template unchanged). Blast radius: query pages only; embeddings (`normalizeSemanticQuery`) untouched.
2. **Make the noindex guard live** — `index.ts` before `:393`: drop results below a score floor (calibrate against Vectorize cosine scores) or require a minimum count; `total=0` then triggers the existing `pageRobots` at `:472` and the existing empty-state copy at `:463`. Blast radius: gate only in `handleSemanticSearch` — the OG/PNG montages call `searchSemanticPalettes` directly and should keep rendering whatever exists.
3. **Sitemap failure honesty** — `index.ts:1037`: if `seeds.length === 0`, serve 503 or `Cache-Control: no-store` instead of a 24h-cached 33-URL sitemap. 3 lines.
4. **`<lastmod>`** — extend `getPopularPaletteIds` (`packages/data-ops/src/queries/palettes.ts:168-180`, sole caller is the sitemap route) to return `{id, createdAt}`; emit `<lastmod>` in `seo.ts:117-123`. Requires `pnpm build:data-ops`.
5. **Crawlable sort links** — add `/newest` + `/oldest` `<a>`s to `footer()` (`pages.ts:376-401`, rendered on every page) rather than touching the `<select>`/JS pair (`pages.ts:200-208` + `app.client.js:391`). 2 lines, zero JS risk.
6. **Noindex the workers.dev duplicates (staging AND prod)** — in the `app.use("*")` middleware (`index.ts:126-148`): `if (hostname.endsWith(".workers.dev")) c.header("X-Robots-Tag", "noindex")`. Keeps staging usable for smoke tests; covers `wrangler.jsonc:66` and the unflagged `:144`.
7. **Sitemap color expansion** — append color-name queries to `POPULAR_SEARCHES` (`popular-searches.ts:17-47`). Verified safe: consumers are the sitemap (`seo.ts:113`) and a default arg no production path hits (`pages.ts:443`); live chips come from the provider. GSC evidence favors color terms over themes.
8. **Fix ItemList** — `index.ts:477-482`: `numberOfItems: items.length` (or emit all 48 URLs) and `url: `${origin}/${canonicalSeed(item.seed) ?? item.seed}`` bare, matching seed-page canonicals.
9. **Render tags** — seed pages: `analyzeCoefficients`+`tagsToArray` from `@repo/data-ops/gradient-gen` → a linked chip row (`/palettes/{tag}`) in `seedPage` (`pages.ts:645-719`). Un-dead-ends all 866 sitemap pages and adds per-page unique text with no infra. Query pages get the same from the already-parsed `result.tags` (`index.ts:398-426`).
10. **One real `<img>` per seed page** — e.g. in the export section (`pages.ts:710-718`): `<img src="/{seed}.png?w=1200&h=630" alt="{colors} gradient" loading="lazy">`. PNGs are KV+edge cached (`seo.ts:368-385`), so crawl cost is bounded; this is the minimum viable Google Images surface. (Swapping card `div`s for `<img>`s is a bigger LCP/render-cost change — do not start there.)

Distrust preserved from the passoff: none of these fixes is evidence that traffic is page-quality-bound; the GSC read (now showing ~100 clicks/day) already softened the "zero traffic" framing this passoff opens with.

---

## For the strategy

Ranked by (impact × confidence)/effort. All verified against source; anchors above.

1. **[free] Retitle query pages to include "gradient"** (fix 1) — the pages already rank top-10 for "gradient maker/generator"; matching title+h1 to the query intent is the classic CTR/relevance lever on already-earning URLs.
2. **[free] Ship `/{seed}.json` (or Accept-negotiated JSON) with hexColors+coeffs+globals+css+tags** — agents can't consume divs or PNGs; one small route makes every palette machine-readable and is the concrete groundwork for the owner's agent-first vision, then document it in llms.txt.
3. **[free] Sitemap: color-name expansion + `<lastmod>` + failure honesty** (fixes 3,4,7) — colors are the only empirically-demanded query class (GSC top-10); the sitemap is the one channel that doesn't depend on the broken link graph, and silent 33-URL degradation can quietly deindex 96% of it.
4. **[free] Render coefficient-derived tags on seed + query pages, linked to `/palettes/{tag}`** (fix 9) — simultaneously fixes thin text, the 866 dead ends, and internal linking, using data the product already computes deterministically.
5. **[free] Score-gate indexing on `/palettes/{anything}`** (fix 2) — turns an unbounded machine-generated 200-space into a bounded, quality-signaled corpus before Google's scaled-content systems have reason to look.
6. **[free] X-Robots-Tag noindex on `*.workers.dev` + footer links to /newest//oldest** (fixes 5,6) — removes two full-site duplicates (staging self-canonical, prod workers.dev) and reconnects two sitemap-listed hubs to the link graph, both with near-zero regression surface.
7. **[free] One `<img>` per seed page onto the existing cached PNG endpoints** (fix 10) — Google Images is a native discovery channel for "gradient" queries and currently structurally unreachable; the render infrastructure is already built and cached.
8. **[free] Test the rendered DOM before any further page-quality work** — `entry.tsx:58` deletes the SSR grid after island mount; if the virtualizer under-renders for Googlebot, every content fix above lands on a page Google half-sees. One evening with Search Console URL-inspect / Rich Results test settles it.
