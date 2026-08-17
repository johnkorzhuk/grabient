# Cost-surface audit — grabient.com (`apps/web`)

**Date:** 2026-08-17
**Scope:** Worker `grabient-production`, deployed version `300fe9fd-787a-4859-af8e-eeb1d2f572ad`
(created 2026-08-15T23:51:46Z, confirmed via `wrangler deployments list --env production`).
**Question:** can the owner wake up to a large bill?

## How to read this document

Three kinds of claim appear here and they are labelled differently:

- **[code]** — read from the repository. Every one carries a `file:line`.
- **[measured]** — I ran it. Production probes are `curl` against grabient.com with
  freshly-generated seeds/queries (guaranteed cache misses); local benchmarks are
  labelled as such and are *not* workerd timings.
- **[docs]** — Cloudflare pricing/limits, with the `developers.cloudflare.com` URL.
- **UNVERIFIED** — I could not confirm it. Stated explicitly, with what is missing.

### Two sibling documents I did not write

While this audit was in progress, two untracked files appeared in
`infra-research/` that reference this one by name:
`measured-consumption-2026-08-17.md` (claims to be Cloudflare GraphQL Analytics
API output, 24 h window) and `pricing-and-spend-controls.md`.

**I did not produce them, I did not verify their numbers, and no claim in this
report depends on them.** I left them in place rather than delete work whose
provenance I am unsure of. One number in the first file bears directly on my
conclusions and is discussed — clearly attributed, and with the independent
consistency check I *was* able to run — in §5.4. Read that before acting on §2
or §6.

### Measurement caveat

Wall-clock is not CPU time. I measured TTFB from a client machine; the network
baseline to the origin was **94 ms** (`/robots.txt`, 200, 0.094 s [measured]). Server
time below = TTFB − 94 ms. For the rasterization routes there is no I/O in the hot
path beyond at most one KV read, so wall ≈ CPU + ~50 ms — but **the actual billed
CPU-ms is UNVERIFIED**: I have no read access to Workers Analytics CPU percentiles
from here. Everything downstream of a CPU number inherits that uncertainty.

---

## 0. Bottom line

**The good news, and it is the larger part of the answer:** the realistic exposure
is *hundreds of dollars per month*, not hundreds of thousands. Workers CPU is
$0.02 per million CPU-milliseconds [docs], which is cheap enough that even a
pathological 8.9-second render costs **$0.000178**. One million of the single most
expensive URL on the site costs **$178**. D1 and R2 are not cost surfaces here at
all. The measured $3.97 month-to-date is not hiding anything.

**The bad news, in order:**

1. One query parameter — `?style=angularSwatches` — multiplies the CPU cost of a
   PNG render by **6×** (396 ms → 2,376 ms [measured]), because that one style
   wraps the whole canvas in an SVG Gaussian blur filter
   (`packages/data-ops/src/gradient-gen/svg.ts:349-353` [code]). `robots.txt`
   advertises `?style=` to every crawler [measured, live]. No attacker is required
   for this one — it is a crawler away.
2. `?w=` and `?h=` at any non-default size **disable the KV render cache entirely**
   (`apps/web/src/seo.ts:550-553` [code]), and `llms.txt` teaches agents to use
   exactly those parameters [measured, live]. Combined with (1), a single
   unauthenticated GET occupies the worker for **8.9 seconds** and stores nothing.
3. `limits.cpu_ms: 10000` (`apps/web/wrangler.jsonc:53` [code]) did not stop a
   **13.1-second** request from returning 200 [measured]. Whatever it is doing, it
   is not the 10-second brake the comment above it describes.
4. **There is no spend cap.** Cloudflare does not offer one for Workers. Budget
   alerts email you and explicitly "do not pause or cap usage" [docs].
5. The Cloudflare rate-limiting rule exempts **every verified bot**
   (`not cf.client.bot`), and one exempt bot is already doing ~140k req/day.

None of these is currently costing money. All of them are one URL pattern away
from doing so. (An unverified sibling document reports production CPU p99.9 at
141 ms, which would confirm that no real traffic touches these paths today — see
§5.4 for why I am not leaning on it.)

---

## 1. Per-route billable-operation table

Every route in `apps/web/src/index.ts`, in registration order. Costs are **per
request on a cache MISS** — an edge HIT skips the worker entirely and bills
nothing ("CPU time is only billed when the Worker runs (on a cache miss or
bypass)" [docs, workers/platform/pricing]).

**Legend:** 🔓 = reachable unauthenticated · ∞ = unbounded input space (each
distinct input is a distinct cache key and a distinct render) · **[m]** = measured
against production 2026-08-17, server time = TTFB − 94 ms network baseline.

### Deployment note, read this first

**The working tree is ahead of production.** These routes exist in `index.ts` but
return **404 on grabient.com** [measured 2026-08-17]:

| Route | `index.ts` | Live status |
|---|---|---|
| `GET /api/palette.json` | :1129 | **404 — not deployed** |
| `ALL /mcp` | :1135-1137 | **404 — not deployed** |
| `GET /api/search.json` | :1139-1177 | **404 — not deployed** |
| `GET /sitemap-pages.xml` | :1198-1200 | **404 — not deployed** |
| `GET /sitemap-searches.xml` | :1202-1204 | **404 — not deployed** |
| `GET /sitemap-palettes.xml` | :1209-1225 | **404 — not deployed** |
| `GET /:seed{.+\.json}` | :1304-1308 | **404 — not deployed** |

Consistent with `git status`: `apps/web/src/palette-json.ts` and
`apps/web/src/mcp.ts` are untracked. `/sitemap.xml` is live but serves a flat
97,868-byte urlset, not the three-child index in `seo.ts:153-159`. **Everything
below marked "pending" is a cost surface the next deploy will switch on.**

### 1.1 Global middleware (runs on every request)

| Step | `index.ts` | Consumes |
|---|---|---|
| HTTP→HTTPS 301 | :142-151 | 1 Workers request, ~0 CPU. `no-store` on purpose (:149-150) |
| Security + CSP headers | :154-169 | ~0 |
| CORS for public API paths | :177-178, :182-189 | ~0 |
| `app.options("/*")` preflight | :194-205 | 1 request, ~0 CPU, `max-age=86400` |

### 1.2 The rasterization routes — the entire cost story

All 🔓. All ∞. All rasterize through `@cf-wasm/resvg` (`seo.ts:504-522`).

| Route | `index.ts` | Handler | CPU (server time) | KV r/w | D1 | Vectorize | AI | Notes |
|---|---|---|---|---|---|---|---|---|
| `GET /:seed{.+\.png}` 🔓∞ | :1297-1301 | `palettePngResponse` `seo.ts:532-565` | **396 ms** default [m] | 1r/1w | 0 | 0 | 0 | KV key only at exactly 1200×630 (`seo.ts:550-553`) |
| ↳ `?style=angularSwatches` 🔓∞ | ″ | ″ | **2,376 ms** [m] | 1r/1w | 0 | 0 | 0 | **6× multiplier**, still KV-cached |
| ↳ `?w=2100&h=2100&style=angularSwatches` 🔓∞ | ″ | ″ | **8,909 ms** [m] | **0/0** | 0 | 0 | 0 | **cache key is `null`** |
| ↳ `?w=2400&h=1800&style=angularSwatches` 🔓∞ | ″ | ″ | **13,116 ms** [m], 200 | 0/0 | 0 | 0 | 0 | flaky: a retry returned 0-byte 503 |
| ↳ `?w=2400&h=2400&style=angularSwatches` 🔓∞ | ″ | ″ | ~900 ms → **500** [m] | 0/0 | 0 | 0 | 0 | resvg throws (`seo.ts:561-563`) |
| ↳ `?w=2400&h=2400&style=angularGradient&steps=50` 🔓∞ | ″ | ″ | **2,346 ms** [m], 1.67 MB PNG | 0/0 | 0 | 0 | 0 | 1,764 SVG wedges (`seo.ts:227-231`) |
| `GET /api/png` 🔓∞ | :1235 | same | same as above | same | 0 | 0 | 0 | Query-param spelling |
| `GET /api/og` 🔓∞ | :1227 | `paletteOgResponse` `seo.ts:612-637` | **≤606 ms** [m]* | 1r/1w | 0 | 0 | 0 | Always KV-keyed (`seo.ts:625`), no w/h |
| `GET /palettes/:query{.+\.png}` 🔓∞ | :1254-1258 | `queryPngResponse` `seo.ts:568-610` | **6,064 ms** at `?style=angularSwatches` [m] | 1r/1w (search) + 1r/1w (png, default size only) | 0 | **1** | **1** | 16 tiles, each filtered |
| ↳ `?w=2000&h=2000&style=angularSwatches` 🔓∞ | ″ | ″ | **14,914 ms → 503** [m] | 1r/1w search only | 0 | 1 | 1 | Highest total consumption observed |
| `GET /api/png/query` 🔓∞ | :1236 | same | same | same | 0 | 1 | 1 | **No query-length cap** — see §4.2 |
| `GET /api/og/query` 🔓∞ | :1228 | `queryOgResponse` `seo.ts:639-672` | **2,190 ms** [m] | 1r/1w + 1r/1w | 0 | 1 | 1 | Always KV-keyed (`seo.ts:651`) |

\* `/api/og` was probed on the default seed, so it may have been a KV hit reading
a 352 KB value rather than a cold render — **the 606 ms is an upper bound and its
cache state is UNVERIFIED.** I did not force a cold OG render, because unlike the
`.png` routes `/api/og` always writes to KV and I did not want to seed the
production cache with throwaway keys beyond what the probes already did.

**Why `angularSwatches` is special** [code + measured]: it is the only style that
emits an SVG filter — `<feGaussianBlur stdDeviation="0.3"/>` applied to the whole
clipped group (`packages/data-ops/src/gradient-gen/svg.ts:349-353`). A blur is a
full-canvas convolution, so its cost tracks **pixel area, not SVG complexity**.
Local benchmark confirming the mechanism, at 2400×2400:

| style | steps | SVG length | local raster |
|---|---|---|---|
| angularSwatches | 50 | 10,751 B | 9,598 ms |
| angularSwatches | **2** | **1,011 B** | **11,033 ms** ← 10× smaller SVG, same cost |
| angularGradient | 50 | 171,061 B | 1,470 ms ← 16× bigger SVG, 7× cheaper |
| linearSwatches | 50 | 6,807 B | 624 ms |
| radialSwatches | 50 | 13,307 B | 805 ms |
| linearGradient | 7 | 749 B | 344 ms |

[measured, local Node v20 + `@cf-wasm/resvg` 0.3.3 — **not workerd**; production
timings above are ~1.7–2.1× these, which is the calibration factor I used
nowhere: all cost arithmetic uses the production numbers directly.]

Production area sweep for `angularSwatches` [measured]:

| size | Mpx | TTFB | result |
|---|---|---|---|
| 1200×630 | 0.76 | 2.470 s | 200 |
| 1200×1200 | 1.44 | 3.829 s | 200 |
| 1600×1600 | 2.56 | 6.766 s | 200 |
| 2000×2000 | 4.00 | 7.837 s | 200 |
| 2100×2100 | 4.41 | **9.003 s** | 200 |
| 2400×1800 | 4.32 | **13.210 s** | 200 |
| 2200×2200 | 4.84 | 0.604 s | **503, 0 bytes** |
| 2400×2000 | 4.80 | 1.052 s | **503, 0 bytes** |
| 2400×2400 | 5.76 | 1.027 s | **500** "Error generating image" |

Note the shape: **failures are cheap and successes are expensive.** An adversary
optimizing for cost stays just below the cliff, around 2000–2100 px square. The
500/503 region is a reliability problem, not a billing one.

### 1.3 Search routes

| Route | `index.ts` | Auth | ∞? | CPU | KV | D1 rows | Vectorize | AI |
|---|---|---|---|---|---|---|---|---|
| `GET /palettes/:query` | :1259-1261 | 🔓 | ∞ | **1,051 ms** [m] | 1r/1w search | ~50 (`getLikesCountsByKeys`, :471) | 1 (768 dims) | 1 embedding |
| `GET /palettes` | :1240-1251 | 🔓 | — | ~0 | 0 | 0 | 0 | 0 (302 redirect) |

`searchSemanticPalettes` (`semantic-search.ts:212-267`): KV read (:228) → miss →
`env.AI.run("@cf/google/embeddinggemma-300m")` (:236) → `env.VECTORIZE.query(vector,
{topK: limit})` (:242) → KV write, 3-day TTL (:258-260, TTL at :21). The KV key is
the normalized query text (:208-210), so **the key space is as unbounded as the
query space.** Index confirmed at **768 dimensions**, 3,483 vectors
[`wrangler vectorize info grabient-palettes`, measured].

### 1.4 List / HTML routes

| Route | `index.ts` | Auth | CPU | D1 rows read | KV | Cache policy |
|---|---|---|---|---|---|---|
| `GET /` | :1263 | 🔓 | ~1 s cold | **6,492** | **0** (see below) | `LIST_HEADERS` :114-117 |
| `GET /newest` | :1264 | 🔓 | ~1 s | 6,492 | 0 | ″ |
| `GET /oldest` | :1265 | 🔓 | ~1 s | 6,492 | 0 | ″ |
| `GET /api/palettes` | :1119-1123 | 🔓 | ~1 s | 6,492 | 0 | ″ |
| `GET /:seed` | :1318-1340 | 🔓 ∞ | ~50 ms | **0** | 0 | `SEED_HEADERS` :118-121 |
| `GET /:seed/edit` | :1311-1316 | 🔓 ∞ | ~0 | 0 | 0 | 301, 24 h |
| `GET /privacy` `/terms` `/contact` | :1267-1293 | 🔓 | ~0 | 0 | 0 | `STATIC_HEADERS` :603-606 |
| `GET /robots.txt` | :1179-1184 | 🔓 | ~0 | 0 | 0 | 24 h |
| `GET /sitemap.xml` | :1196 | 🔓 | ~2 ms [m] | 0 | 0 | `SITEMAP_HEADERS` :1186-1190 |
| `GET /sitemap-palettes.xml` *(pending)* | :1209-1225 | 🔓 | — | **5,575** | 0 | ″ |
| `app.notFound` | :1342 | 🔓 | ~50 ms | 0 | 0 | 5 min / 1 h (:291-292) |

**D1 row counts are measured, not estimated** — run against the production
database with `--json` and read from `rows_read`:

| Query | source | rows_read |
|---|---|---|
| `getPopularPalettesPage(1, 24)` | `queries/palettes.ts:109-132` | **5,575** |
| same at page 30 (offset 696) | ″ | **5,575** (offset does not help) |
| `getPalettesCount()` `COUNT(*)` | `queries/palettes.ts:381-385` | **867** |
| `getLikeTotalsByKeys(24 keys)` | `queries/palettes.ts:268-289` | **50** |
| `getPopularPaletteIds(1000)` | `queries/palettes.ts:168-181` | **5,575** |

**The popular-search KV cache is dead code in production.** `handleList` passes
`c.env.SEARCH_CACHE` into `getPopularSearchSuggestions` (`index.ts:397`), but the
default provider is `curatedPopularSearchProvider`
(`popular-searches.ts:450-454, 561`) which sets `cacheable: false`, and
`popular-searches.ts:568` then does `cache = undefined`. Both the read (:570) and
the write (:599) are guarded on `if (cache)`. So list renders perform **zero KV
operations** — the suggestions are a pure function of the hour. Correct and free;
noted because the binding's presence in the call makes it look otherwise.

Corpus: **867 palettes, 2,991 likes** [measured, production D1]. The join in
`getPopularPalettesPage` scans both tables regardless of `LIMIT`/`OFFSET`, which
is why every page costs the same. The comment at `index.ts:304-306` correctly
identifies `COUNT(*)` as row-billed and memoizes it per isolate (:307-313).

**This does not matter financially.** D1 gives 25 *billion* rows read per month on
Paid [docs]. At 6,492 rows per cold list render, that is **3.85 million cold list
renders per month before the first cent.** At $0.001 per million rows [docs], one
million cold renders costs **$6.49**. D1 is not a risk on this site.

### 1.5 Per-user / authenticated routes (all `NO_STORE`, `index.ts:633-636`)

| Route | `index.ts` | Auth | D1 | Other |
|---|---|---|---|---|
| `GET /api/likes` | :811-817 | session | user's like rows | — |
| `GET /api/like-info` | :822-829 | optional | ~2 indexed | — |
| `GET /api/like-counts` | :835-841 | 🔓 | ≤50 keys (capped :836) | — |
| `POST /api/likes/toggle` | :851-904 | **required** | scan user rows + insert (`palettes.ts:472-534`) | **1 DO request** (20/60 s, `rate-limit.ts:2`) |
| `GET /saved` | :924-999 | required | ≤1000 likes, chunked ≤12 queries (`palettes.ts:266`) | 0 (see above) |
| `GET /login` `/settings` | :912-922, :1099-1117 | optional | session | — |
| `POST /api/settings/username/check` | :1008-1014 | **🔓 unauthenticated** | 1 indexed lookup | — |
| `POST /api/settings/username` | :1016-1029 | required | 2 | — |
| `POST /api/settings/avatar` | :1043-1074 | required | 1 write | **R2 PUT + DELETE**, ≤5 MB (:1041) |
| `POST /api/settings/delete-account` | :1079-1095 | required | better-auth | — |
| `GET /api/geo` | :1033-1035 | 🔓 | 0 | reads `request.cf` |
| `GET|POST /api/auth/*` | :794-805 | — | better-auth | Resend subrequest on magic-link |
| `POST /api/contact` | :659-742 | 🔓 | 0 | **1 DO request** + Turnstile subrequest + Resend subrequest |
| `GET|POST /e`, `/e/*` | :782-784 | 🔓 | 0 | **1 subrequest to PostHog** |

`toggleLikePaletteByKey` (`palettes.ts:472-534`) **inserts a row into `palettes`**
for any seed the caller sends (:504-511). An authenticated user can therefore grow
the corpus — bounded by the DO rate limit of 20 per 60 s per user
(`rate-limit.ts:2`), i.e. 28,800 rows/day/account. At $1.00 per million rows
written [docs] that is $0.029/day/account. Financially trivial; worth knowing it
exists because it also inflates every list query's scan (§1.4).

**R2 is not a grabient.com cost surface.** `grabient-uploads` holds **2,091
objects / 124 MB** [measured, `wrangler r2 bucket info`]. The 26.97 GB-months in
the account baseline belongs to a different bucket. At $0.015/GB-month [docs],
124 MB is **$0.002/month**.

---

## 2. The worst-case request

### 2a. Most expensive URL that reliably returns 200

```
GET https://grabient.com/{fresh-37-char-seed}.png?w=2100&h=2100&style=angularSwatches
```

**Measured:** 9.003 s TTFB → **≈8,909 ms server time**, HTTP 200, 36,134 bytes.

Why it is free of every non-CPU cost — `apps/web/src/seo.ts:550-553`:

```ts
const cacheKey =
  width === OG_WIDTH && height === OG_HEIGHT
    ? `png-seed:v${OG_RENDER_VERSION}:${seed}:${style}:${steps}:${angle}`
    : null;
```

With `w`/`h` set to anything other than 1200×630 the key is `null`, and both
`kvPngGet` (`seo.ts:474`) and `kvPngPut` (`seo.ts:490`) return immediately. So:

| Resource | Amount | Unit price [docs] | Cost |
|---|---|---|---|
| Workers request | 1 | $0.30 / 1M | $0.00000030 |
| Workers CPU | 8,909 ms | $0.02 / 1M CPU-ms | **$0.00017818** |
| KV reads | 0 | — | $0 |
| KV writes | 0 | — | $0 |
| D1 rows | 0 | — | $0 |
| Vectorize | 0 | — | $0 |
| Workers AI | 0 | — | $0 |
| Durable Objects | 0 | — | $0 |
| R2 | 0 | — | $0 |
| **Total** | | | **$0.0001785** |

**One million of them:**

```
requests : 1,000,000 × $0.30 / 1,000,000            =      $0.30
CPU      : 1,000,000 × 8,909 ms = 8.909e9 CPU-ms
           8.909e9 / 1e6 = 8,909 million-CPU-ms units
           8,909 × $0.02                            =    $178.18
                                                      ─────────
                                              TOTAL ≈  $178.48
```

For scale: **8.909e9 CPU-ms is 145× the account's entire measured monthly CPU**
(61.32M CPU-ms), delivered by requests equal to 5.6% of a month's current request
volume. The *ratio* is alarming; the *dollar figure* is a rounding error against
most people's threshold for "large bill". Both facts are true and the second one
is the one that should govern the response.

The observed peak, `?w=2400&h=1800&style=angularSwatches` at **13,116 ms**, gives
$0.000262/request and **$262.30 per million** — but it is not reliable (a retry
with a different seed returned a 0-byte 503 in 0.80 s), so 2a above is the
defensible worst case.

### 2b. Most total resources consumed by one URL

```
GET https://grabient.com/palettes/{novel-query}.png?w=2000&h=2000&style=angularSwatches
```

**Measured:** 15.008 s → **≈14,914 ms**, then a **0-byte 503**. It consumed:

- 1 Workers request
- ~14,914 ms CPU (the platform killed it; **whether that CPU is billed is
  UNVERIFIED** — see §5.4)
- 1 KV read + 1 KV write (`SEARCH_CACHE`, `semantic-search.ts:228, 258`)
- 1 Workers AI embedding call (`semantic-search.ts:236`)
- 1 Vectorize query, 768 dimensions (`semantic-search.ts:242`)
- 0 D1, 0 R2

Fifteen seconds of worker occupancy, four billable services touched, and the
caller got nothing. At the default size the same shape returns a clean 200 in
**6,064 ms** and *does* write a KV entry — an unbounded key space filling a
paid cache with 6-second renders.

### 2c. What it takes to reach a threshold

| Target | Requests at 2a | One non-exempt IP at the rate-limit ceiling (15 req/s) | One verified bot at meta-webindexer's rate (1.63 req/s) |
|---|---|---|---|
| $10 | 56,180 | 62 minutes | 9.6 hours |
| $100 | 561,798 | 10.4 hours | 4.0 days |
| $1,000 | 5,617,978 | 4.3 days | 40 days |
| $10,000 | 56,179,775 | 43 days | 400 days |

---

## 3. Amplification analysis

### 3.1 The rate-limiting rule, honestly

```
(not cf.client.bot and (
    starts_with(http.request.uri.path, "/api/")
    or ends_with(http.request.uri.path, ".png")
    or ends_with(http.request.uri.path, ".json")))
```
300 requests / 10 seconds per IP, action **Block**.

Free-zone constraints [docs, waf/rate-limiting-rules]: **1 rule; 10-second
counting period only; 10-second mitigation only; IP-only counting; Path and
Verified Bot the only usable expression fields.** There is no `log` action to
observe with first, and "apply to cached assets" cannot be disabled below
Business, so **cache HITs consume the budget** — the counter is dominated by
cheap edge hits rather than expensive worker renders.

Three holes, in order of importance:

1. **`not cf.client.bot` exempts every Cloudflare-verified bot from the rule
   entirely.** This is not a subtlety; it is most of the traffic.
2. **A 10-second window is a burst brake, not a volume cap.** An IP that paces
   itself under 300/10 s is never touched, forever.
3. **It does not cover `/palettes/{query}` HTML** (no `/api/` prefix, no `.png`
   suffix) — a 1,051 ms route with an unbounded input space and a Workers AI call.

### 3.2 A verified bot — the realistic scenario

`meta-webindexer` is measured at **140,447 req/day (16.8% of all traffic), 0%
cache hits** (`infra-research/traffic-forensics-2026-08-17.md:193`). It is exempt
from the rule. It requires no attacker; it is already here.

Everything below is that *already-observed* request rate, redirected onto a
different URL shape. 30-day months.

**(a) Default `/{seed}.png` — 396 ms, KV-cached**

```
CPU   : 140,447 × 30 × 396 ms = 1.668e9 CPU-ms
        1,668 units × $0.02                        =  $33.36
KV w  : 140,447 × 30 = 4.213M writes
        (4.213M − 1M included) × $5.00/M           =  $16.07
KV r  : 4.213M reads, 10M included                 =   $0.00
KV st : 140,447 × 7 days × ~10 KB ≈ 9.8 GB
        (9.8 − 1 included) × $0.50/GB-mo           =   $4.40
Req   : 4.213M × $0.30/M                           =   $1.26
                                                     ────────
                                             TOTAL ≈  $55/month
```

**(b) Same rate, `?style=angularSwatches` — 2,376 ms, still KV-cached, still 200**

```
CPU   : 140,447 × 30 × 2,376 ms = 1.001e10 CPU-ms
        10,010 units × $0.02                       = $200.20
KV + requests, as above                            =  $21.73
                                                     ────────
                                             TOTAL ≈ $222/month
```

**One query parameter turns $55/month into $222/month.** `robots.txt` advertises
`?style=` in production today [measured, live]:

> `# add ?style=&angle=&steps= to change how it renders:`

**(c) Same rate, `?w=2100&h=2100&style=angularSwatches` — 8,909 ms, uncached**

```
CPU   : 140,447 × 30 × 8,909 ms = 3.753e10 CPU-ms
        37,530 units × $0.02                       = $750.60
KV    : none — cacheKey is null                    =   $0.00
Req   : 4.213M × $0.30/M                           =   $1.26
                                                     ────────
                                             TOTAL ≈ $752/month
```

**(d) Same rate on novel search queries** (`/palettes/{q}.png`, default size,
`?style=angularSwatches`, 6,064 ms):

```
CPU       : 140,447 × 30 × 6,064 ms = 2.555e10        = $511.00
Vectorize : 4.213M × 768 dims = 3.236e9 queried dims
            (3.236e9 − 50e6 included) / 1e6 × $0.01   =  $31.86
KV writes : 2 per novel query (search + png) = 8.4M
            (8.4M − 1M) × $5.00/M                     =  $37.13
Workers AI: 4.213M embedding calls                    = UNVERIFIED
Requests                                              =   $1.26
                                                        ────────
                                                TOTAL ≳ $581/month
```

*Workers AI:* `@cf/google/embeddinggemma-300m` (`semantic-search.ts:236`) **has no
published price** — the model page exists on developers.cloudflare.com but carries
no pricing and the model is absent from the pricing table [docs, UNVERIFIED]. The
Paid allowance is 10,000 Neurons/day, then $0.011/1,000 Neurons [docs]. By analogy
with `@cf/baai/bge-small-en-v1.5` (1,841 Neurons per million input tokens [docs]),
a ~10-token query is ~0.018 Neurons and 4.2M queries/month ≈ 76,000 Neurons ≈
**$0.84/month** — but that is an *analogy, not a citation*, and embeddinggemma is a
larger model. **Treat Workers AI as unpriced until the owner checks the dashboard.**

### 3.3 A botnet

The rule counts per IP with a 10-second window. Sustained ceiling per IP,
assuming a 10 s block then resume: 300 requests per 20 s = **15 req/s =
1,296,000 req/day**. (If mitigation and counting overlap favourably it approaches
30 req/s; I use the conservative figure.)

On the 8,909 ms URL:

```
per IP/day : 1,296,000 × 8,909 ms = 1.1546e10 CPU-ms
             11,546 units × $0.02                    =    $230.92/day
```

| IPs | $/day | $/month if sustained |
|---|---|---|
| 1 | $231 | $6,930 |
| 10 | $2,309 | $69,300 |
| 100 | $23,092 | $692,760 |
| 1,000 | $230,920 | $6,927,600 |

**Honesty about this table:** it is arithmetic, not a prediction. Sustaining
1,296,000 requests/day/IP each occupying 8.9 s of CPU implies ~134 concurrent
invocations per IP. Workers will scale to that; whether Cloudflare's undocumented
platform protections would intervene first is **UNVERIFIED** — I found no
documented global concurrency or abuse ceiling. The measured 503s at 2200+ px show
*something* sheds load under memory pressure, but that is a per-render ceiling,
not an account-level one.

The practically important row is **1–10 IPs**: that is one annoyed person with a
VPS, it costs them nothing, and it costs the owner $231–$2,309/day. That is the
scenario worth engineering against.

### 3.4 The documentation is the amplifier

This is the finding I would most want the owner to see. The site does not merely
*permit* the expensive surface — it **publishes a construction guide for it**, to
crawlers, in production, today.

Live `robots.txt` [measured, fetched 2026-08-17]:

> ```
> # PNG renders, no auth, image/png. Append .png to any page URL for the raw,
> # unbranded image; add ?style=&angle=&steps= to change how it renders:
> #   https://grabient.com/{seed}.png              a single palette
> #   https://grabient.com/palettes/{query}.png    top results for a semantic search
> # Explicit endpoints, same renders, also accept w= and h= (16-2400):
> ```

Live `llms.txt` [measured, fetched 2026-08-17]:

> line 38: `Every PNG form also accepts w and h (pixels, 16-2400, default 1200x630).`
> line 44: `https://grabient.com/api/png?seed={seed}&w=960&h=88`

And in the working tree, `apps/web/public/llms.txt` goes further:

> line 197: `` `w`/`h` clamp to 16-2400, so `w=9999` silently renders at 2400. ``

That line teaches an agent that oversized requests are *safe and free*, when
`w=2400` is precisely the most expensive thing the worker can be asked to do.

`llms.txt:218` also tells readers "Reads are rate limited to 300 requests per 10
seconds per IP" — true, but it omits that verified bots are exempt. An agent that
believes it is rate-limited will not self-throttle any harder than the stated
limit, and a verified crawler is not limited at all.

**The gap between what the site advertises and what the site caches is the entire
vulnerability.** `robots.txt` advertises `?style=`, `?w=`, `?h=`. `seo.ts:550-553`
caches only the one combination that omits all three.

### 3.5 A note on what is *not* amplified

- **HTML page URLs are bounded.** `/:seed` normalizes and 301s any non-canonical
  parameter set (`index.ts:1323-1325` → `search.ts:105-114`), collapsing the query
  space to the five known keys at canonical values. That guard is real and works.
- **It does not apply to `.png` or `.json`.** Those routes never call
  `normalizeSearch` — they read parameters directly (`seo.ts:533-543`). This is
  the asymmetry that makes §3.4 exploitable.

### 3.6 The seed space is genuinely infinite — verified

`canonicalSeed` (`palette.ts:26-33`) round-trips through
`deserializeCoeffs`/`serializeCoeffs`. The aligned format is `_` + 36 base64url
characters, 18-bit fixed point per coefficient, and out-of-range values are
**clamped, not rejected** (`valibot-schema/coeffs.ts:11-13, 18-19`).

I tested this rather than assuming it: **20,000 of 20,000 randomly generated
37-character seeds decoded successfully, and 20,000 of 20,000 were already
canonical** — i.e. `canonicalSeed(s) === s`, so they return 200 directly with no
redirect, each a distinct edge-cache key and a distinct KV key. Address space:
**64³⁶ ≈ 1.05 × 10⁶⁵** [measured].

Multiply by the view parameters: 6 styles × 49 steps (2–50) × 361 angles (0–360)
× 2,385 widths × 2,385 heights (16–2400) = **603,714,072,150 ≈ 6.04 × 10¹¹
distinct renders per seed.**

There is no cache-warming strategy that reaches this space. Caching is not the
mitigation; bounding cost per render is.

---

## 4. Guardrails

### 4.1 What exists

| # | Guardrail | Location | What it actually does |
|---|---|---|---|
| 1 | `limits: { cpu_ms: 10000 }` | `wrangler.jsonc:53` | Intended per-invocation CPU cap. **Did not prevent a 13,116 ms 200** [measured]. See §5.4. |
| 2 | Edge cache, `cross_version_cache: false` | `wrangler.jsonc:44` | **Works** — a repeated identical `.png?w=1600&h=400` returned `cf-cache-status: HIT` [measured]. Version-keyed, so **every deploy cold-starts it**. |
| 3 | `CDN-Cache-Control: max-age=604800` on PNG | `seo.ts:454` | 7 days at the edge. `s-maxage` deliberately omitted to keep stale-if-error (:446-452). |
| 4 | KV PNG cache, 7-day TTL | `seo.ts:469, 493` | Survives deploys. **Default size only.** |
| 5 | KV search cache, 3-day TTL | `semantic-search.ts:21, 258-260` | Unbounded key space; caches repeats, never novel queries. |
| 6 | `PNG_MAX_DIMENSION = 2400` | `seo.ts:286, 293` | Clamps each side. **Does not bound area** — see §4.2. |
| 7 | `MAX_STEPS = 50` | `valibot-schema/grabient.ts` | Bounds colour count. Irrelevant to the blur cost (steps=2 costs the same). |
| 8 | `SEARCH_QUERY_MAX_LENGTH = 100` | `semantic-search.ts:24, 67` | Enforced on `/palettes/:query` only. **Not** on the PNG/OG query routes. |
| 9 | `/api/like-counts` keys capped at 50 | `index.ts:836` | Bounds that route's D1 work. |
| 10 | `getTotalCached()` 60 s isolate memo | `index.ts:307-313` | Saves 867 rows/render/isolate. |
| 11 | `LIKE_KEYS_CHUNK = 90` | `queries/palettes.ts:266` | D1 100-parameter limit. Correctness, not cost. |
| 12 | Durable Object rate limiter | `rate-limit.ts:1-4` | `toggleLike` 20/60 s **per user**; `contactForm` 5/600 s **per IP**. Both authenticated-or-contact only. Nothing on renders. |
| 13 | Turnstile on contact | `index.ts:687-705` | Gates the email send. **Runs after the DO call** (:670) — see §4.2. |
| 14 | Avatar 5 MB + WebP magic bytes | `index.ts:1041, 1050-1053` | Bounds R2 writes. |
| 15 | `normalizeSearch` 301 on HTML routes | `index.ts:1323-1325` | Collapses the HTML cache-key space. Not applied to `.png`/`.json`. |
| 16 | CF rate-limiting rule | Dashboard | 300/10 s/IP, Block. **Exempts verified bots.** §3.1. |
| 17 | `observability.head_sampling_rate: 1` | `wrangler.jsonc:48` | Full logging — you would at least *see* an incident. |

### 4.2 What is genuinely uncapped

1. **Total spend.** No cap exists at Cloudflare (§5). Nothing in this repo
   approximates one.
2. **CPU per day or per month.** `limits.cpu_ms` is per-invocation only. There is
   no `requests/day`, no `cpu_ms/day`, no kill switch.
3. **Pixel area.** `pngDimension` (`seo.ts:288-294`) clamps each side to 2400
   independently. Nothing checks `w × h`. `2400×1800` = 4.32 Mpx is accepted and
   is the most expensive successful render measured.
4. **The `.png` / `.json` parameter space.** Those routes never normalize
   (§3.5), so `?utm_source=1`, `?x=1`, `?x=2`… each mint a fresh edge-cache key
   and a fresh worker invocation while producing byte-identical output.
5. **Embedding input length on the PNG/OG query routes.** `seo.ts:570` and
   `seo.ts:642` read `params.get("query")` with no length check; only
   `queryFromParam` (`semantic-search.ts:67`) enforces the 100-character cap.
   **Verified in production:** `/api/png/query?query=<2,099 characters>` returned
   **200** with a 293 KB PNG, while `/palettes/<same 2,099 characters>` correctly
   returned **404** [measured]. Arbitrary-length text reaches Workers AI.
6. **KV writes.** One per novel default-size PNG, one per novel search. $5.00/M
   [docs], unbounded key space, no cap.
7. **Vectorize queries.** One per novel query, 768 dims each. 50M dims/month
   included = **65,104 free queries/month**; after that $0.01/M dims [docs].
8. **Workers AI.** One embedding per novel query. 10,000 Neurons/day included,
   then billed with no cap [docs]. Price for this model UNVERIFIED.
9. **Durable Object instances.** `checkRateLimit` uses
   `namespace.idFromName(identifier)` (`rate-limit.ts:97`) where the identifier is
   `ip:${clientIdentifier(c)}` for contact (`index.ts:671-673`). **One DO instance
   per distinct source IP**, created *before* Turnstile verification (:670 vs
   :693), and storage entries are written (`rate-limit.ts:59, 78`) but **never
   deleted**. Unbounded instance and storage growth from unauthenticated POSTs
   with a well-formed body. Financially small ($0.15/M DO requests, $0.20/GB-month
   [docs]) but structurally uncapped.
10. **The `/e` PostHog relay** (`index.ts:747-784`). Unauthenticated, GET and POST,
    any path under `/e/*`. The destination host is fixed to PostHog
    (`index.ts:744-745, 752-754`) so it is not an open proxy to arbitrary hosts —
    but each call costs 1 Workers request + 1 subrequest, and anyone can pipe
    traffic through grabient.com. Cost is small; the abuse-of-domain angle is the
    real concern.
11. **`POST /api/settings/username/check`** (`index.ts:1008-1014`) is
    unauthenticated and unthrottled. One indexed D1 read each. Also a username
    enumeration oracle.

### 4.3 Non-issues, so the owner does not chase them

- **D1** — 25 billion rows/month included; a cold list render is 6,492 rows;
  break-even is 3.85M cold renders/month. Not a risk.
- **R2** — 124 MB in the production bucket ($0.002/month). The 26.97 GB-months on
  the bill is another project.
- **Durable Object duration/storage** — a few thousand ~50-byte entries.
- **`githubStars`** (`index.ts:239-272`) — Cache API, 24 h entries, 4 h freshness,
  refreshed via `waitUntil`, failure-tolerant. One subrequest per cold colo.
- **Two leftover secrets on the production worker**, `GROQ_API_KEY` and
  `OPENROUTER_API_KEY` [measured, `wrangler versions view`]. **No code in this
  repo reads either** — `curatedPopularSearchProvider` is a pure function of the
  hour (`popular-searches.ts:450-454`). No third-party LLM spend is possible from
  the deployed code today. Worth deleting, not worth worrying about.

---

## 5. What Cloudflare offers to bound spend

All figures from pages fetched 2026-08-17.

### 5.1 Is there a hard spend cap? **No.**

There is no spend cap, budget cap, or maximum-spend setting for Workers, KV, D1,
R2, Vectorize, or Durable Objects. The pages that would document it disclaim it.

The only cost control Cloudflare documents for Workers is per-invocation CPU —
[workers/platform/pricing](https://developers.cloudflare.com/workers/platform/pricing/):

> "To prevent accidental runaway bills or denial-of-wallet attacks, configure the
> maximum amount of CPU time that can be used per invocation by defining limits in
> your Worker's Wrangler file, or via the Cloudflare dashboard."

That bounds cost *per request*. It does nothing about volume.

The one genuine dollar cap in Cloudflare's lineup is
[AI Gateway spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/):

> "Spend limits let you set cost-based budgets on your AI Gateway. When cumulative
> spend reaches the limit within a time window, AI Gateway blocks further requests
> with a `429` response until the window resets."

Scope is AI Gateway traffic only; the page does not mention Workers, KV, D1 or R2.
**UNVERIFIED:** whether Workers AI calls routed through an AI Gateway binding can
be gated this way — I found no page stating it either way. Given Workers AI is a
minor line item here, this is not the lever.

### 5.2 Budget alerts — notification only

[billing/manage/budget-alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/):

> "When spend crosses the threshold, Cloudflare sends a single email notification
> to all configured recipients."
> **"Budget alerts are informational only. They do not pause or cap usage."**

Available to Pay-as-you-go accounts. Per the
[2026-06-15 changelog](https://developers.cloudflare.com/changelog/post/2026-06-15-budget-alerts-default-on/),
a **$10 account-level threshold is auto-created each billing cycle by default** and
can be changed or removed; it excludes recurring subscription fees, so the $5
Workers Paid fee does not count toward it. Again: "It does not cap your usage or
impact your account in any way."

**Practical consequence for this account:** a $10 default alert probably already
exists, and the projected $5.60 sits just under it. Lowering it to ~$8 turns it
into a genuine early-warning tripwire rather than a formality.

[billing/manage/billable-usage](https://developers.cloudflare.com/billing/manage/billable-usage/)
gives daily visibility into overage charges (Pay-as-you-go only, needs Billing
read permission). No capping capability.

### 5.3 What happens when you exceed included usage on Paid

**You are billed. No throttling, no 429s, no interruption.**

| Binding | Free plan | **Workers Paid** |
|---|---|---|
| Workers requests | 100k/day then blocked | 10M/mo included, **$0.30/M after, uncapped** |
| Workers CPU | 10 ms/invocation | 30M CPU-ms/mo included, **$0.02/M after, uncapped** |
| Workers AI | 10k Neurons/day → "operations will fail with an error" | 10k Neurons/day free, then **billed, no cap** |
| KV | 100k reads / 1k writes per day → error | limits page says **"Unlimited"** — billed, no cap |
| D1 | 5M reads/day → "D1 API will return errors" | **no daily cap** — billed |
| Vectorize | 30M queried dims/mo | billed, no cap |
| R2 | 10 GB / 1M Class A / 10M Class B | billed, no cap |
| Durable Objects | daily caps | billed, no cap |

Sources: [workers/platform/pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[kv/platform/pricing](https://developers.cloudflare.com/kv/platform/pricing/) +
[kv/platform/limits](https://developers.cloudflare.com/kv/platform/limits/),
[d1/platform/pricing](https://developers.cloudflare.com/d1/platform/pricing/) +
[d1/platform/limits](https://developers.cloudflare.com/d1/platform/limits/),
[vectorize/platform/pricing](https://developers.cloudflare.com/vectorize/platform/pricing/),
[workers-ai/platform/pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/),
[r2/pricing](https://developers.cloudflare.com/r2/pricing/),
[billing/understand/usage-based-billing](https://developers.cloudflare.com/billing/understand/usage-based-billing/).

**The asymmetry is the whole risk: on Free you get errors, on Paid you get an
invoice.** Upgrading to Workers Paid removed every hard stop this account had.

### 5.4 `limits.cpu_ms` — what the docs say, and what I measured

[workers/platform/limits](https://developers.cloudflare.com/workers/platform/limits/):

- Exceeding the CPU limit: "Cloudflare returns Error 1102 to the client with the
  message `Worker exceeded resource limits`." Execution is terminated.
- Default 30,000 ms on Paid; maximum 300,000 ms.
- Wall clock: "No limit" while the client stays connected.
- Memory: "Each isolate can consume up to 128 MB."

**The measurement does not fit the configuration.** `wrangler.jsonc:53` sets
`cpu_ms: 10000`. That value was committed 2026-07-27 (`f6e707b`) and the live
deployment is dated 2026-08-15, so it should be active. Yet:

- `?w=2400&h=1800&style=angularSwatches` returned **HTTP 200 after 13.21 s** — no
  1102, no truncation, a complete 32,296-byte PNG.
- Other requests in the same size band returned **0-byte 503s** in 0.5–1.0 s,
  which looks like memory eviction (a 2400×2400 RGBA buffer is 23 MB and a
  Gaussian blur needs several, against a 128 MB isolate) rather than a CPU stop.
- `wrangler versions view` does **not** print a `limits` field, so I could not
  confirm from outside whether the deployed script carries it.

**UNVERIFIED, three ways, and the owner should resolve all three:**

1. Whether `limits.cpu_ms` is present on the deployed version at all.
2. Whether the 13.1 s wall-clock corresponds to <10 s of *billed CPU* (possible —
   wall includes scheduling), in which case the cap is working and my CPU-derived
   dollar figures are **overestimates**.
3. **Whether CPU consumed before a 1102 termination is billed.** No page I fetched
   states this either way. The "prevent runaway bills" framing implies billing is
   bounded by the cap, but that is inference, not documentation. This matters: if
   killed CPU is billed, the 503-returning requests in §2b are pure loss.

**How to resolve it in ten minutes:** run `wrangler tail --env production --format
json` and issue one `?w=2100&h=2100&style=angularSwatches` request against a fresh
seed. The tail event carries `cpuTime`. That single number decides whether §2's
arithmetic is right or 3× too high, and whether guardrail #1 is real.

#### Third-party evidence, not mine, that bears on this

The sibling file `infra-research/measured-consumption-2026-08-17.md` — **which I
did not write and could not verify** — reports Cloudflare GraphQL Analytics for
`grabient-production` over 24 h as: **367,263 requests, 0 errors, CPU p50 2.6 ms,
p99 91 ms, p99.9 141 ms.**

I cannot confirm those figures. What I *can* do is check them against the two
numbers I was given independently, and they are consistent:

- The account baseline in my brief is 61.32M CPU-ms over 17.72M requests = **3.46
  ms mean**. A distribution with p50 2.6 ms and p99.9 141 ms produces a mean in
  that neighbourhood. ✓
- 367,263 req/day × 30 = 11.0M/month for this one script, against 17.72M
  account-wide across grabient-production, grabient-lite and
  grabient-data-collection. ✓

**If those percentiles are real, they change the emphasis but not the substance
of this report,** in two opposite directions:

1. **Reassuring:** no real traffic is currently touching the expensive paths. A
   p99.9 of 141 ms against renders I measured at 2,376–13,116 ms means fewer than
   1 in 1,000 requests is even a cold PNG render. §6 rows 1 and 2 are therefore
   *latent* risks — the multipliers are real and the URLs are public, but nobody
   is pulling the trigger yet. That is consistent with the $3.97 bill.
2. **Unresolved:** a p99.9 of 141 ms says nothing about whether my 13.1 s request
   was *billed* as 13.1 s of CPU, because ~12 probe requests sit far out in the
   tail of 367k. The `wrangler tail` check above is still the only way to know,
   and it is still the highest-value ten minutes available.

I have deliberately **not** revised any arithmetic in §2 or §3 on the strength of
a document I did not verify.

### 5.5 Free-zone rate limiting

[waf/rate-limiting-rules](https://developers.cloudflare.com/waf/rate-limiting-rules/):
Free gets **1 rule**, **10-second counting period only**, **10-second mitigation
only**, **IP-only counting**, expression fields limited to **Path and Verified
Bot**. Pro: 2 rules, up to 1 minute. Business: 5 rules, up to 10 minutes.

**Cache Reserve** ([cache/advanced-configuration/cache-reserve](https://developers.cloudflare.com/cache/advanced-configuration/cache-reserve/))
requires a paid zone plan and is billed like R2; standard edge caching stays free.
Not applicable on a Free zone.

---

## 6. Prioritized risk table

Ranked by **expected loss** — probability × impact — not by theoretical maximum.
The last two rows are large numbers that probably will not happen; the first three
are small numbers that plausibly will.

| # | Risk | What it would take to trigger | Worst-case cost | Mitigation | Where |
|---|---|---|---|---|---|
| **1** | **`angularSwatches` blur is a 6× CPU multiplier on an already-public parameter.** `feGaussianBlur` over the whole canvas; cost tracks pixel area, not content — steps=2 costs the same as steps=50 [measured] | **Nothing.** Any crawler that reads `robots.txt`, which advertises `?style=`. One exempt bot already does 140k req/day | **$222/mo** at current bot volume; $200/mo of that is pure blur | Delete the filter. `stdDeviation="0.3"` is a hairline-seam fix worth ~0.3 px; the wedge-overdraw trick used by `angularGradient` (`svg.ts:282-285`) solves the same problem for free | **code** — `packages/data-ops/src/gradient-gen/svg.ts:349-353`, then `pnpm build:data-ops` |
| **2** | **`w`/`h` disable the KV cache**, so every sized render is a fresh rasterization forever. `llms.txt` teaches agents to use them | An agent following the published guide, or one adversary with a VPS | **$752/mo** (bot volume) · **$231/day** (one non-exempt IP at the rate-limit ceiling) | Two lines: (a) cap **area**, not just each side — reject or clamp when `w*h > ~1.0 Mpx`; (b) round `w`/`h` to a small allow-list (e.g. 400/800/1200/1600) and include them in the KV key so sized renders cache too | **code** — `apps/web/src/seo.ts:288-294` (clamp) and `:550-553`, `:583-586` (key) |
| **3** | **No spend visibility until the invoice.** No cap exists anywhere [docs §5.1] | Any of rows 1–2 going unnoticed for a month | Unbounded, but bounded in practice by how long it goes unseen | Set a **budget alert at $8** (a $10 default likely already exists and is too loose to notice a 4× jump). Informational only — but it is the only account-level signal that exists | **dashboard** — Billing → Notifications |
| **4** | **`limits.cpu_ms` is not demonstrably working.** A 13.1 s request returned 200 [measured] | Already true | Determines whether rows 1–2 cost 1× or 3× | `wrangler tail --format json`, fire one heavy request, read `cpuTime`. Then set `cpu_ms` to ~2000 — above the 606 ms OG card and the ~1 s list render, below every pathological case | **wrangler config** — `apps/web/wrangler.jsonc:53`, after verifying with tail |
| **5** | **Verified bots are exempt from the rate-limit rule** (`not cf.client.bot`) | Already true | Removes the only volume brake for ~17% of traffic | Drop `not cf.client.bot` from the expression. 429 is the correct signal to a crawler — Google treats it as overload and backs off. Keep 300/10 s so humans are unaffected | **dashboard** — Security → WAF → Rate limiting rules |
| **6** | **Unbounded embedding input** on `/api/png/query` and `/api/og/query`. A 2,099-character query returned 200 [measured]; the HTML route correctly 404s | Anyone; one URL | Small in dollars (Workers AI price UNVERIFIED), but it is an uncapped path to a paid model | Apply `SEARCH_QUERY_MAX_LENGTH` in both handlers, exactly as `queryFromParam` already does | **code** — `apps/web/src/seo.ts:570` and `:642`; cap is at `semantic-search.ts:24` |
| **7** | **`llms.txt` and `robots.txt` publish the expensive surface**, including "`w=9999` silently renders at 2400" | Already live | Force-multiplies rows 1 and 2 | Stop advertising `w`/`h` and `style` on the uncached paths; document only the cached default. Correct the rate-limit claim at `llms.txt:218` — verified bots are exempt | **code** — `apps/web/src/seo.ts:80-88` (robots), `apps/web/public/llms.txt:38,44,86,193-197,218` |
| **8** | **Novel-query search cost**: 1 AI call + 1 Vectorize query + 2 KV writes each, unbounded key space | A crawler generating query strings | **$581/mo** at bot volume (Vectorize $32, KV $37, CPU $511) | Vectorize free tier is only 65,104 queries/month — worth an alert. Consider a bloom/allow-list so only sitemap-published queries reach Vectorize; everything else renders from a static fallback | **code** — `apps/web/src/semantic-search.ts:212-267`; gate exists at `popular-searches.ts` (`isPublishableQuery`) |
| **9** | **KV writes on the default-size PNG path**, unbounded key space, $5.00/M | Seed enumeration | **$16/mo** at bot volume; $100/mo needs ~700k novel renders/day | Acceptable as-is. If tightened, the 7-day TTL (`seo.ts:469`) already bounds storage | **code** — `apps/web/src/seo.ts:485-497` |
| **10** | **One DO instance per source IP** on `/api/contact`, created before Turnstile, storage never deleted | Unauthenticated POSTs with a well-formed body | Cents. Structural, not financial | Move the rate-limit check after Turnstile verification, or key the DO on a coarser bucket (e.g. /24) | **code** — `apps/web/src/index.ts:670` vs `:693`; `rate-limit.ts:59,78` |
| **11** | **`/e` PostHog relay is unauthenticated**; `/api/settings/username/check` is unauthenticated and unthrottled | Anyone | Cents in Workers requests; the concern is abuse-of-domain and username enumeration | Both are covered by the CF rate-limit rule's `/api/` prefix — except `/e`, which is not. Add `/e` to the rule's path match | **dashboard** — same rule as row 5 |
| **12** | **Deliberate denial-of-wallet from a botnet** | A motivated adversary with 100+ IPs, sustained | **$23,092/day** at 100 IPs · $231k/day at 1,000 | Rows 1, 2 and 4 reduce this by 20–40× at the source, which is the only leverage available — there is no spend cap to fall back on (§5.1). Beyond that: Cloudflare Pro ($20/mo) buys 2 rate-limit rules and a 1-minute window, which is the first real volume brake | **dashboard** — zone plan upgrade, only if row 12 ever materializes |
| — | ~~D1 row reads~~ | 3.85M cold list renders/month to cost $0.01 | Not a risk | None needed | — |
| — | ~~R2~~ | Bucket is 124 MB = $0.002/mo | Not a risk | None needed | — |

### If the owner does exactly three things

1. **Delete the `feGaussianBlur` from `angularSwatches`** (`svg.ts:349-353`). One
   line, removes a 6× multiplier from the most exposed route, and by the evidence
   above it is buying almost nothing visually — the sibling `angularGradient`
   solves the same seam problem with geometry.
2. **Bound pixel area, not just side length** (`seo.ts:288-294`). `w*h > 1.0 Mpx`
   → clamp. Turns the 8.9 s worst case into roughly 0.5 s and makes row 2 vanish.
3. **Set a budget alert at $8** (dashboard). It cannot stop anything, but at
   $5.60/month projected it converts any of the above into an email within a day
   instead of a surprise at month end.

Those three cover the top of the expected-loss ranking. Everything else is
tidying.

---

## Appendix: what I could not verify

| Claim | Why not |
|---|---|
| Billed CPU-ms per request | No Workers Analytics access from here. All CPU figures are wall-clock TTFB minus a 94 ms network baseline. Resolve with `wrangler tail --format json` (§5.4). |
| Whether `limits.cpu_ms: 10000` is live on the deployed version | `wrangler versions view` does not print a `limits` field. The config is committed and predates the deploy, but a 13.1 s 200 is inconsistent with it. |
| Whether CPU burned before a 1102/503 is billed | No Cloudflare page states it either way. |
| `@cf/google/embeddinggemma-300m` price | Model page exists on developers.cloudflare.com with no pricing; absent from the pricing table. All Workers AI dollar figures are therefore analogies to `bge-small-en-v1.5`, explicitly flagged where used. |
| Whether AI Gateway spend limits can gate a Workers AI *binding* | No page found stating it either way. |
| Any Cloudflare-side global concurrency or abuse ceiling | Not documented. The §3.3 botnet arithmetic assumes none, which may overstate it. |
| Vectorize pricing formula on the official page | The page's formula puts *stored* vectors inside the *queried*-dimension term, contradicting its own rate table. I used the rate table ($0.01/M queried dims, 50M included). |
| Whether the 503s are memory or CPU eviction | Inferred from timing (fast failure, ~0.5–1.0 s) and the 128 MB isolate limit against a 23 MB/buffer blur. Not confirmed. |
| Everything in `measured-consumption-2026-08-17.md` and `pricing-and-spend-controls.md` | Written by someone/something other than me during this session. Not verified, not relied upon. See §5.4. |

**Probe cost disclosure:** this audit issued roughly 40 requests to grabient.com,
of which ~12 were deliberately expensive renders totalling ~110 seconds of CPU —
about **$0.0022**. Fresh seeds and queries were used throughout so nothing
displaced a real cache entry. The only production writes were KV cache entries
that expire in 7 days (renders) and 3 days (searches).
