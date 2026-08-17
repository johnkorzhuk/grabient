# Cloudflare cache architecture for grabient.com

Research date: 2026-08-17. Every claim below is either cited to a current
Cloudflare doc page or measured live against production with `curl`. Measured
facts are marked **[measured]**. Where the docs are ambiguous I say so instead of
guessing.

> **Read this first.** The headline conclusion is that the cache is working, and
> that the Security Analytics numbers in the brief are not measuring the cache
> that this site actually uses. Sections 0 and 1 explain why. Most of the
> "obvious" fixes (Tiered Cache, Cache Rules, Cache Reserve) are documented to
> have **no effect** on this architecture. The two changes worth making are small
> and are in sections 9.1 and 9.3.

---

## 0. The framing correction that governs everything else

`apps/web` is a Worker attached to `grabient.com`. **There is no origin server.**
The Worker *is* the origin, and it runs in the Cloudflare data center nearest the
visitor.

So "364.82k served by origin (77%)" does not mean what it means on a normal CDN
deployment. Cloudflare defines the dimension as:

> **Served by Cloudflare**: Requests served by the Cloudflare global network such
> as cached content and redirects.
> **Served by origin**: Requests served by your origin server.
>
> — [Security Analytics](https://developers.cloudflare.com/waf/analytics/security-analytics/)

On this stack "served by origin" reduces to "the Worker ran". There is no slow
backend being protected, no egress bill, no origin capacity to conserve. The only
things a miss actually costs are:

- one Workers request at $0.30/M (billed either way — see §2),
- the CPU the Worker burns, at $0.02/M CPU-ms,
- and TTFB for that one visitor.

At the stated volumes that is $2.40 + $0.64/month for the whole account. The
brief is right that cost is not the binding constraint. **Neither is hit rate,
per se** — what matters is CPU-per-miss and latency-per-miss, and the repo
already handles the expensive case well (§8).

### The cache is, in fact, working [measured]

```
GET https://grabient.com/                       cf-cache-status: HIT   age: 81
GET https://grabient.com/newest                 cf-cache-status: HIT   age: 71
GET https://grabient.com/{seed}                 cf-cache-status: HIT   age: 2302
GET https://grabient.com/{seed}.png             MISS then HIT (269,748 bytes)
GET https://grabient.com/api/og?seed=…&v=16     MISS then HIT
GET https://grabient.com/robots.txt             cf-cache-status: HIT   age: 56175
GET https://grabient.com/sitemap.xml            cf-cache-status: HIT   age: 57290
GET https://grabient.com/favicon-32x32.png      cf-cache-status: HIT
```

Every cacheable surface I probed served a `HIT` on repeat. Whatever the
dashboard is counting, it is not "the Workers cache is failing".

> **Note on what production is running.** `/{seed}.json`, `/sitemap-pages.xml`
> and `/sitemap-palettes.xml` all return 404 in production [measured], and
> `/sitemap.xml` serves a flat urlset rather than the index that
> `src/seo.ts` builds in the working tree. The deployed Worker predates the
> uncommitted changes in the working tree. All live measurements here describe
> the **deployed** version. This matters again in §7.

---

## 1. `Bypass` and `None` — what actually produces each

### 1.1 The measurement is probably not measuring the right cache

This site sets `"cache": { "enabled": true }` in `wrangler.jsonc`. That is
**Workers Caching**, which Cloudflare is explicit is a *different cache* from the
zone cache:

> Workers Cache is **your Worker's cache**. It is owned by your Worker, operated
> by your Worker, and private to your Worker. […] **No zone configuration for
> caching applies to Workers Caching.**
>
> — [Workers Cache](https://developers.cloudflare.com/workers/cache/)

> Workers Caching is **your Worker's cache**. When debugging, look at your
> Worker's traces and responses. Zone-level cache controls and dashboards operate
> on a separate cache and will not affect what Workers Caching stores or serves.
>
> — [Debugging](https://developers.cloudflare.com/workers/cache/debugging/)

And the Workers Cache limitations page lists **"Cache Analytics in Workers
Observability"** under *Coming soon*
([Limitations](https://developers.cloudflare.com/workers/cache/limitations/)).

Security Analytics is a **zone** product, and it is **sampled**:

> The Security Analytics dashboard uses [sampled data], except when showing raw
> logs. […] Cloudflare calculates the top statistics from a sample of requests in
> the selected time frame.
>
> — [Security Analytics](https://developers.cloudflare.com/waf/analytics/security-analytics/)

So the 475.61k / 244.12k / 108.51k / 82.13k figures are **extrapolations from a
sample**, produced by a dashboard for a cache layer that Cloudflare documents as
separate from the one this Worker uses, in a period when Cloudflare's own
Workers-cache analytics does not yet exist.

**Cloudflare does not document how Workers Caching statuses surface in zone
analytics.** I could not resolve this from the docs and I am not going to guess.
The honest position: treat those four numbers as a rough traffic-shape signal,
not as a cache-tuning target.

**Measure this instead:**
1. `curl -sI <url>` and read `Cf-Cache-Status` — "Every response carries it, and
   its value tells you exactly what happened for that request"
   ([Debugging](https://developers.cloudflare.com/workers/cache/debugging/)).
2. Per-invocation cache-hit information in the Workers observability dashboard —
   documented as the other primary surface, and the repo already has
   `observability.enabled` with `head_sampling_rate: 1`.

### 1.2 `NONE` / `UNKNOWN` — definition

> **NONE/UNKNOWN**: Cloudflare generated a response that denotes the asset is not
> eligible for caching.
>
> — [Cloudflare cache responses](https://developers.cloudflare.com/cache/concepts/cache-responses/)

The same page enumerates the causes, and the first one is decisive:

> A Worker generated a response without sending any subrequests. In this case,
> the response did not come from cache, so the cache status will be
> none/unknown. A Worker request made a subrequest (fetch). In this case, the
> subrequest will be logged with a cache status, while the main request will be
> logged with none/unknown status (the main request did not hit cache, since
> Workers sits in front of cache). […] a WAF custom rule was triggered to block a
> request.

That description is the **pre-Workers-Caching** model, where the Worker ran
ahead of the cache. It is almost exactly a description of this site's traffic.
**The most likely reading of the 82.13k `None` bucket is "the zone layer saying
*this went to a Worker*"** — an artifact of the measurement, not a fixable cache
defect. `NONE` and `UNKNOWN` are not distinguished in that doc; they are listed
as a single value.

Not fixable by configuration. The fix, if you want the number to go away, is to
stop reading the zone dashboard for this.

### 1.3 `BYPASS` — definition and the exhaustive cause list

> **BYPASS**: Cloudflare considered the asset eligible for cache at request time
> […] but the origin response was ultimately not cacheable.
>
> — [Cloudflare cache responses](https://developers.cloudflare.com/cache/concepts/cache-responses/)

`BYPASS` is a **response-time** decision (the Worker already ran). `DYNAMIC` is
the **request-time** equivalent ("Cloudflare determined at request time that the
asset is not eligible for cache"). For Workers Caching specifically, the trigger
list is closed:

> * The response includes a `Set-Cookie` header (unless `Cache-Control` includes
>   `private="set-cookie"` or `no-cache="set-cookie"` …).
> * The request includes an `Authorization` header. The response is only stored
>   if `Cache-Control` includes `public`, `must-revalidate`, or `s-maxage` …
> * The response `Cache-Control` header includes `private` or `no-store`.
>
> When any of these apply, `Cf-Cache-Status` is `BYPASS` and your Worker runs on
> every request.
>
> — [Configuration § Automatic bypass conditions](https://developers.cloudflare.com/workers/cache/configuration/#automatic-bypass-conditions)

Plus method and status:

> Only `GET` and `HEAD` requests are cached. `POST`, `PUT`, `PATCH`, `DELETE`,
> and other methods always invoke your Worker. […] Responses with status codes
> that are not cacheable by default (for example, `401`, `403`, `500`) are not
> stored unless you explicitly mark them.
>
> — [Limitations](https://developers.cloudflare.com/workers/cache/limitations/),
>   [Debugging](https://developers.cloudflare.com/workers/cache/debugging/)

And one important second-order effect:

> **Collapsing does not apply to uncacheable responses.** If the Worker's
> response is uncacheable (`BYPASS`, `DYNAMIC`), each request gets its own
> invocation.
>
> — [Workers Cache § Request collapsing](https://developers.cloudflare.com/workers/cache/#request-collapsing)

### 1.4 Which of those this codebase actually produces

Free-plan default cacheable-extension lists are **irrelevant here** — the docs
say the zone's "default cached-file-extensions list" has no effect on Workers
Caching ([Limitations](https://developers.cloudflare.com/workers/cache/limitations/)).
So the entire `BYPASS` population comes from the Worker's own headers, methods,
or an `Authorization` header on the request.

Every `no-store` producer in `apps/web/src/index.ts`:

| Source | Line | Trigger | Plausible bot volume |
|---|---|---|---|
| **HTTP→HTTPS redirect middleware** | 137–147 | `NO_STORE` on the 301 | **High — see §1.5** |
| `/api/auth/*` | 756–766 | forced `no-store` | Low (bots don't sign in) |
| `/api/likes`, `/api/like-info`, `/api/like-counts` | 773–812 | `private, no-store` | Client JS only |
| `/api/likes/toggle`, `/api/contact`, `/api/settings/*` | 813+, 621, 970+ | POST → method bypass | Negligible |
| `/saved`, `/settings`, `/login` | 874–893, 1061 | `private, no-store` | Low |
| `/e`, `/e/*` PostHog proxy | 744–746 | POST, and upstream headers passed through | Client JS only |
| `/assets/*` 404 fallthrough | 274–276 | `NO_STORE` (deliberate, see comment) | Transient, during deploys |
| `/sitemap-palettes.xml` 503 path | 1180–1186 | `NO_STORE` | Only on D1 failure |

Everything else in the app sets an explicit cacheable policy. **Verified: none of
the cacheable HTML routes call `getSession`**, so no `Set-Cookie` lands on a
cacheable response — the classic self-inflicted `BYPASS` is already avoided here.

Given the traffic is 464.22k desktop vs 10.44k mobile (i.e. overwhelmingly bots,
which do not execute JS and do not sign in), the JS-driven and auth rows cannot
account for 108k/day. Which leaves one candidate that can, and it is real:

### 1.5 The one confirmed, fixable `BYPASS` source: plain-HTTP requests [measured]

```
GET http://grabient.com/newest?page=7
  HTTP/1.1 301 Moved Permanently
  Location: https://grabient.com/newest?page=7
  CF-Cache-Status: BYPASS            <-- Worker ran, produced an uncacheable 301
  Cache-Control: private, no-store
```

Every plain-HTTP request to a path that is not already in the cache costs a full
Worker invocation that produces nothing cacheable and does not collapse with its
neighbours. **This is a confirmed contributor to the `Bypass` bucket, and it is
removable.**

There is a second, more surprising half to this. The Workers cache key does not
include the hostname, and — as the code comment at `index.ts:141-143` already
suspected — it evidently does not include the scheme either:

```
GET http://grabient.com/newest
  HTTP/1.1 200 OK
  CF-Cache-Status: HIT               <-- the cached HTTPS response, over plain HTTP
  Age: 89
  Strict-Transport-Security: max-age=31536000; includeSubDomains
```

The Worker's redirect middleware **never runs** for a plain-HTTP request to an
already-cached path, because the cache answers first. So `http://grabient.com/`
and every popular path return `200`, not `301`.

The docs confirm the key composition:

> The cache key **does not** include: HTTP method, hostname, or request body.
>
> — [Cache keys](https://developers.cloudflare.com/workers/cache/cache-keys/)

This is not a data leak — those pages are anonymous, identical for every visitor,
and carry no cookies (the `no-store` fix from the documented incident is
correct and still doing its job in the other direction). But it is:
- a canonicalization hole (`http://` and `https://` both return 200), and
- a guarantee that the Worker's own redirect can never fully solve the problem,
  because the cache sits in front of it.

**Fix: enable "Always Use HTTPS" on the zone** (Dashboard → SSL/TLS → Edge
Certificates). It is a zone-level edge redirect available on all plans:

> Always Use HTTPS redirects all your visitor requests from `http` to `https`,
> for all subdomains and hosts in your application. […] Cloudflare recommends
> not performing redirects at your origin web server.
>
> — [Always Use HTTPS](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/)

**Ambiguity, stated plainly:** I could not find a current Cloudflare doc that
states the ordering of Always Use HTTPS relative to a Worker and to Workers
Caching. The Security Analytics doc lists "redirects" under *served by
Cloudflare*, which is suggestive but not proof. **Verify empirically after
enabling** (`curl -sI http://grabient.com/newest` must return 301), and keep the
Worker's own redirect as a fallback — it is already correct and costs nothing on
the HTTPS path.

### 1.6 `MISS` at 244k is structural, and mostly not fixable

The seed space is unbounded. A crawler that visits each URL exactly once cannot
produce a `HIT` for it, by construction. No cache configuration changes that.

The three things that convert `MISS` → `HIT` are: repeat visits inside the TTL,
tiering (already on by default — §4), and not resetting the cache on deploy
(§3). None of them help a genuinely one-shot URL.

The correct target is therefore **cost per miss**, not miss rate. See §8.

---

## 2. Workers Static Assets: billing and cache behavior

### 2.1 The default: free

> Requests to static assets are free and unlimited. Requests to the Worker script
> (for example, in the case of SSR content) are billed according to Workers
> pricing. […] There is no additional cost for storing Assets.
>
> — [Billing and Limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)

### 2.2 …except that enabling Workers Caching removes that exemption

This is the non-obvious part, and it applies to this repo today:

> **Caching bills requests that are normally free.** When caching is enabled,
> every request to your Worker is charged at the standard Workers request rate,
> including requests that are normally free: static asset requests and
> worker-to-worker invocations through service bindings or `ctx.exports`.
>
> — [Workers Cache § Pricing](https://developers.cloudflare.com/workers/cache/#pricing)

With the full table:

| Request type | Request charge | CPU time charge |
|---|---|---|
| Cache HIT (Worker does not run) | Standard rate | Not billed |
| Cache MISS (Worker runs) | Standard rate | Billed |
| Cache BYPASS (Worker runs) | Standard rate | Billed |
| Static asset request | Standard rate | Not billed |

So `"cache": { "enabled": true }` converted this project's asset requests from
free to $0.30/M. At this volume that is cents. **Do not act on it** — the CPU
savings from cache hits are worth far more than the asset-request line item. Just
know that it happened, so the request count in billing isn't a mystery later.

Live confirmation that assets do flow through this path: `/favicon-32x32.png`
returns `cf-cache-status: HIT` **[measured]** — a plain static asset carrying a
Workers-cache status.

### 2.3 Does the current config route asset requests through the Worker? No.

`wrangler.jsonc` sets only `"assets": { "directory": "./dist/client" }` — no
`run_worker_first`, no `not_found_handling`, no `html_handling`.

> `run_worker_first = false` (default) will serve any static asset matching a
> request, while `run_worker_first = true` will unconditionally invoke your
> Worker script.
>
> — [Configuration and Bindings](https://developers.cloudflare.com/workers/static-assets/binding/)

> If you have both static assets and a Worker script configured, Cloudflare will
> first attempt to serve static assets if one matches the incoming request. […]
> If an appropriate static asset is not found, Cloudflare will invoke your Worker
> script.

`not_found_handling` unset means unmatched requests fall through to the Worker,
which is exactly what the `/:seed` catch-all needs. Setting it to `404-page` or
`single-page-application` would break the site.

**Both defaults are correct as-is. Change nothing here.**

(Note for the free-tier caveat in the docs: `run_worker_first` requests get a 429
rather than falling back to assets when free limits are exceeded. Not applicable
— this account is on Workers Paid — and `run_worker_first` isn't set anyway.)

### 2.4 Default asset `Cache-Control`, and two files that are missing theirs

> * **`Cache-Control: public, max-age=0, must-revalidate`** — Sent when the
>   request does not have an `Authorization` or `Range` header […]
> * **`ETag`** — Its value is a hash of the static asset file…
>
> — [Headers](https://developers.cloudflare.com/workers/static-assets/headers/)

`_headers` overrides this. Critically:

> Custom headers defined in the `_headers` file are **not** applied to responses
> generated by your Worker code.

So `_headers` cannot touch `/{seed}.png` — which the repo's own comment already
gets right.

Live, two files are still on the default **[measured]**:

```
GET /llms.txt   cache-control: public, max-age=0, must-revalidate   cf-cache-status: REVALIDATED
GET /ads.txt    cache-control: public, max-age=0, must-revalidate   cf-cache-status: REVALIDATED
```

`must-revalidate` means the entry is stored but every single request consults the
asset server before serving — `REVALIDATED` rather than `HIT`. The working tree's
uncommitted `_headers` already fixes `llms.txt` (`max-age=3600`); `ads.txt` still
has only a `Content-Type` line and no `Cache-Control`.

Effect of fixing: two small files stop revalidating on every request. The cost
saving is **negligible** and I would not do it for that reason; do it because
`llms.txt` is a file you are actively advertising to AI crawlers in `robots.txt`
and it should be cheap for them to fetch.

Separately: `must-revalidate` also disables `stale-while-revalidate` and
`stale-if-error` (§3.3) — another reason not to leave assets on the default.

---

## 3. The `cache` key in `wrangler.jsonc`

### 3.1 What `enabled: true` does

> Workers Cache lets Cloudflare return cached HTTP responses from your Worker
> **without executing your Worker code**. […] With caching enabled, Cloudflare
> checks the cache before running your Worker.
>
> — [Workers Cache](https://developers.cloudflare.com/workers/cache/)

Requires Wrangler ≥ 4.69.0. The repo pins `^4.112.0`. ✔

Two things it gives you for free that the Cache API does not:

- **Request collapsing.** "When many requests for the same cache key arrive
  simultaneously at a Cloudflare data center and the response is not yet cached,
  Cloudflare runs your Worker **once** and serves the resulting response to every
  waiting request." Streaming responses collapse too.
- **Tiering** — see §4.

### 3.2 Header precedence

> 1. `cloudflare-cdn-cache-control` — Cloudflare-specific, highest precedence.
>    Consumed by Cloudflare and stripped from the response returned to clients.
> 2. `cdn-cache-control` — standard header for CDN-only directives. Respected by
>    Cloudflare and passed through to downstream CDNs.
> 3. `Cache-Control` — standard HTTP header.
>
> — [Configuration § Header precedence](https://developers.cloudflare.com/workers/cache/configuration/#header-precedence)

The repo's use of `CDN-Cache-Control` for edge TTL + `Cache-Control` for browser
TTL is the documented-correct pattern. ✔

Heuristic freshness for header-less responses is real, and the repo's insistence
on explicit headers everywhere is correct. The exact defaults:

| Status | Default TTL |
|---|---|
| 200 / 203 / 204 | 7200 s (2 hours) |
| 300 / 301 | 1200 s (20 minutes) |
| 404 / 410 | 180 s (3 minutes) |
| 405 / 414 / 501 | 60 s (1 minute) |

— [Configuration § Cache-Control semantics](https://developers.cloudflare.com/workers/cache/configuration/#cache-control-semantics)

The "2h heuristic on a header-less 200" that caused the `get-session` incident
recorded in `apps/web/README.md` is confirmed, verbatim, in current docs.

### 3.3 A real bug class the repo is currently exposed to: `s-maxage`

> If your response includes any of `s-maxage`, `must-revalidate`, or
> `proxy-revalidate`, the stale-serving behavior is disabled and Cloudflare will
> block on a fresh revalidation when the response expires. **The same is true for
> `stale-if-error`.**
>
> — [Configuration](https://developers.cloudflare.com/workers/cache/configuration/#choose-ttl-and-stale-while-revalidate-values)

> If you do not set `stale-if-error` explicitly, **and your response does not
> carry `s-maxage`, `must-revalidate`, or `proxy-revalidate`**, Cloudflare's
> default behavior is to serve stale responses on Worker error indefinitely.

Now look at what the two most CPU-expensive endpoints send **[measured]**:

```
GET /{seed}.png       cache-control: public, max-age=86400, s-maxage=604800
                      cdn-cache-control: max-age=604800
GET /api/og?seed=…    cache-control: public, max-age=86400, s-maxage=604800
                      cdn-cache-control: max-age=604800
```

Source: `apps/web/src/seo.ts` `pngResponseHeaders()` and
`apps/web/src/palette-json.ts` `JSON_HEADERS`.

The `s-maxage=604800` is **redundant** — `CDN-Cache-Control: max-age=604800`
already sets the edge TTL and outranks `Cache-Control` — and it carries a
documented cost: it disables the default "serve the last good render if the
Worker fails" behavior on exactly the endpoints where a resvg failure is most
likely and most expensive to retry.

`SEED_HEADERS` and `LIST_HEADERS` do **not** carry `s-maxage`, so their
`stale-while-revalidate` works correctly. Only the PNG/JSON pair is affected.

**Ambiguity, stated plainly:** the docs say "if your response includes any of
`s-maxage`…", and do not say whether that check runs against the raw header set
or against the effective directives after `CDN-Cache-Control` precedence has been
applied. So I cannot prove the `s-maxage` is currently doing harm. But it is
provably buying nothing, and removing it is free. Recommended in §9.

### 3.4 `cross_version_cache: false` — is the version really in the key? Yes.

> By default, the **Worker version is part of the cache key**. Each deployed
> version has its own isolated cache, so a new deployment starts from an empty
> cache and never serves responses written by a previous version. […] The
> trade-off is that **cache hit rate resets on every deployment**.
>
> — [Configuration § Cross-version caching](https://developers.cloudflare.com/workers/cache/configuration/#cross-version-caching)

The comment in `wrangler.jsonc` is accurate in every particular. `false` is also
the documented default, so pinning it is documentation rather than configuration.

`cross_version_cache: true` requires Wrangler ≥ 4.107.0 (repo has 4.112.0 ✔).

**What does `false` actually cost here?** Concentrated almost entirely in the
7-day-TTL PNG/JSON responses; the HTML TTLs (300 s and 3600 s) are short enough
that a deploy barely matters. And the repo **already mitigates the PNG case** via
`OG_IMAGE_CACHE` KV keyed on `OG_RENDER_VERSION` rather than Worker version.
Confirmed live **[measured]**:

```
GET /{seed}.png    cf-cache-status: MISS    x-cache: HIT
```

Edge missed, Worker ran, KV hit, **no resvg render**. The layered design works
exactly as the comment in `seo.ts:440-447` claims. So the marginal cost of
`cross_version_cache: false` is *one KV read plus response assembly per PNG per
deploy*, not a re-render. That is small.

§7 and §9.4 discuss whether flipping it is worth it. Short answer: probably not,
and there is a newly-relevant risk that makes it worse than it looks.

---

## 4. Tiered Cache — already on, and not via the zone

**This is the section most likely to change your plan.** Workers Caching is
tiered by default, and the zone's Tiered Cache setting does not touch it.

> Workers Caching is **tiered by default**. […] **Lower tier** — a cache in the
> Cloudflare data center closest to the eyeball. […] **Upper tier** — a smaller
> set of data centers that every lower tier consults on a miss. […] This is the
> same topology that powers Tiered Cache for zones, applied automatically to your
> Worker. **You do not configure it.**
>
> — [Workers Cache § Tiered cache](https://developers.cloudflare.com/workers/cache/#tiered-cache)

> the first request for a given cache key anywhere on Earth populates the upper
> tier. Every later request, from any Cloudflare data center, can be served from
> the upper tier without running your Worker — even if the lower tier at that
> location has never seen the request before.

And explicitly, from the limitations page's zone-feature table: *Custom tiered
cache topologies* → "Workers Caching uses a generic tiered cache topology by
default."

Zone Tiered Cache availability, for completeness:

| | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Tiered Cache | Yes | Yes | Yes | Yes |
| Smart Topology | Yes | Yes | Yes | Yes |
| Generic Global Topology | No | No | No | Yes |
| Regional Tiered Cache | No | No | No | Yes |
| Custom Topology | No | No | No | Yes |

— [Tiered Cache](https://developers.cloudflare.com/cache/how-to/tiered-cache/)

So yes, Tiered Cache and Smart Tiered Cache are free-plan available. **Enabling
them would do nothing for this site's Worker responses.** The only thing they
could affect is `fetch()` subrequests to proxied hostnames on this zone — and
this app's subrequests go to `api.github.com`, PostHog, and bindings, none of
which are on the zone.

### When tiering does *not* help — honestly

Upper-tier consolidation pays off when **two or more lower tiers want the same
key**. It converts N data-center misses into 1 Worker run.

For this workload, a large share of requests are a crawler fetching a distinct
seed URL exactly once, globally. For those, the upper tier has nothing to
consolidate: request 1 populates it, and request 2 for that key never comes. The
mechanism is real and it is already on, but for the one-shot tail it contributes
approximately zero.

Where it *does* help here: the ~866 stored palettes, the list pages, `/`,
`/newest`, the sitemaps, `robots.txt`, and any seed a human actually shares —
i.e. exactly the URLs where you saw `HIT` with a large `Age` in §0.

**Action: none.** Do not enable zone Tiered Cache expecting an effect.

---

## 5. Cache Rules on the free plan — available, and inert for this site

### 5.1 What a free zone gets

| | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Cache Rules available | Yes | Yes | Yes | Yes |
| Number of rules | **10** | 25 | 50 | 300 |

— [Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/)

Available on **all plans**, including Free: Cache eligibility (Cache
Everything / Bypass), Edge TTL, Browser TTL, **Ignore Query String**, **Sort
Query String**, Cache Deception Armor, Device Type in the cache key, Serve Stale,
Respect Strong ETags, Origin Error Page Pass-Through.

**Enterprise only** ([Cache Keys](https://developers.cloudflare.com/cache/how-to/cache-keys/)):
query-string *include specific* / *exclude specific* parameters, custom headers
in the key, cookies in the key, host selection, and user features
(`device_type` beyond the basic toggle, `geo`, `lang`).

### 5.2 The specific question asked: can a free zone normalize/sort query strings or exclude specific params?

- **Sort query string: yes, free.** Listed as Free/Pro/Business/Enterprise.
- **Ignore query string entirely: yes, free.** (`exclude: "*"`.)
- **Exclude *specific* params (e.g. drop `utm_*`, keep `style`): no — Enterprise only.**

### 5.3 …and none of it applies here

> **No zone configuration for caching applies to Workers Caching.** Cache Rules,
> Cache Response Rules, Page Rules, cache level settings, the zone's default
> cached-file-extensions list, and every other zone-level cache control have no
> effect on a Worker's cache.
>
> — [Workers Cache](https://developers.cloudflare.com/workers/cache/)

The limitations page repeats it as a mapping table: *Cache key customization in
Cache Rules* → "Workers Caching has its own key composition […] Shape the key by
shaping the request."

So on grabient.com, Cache Rules are a dead end for the Worker's own responses.
**The Worker is the only place to normalize the cache key**, and — to the repo's
credit — that is already what `normalizeSearch()` in `src/search.ts` does, via a
301 to the canonical form. Given free-plan constraints that is the correct
design, not a workaround.

One real gap it leaves, though. The Workers cache key includes the query string
and **parameter order matters**:

> The **path and query string** of the request URL. Query parameter order
> matters — `?a=1&b=2` and `?b=2&a=1` are different cache keys.
>
> — [Cache keys](https://developers.cloudflare.com/workers/cache/cache-keys/)

`normalizeSearch()` canonicalizes and orders the five `KNOWN_KEYS`
(`style, steps, angle, page, limit`) but **preserves unknown parameters verbatim,
in their original order**. So `?utm_source=x`, `?fbclid=…`, `?ref=…` each mint a
distinct cache key on top of an already-unbounded URL space — and a distinct
crawlable URL. Free Cache Rules cannot strip specific params, and would not apply
if they could. The fix belongs in `normalizeSearch()`. See §9.5; magnitude
unknown, worth measuring before doing.

---

## 6. The Workers Cache API (`caches.default` / `caches.open`)

### 6.1 Relationship to Workers Caching — they are unrelated stores

> The Cache API is a separate programmatic cache store. It is **independent** of
> Workers Caching — operations on one do not affect the other, and
> `ctx.cache.purge()` is what invalidates Workers-Caching entries.
>
> For new Workers, prefer Workers Caching. The Cache API, by design, is a
> lower-level primitive:
> * It does not read through — responses are only cached when your Worker
>   explicitly calls `put()`, and **every request still executes your Worker on
>   the way in**.
> * It does not collapse concurrent requests.
> * It does not participate in tiered caching.
>
> — [Limitations](https://developers.cloudflare.com/workers/cache/limitations/)

### 6.2 Documented gotchas

From [Cache](https://developers.cloudflare.com/workers/runtime-apis/cache/):

- **Per data center, no replication.** "The Cache API is available globally but
  the contents of the cache do not replicate outside of the originating data
  center."
- **`cache.put` is not compatible with tiered caching.**
- **`Set-Cookie`**: "Responses with `Set-Cookie` headers are never cached […] To
  store a response with a `Set-Cookie` header, either delete that header or set
  `Cache-Control: private=Set-Cookie` on the response before calling
  `cache.put()`."
- **`put()` refuses** `206 Partial Content` and `Vary: *`.
- **`match()`** does not support `ignoreSearch` or `ignoreVary` — strip query
  strings or headers at `put()` time instead.
- **`cache.delete` is local**: "only purges content of the cache in the data
  center that the Worker was invoked."
- **`stale-while-revalidate` and `stale-if-error` are not supported** with
  `cache.put` / `cache.match`.

`cf.cacheTtl` / `cf.cacheEverything` are supported on an **outgoing `fetch()` to
your origin**, but *not* on `ctx.exports.<Entrypoint>.fetch()`:

> `cf.cacheTtl` — Not supported — set the TTL by returning
> `Cache-Control: max-age=N` … `cf.cacheEverything` — Not supported — Workers
> Caching decides cacheability from the response's `Cache-Control`; there is no
> override to force-cache an otherwise uncacheable response.
>
> — [Limitations](https://developers.cloudflare.com/workers/cache/limitations/)

### 6.3 How this repo uses it — correctly

`caches.default` appears exactly once, for the GitHub star count
(`index.ts:227-267`): a 24 h entry treated as fresh for 4 h, with a stale hit
returned immediately and refreshed via `waitUntil`. That is the right primitive
for the job — it is caching a **subrequest result**, not a response, so Workers
Caching cannot do it, and per-colo scope is acceptable for a footer chip that
falls back to `0`.

One nuance worth knowing: since Workers Caching is tiered, a Worker miss may run
in the **upper tier**, where the star cache is a separate per-colo store that may
be cold. The failure mode is a slower first render, not an error. Not worth
changing.

**Nothing else in this app is a candidate.** The remaining subrequests are the
PostHog proxy (must not be cached) and bindings (D1/KV/Vectorize are not
`fetch()`, so the Cache API cannot apply).

---

## 7. Cache Reserve — no, and the math is not close

### 7.1 Availability and price

> Cache Reserve is a usage-based product […] While Cache Reserve **does require a
> paid plan**, users can continue to use Cloudflare's CDN (without Cache Reserve)
> for free.
>
> — [Cache Reserve](https://developers.cloudflare.com/cache/advanced-configuration/cache-reserve/)

| | Rate |
|---|---|
| Storage | $0.015 / GB-month |
| Class A operations (writes) | $4.50 / million |
| Class B operations (reads) | $0.36 / million |

> In most cases, a Cache Reserve **miss** will result in both one class A and one
> class B operation, and a Cache Reserve **hit** will result in one class B
> operation.

### 7.2 It is disqualified three times over

**1. Eligibility excludes all the HTML.** Assets must "Have a freshness
time-to-live (TTL) of at least 10 hours" and "Have a `Content-Length` response
header". Seed HTML is 3600 s and list HTML is 300 s — both far under 10 hours.
Only the PNG/JSON (604800 s) would qualify, and those are already covered by
`OG_IMAGE_CACHE` KV.

**2. It is a zone-cache tier, and zone cache config does not apply to Workers
Caching** (§5.3). Cloudflare documents Cache Reserve as sitting between the edge
cache and the origin; for a Worker-origin site fronted by Workers Caching, **no
current doc describes it being in the path at all**. I am flagging this as
genuinely undocumented rather than asserting either way — but combined with (1)
and (3) it does not matter.

**3. The math, at the stated volume.** 475.61k req/day ≈ **14.5M/month**.
Taking the reported miss count at face value (244.12k/day ≈ 7.43M/month):

| Line | Volume | Rate | Cost |
|---|---|---|---|
| Class A (writes, one per miss) | 7.43M | $4.50/M | **$33.44** |
| Class B (reads, one per miss) | 7.43M | $0.36/M | $2.67 |
| Class B (reads, one per hit) | 7.07M | $0.36/M | $2.55 |
| Storage — 1M distinct PNGs @ 270 KB | 270 GB | $0.015/GB-mo | $4.05 |
| | | | **≈ $42.71 / month** |

That is **4× the entire $10 budget**, and the write line alone is 3×. Even at an
implausibly generous 10% miss rate it lands near $11/month.

And the shape is the worst possible fit: an unbounded generated URL space means
you pay a **$4.50/M write for every one-shot crawler URL** and then store bytes
for a key nobody ever requests again. Cache Reserve is designed for a bounded
corpus with expensive origin egress. This is the opposite of both.

**Verdict: no. Not now, not if the zone were upgraded.**

---

## 8. Reducing CPU for the deterministic endpoints

`/{seed}.png` and `/{seed}.json` are pure functions of the URL. `palette-json.ts`
says so in its header: "Everything here is derived from the seed alone: no D1, no
Vectorize, no KV." The PNG path touches KV but no database.

### 8.1 What is already right — do not undo any of it

1. **`OG_IMAGE_CACHE` KV keyed on `OG_RENDER_VERSION`, not Worker version.**
   Verified working live: `cf-cache-status: MISS` + `x-cache: HIT`. This is the
   single highest-value piece of the whole design — it decouples the expensive
   artifact (a resvg render) from the deploy cycle, which is exactly what
   `cross_version_cache: false` would otherwise cost you.
2. **7-day `CDN-Cache-Control` on PNG/JSON**, 60 s browser TTL on HTML. Correct
   split, correct header.
3. **Only the default 1200×630 render is KV-cached** (`seo.ts:525-531`), with the
   stated reason: caller-chosen `w`/`h` is an unbounded key space. Right call.
4. **Explicit cache policy on every response including redirects.** Confirmed
   necessary by the heuristic-TTL table in §3.2.
5. **Request collapsing** comes free with `cache.enabled` and means a burst of
   crawler requests for one fresh seed produces one resvg render, not N.

### 8.2 What is left

**(a) Remove the redundant `s-maxage` (§3.3).** Restores serve-stale-on-error on
the two endpoints where a failure is most expensive. Free, low risk.

**(b) `Cache-Tag` + `ctx.cache.purge()` — closes a real gap.** `/api/og` carries
`?v=16` in the `og:image` URL **[measured]**, so bumping `OG_RENDER_VERSION`
mints new URLs for social cards. But **`/{seed}.png` has no version in its URL**.
Bumping the render version re-renders into KV, yet the *edge* keeps serving the
old PNG for up to **7 days**, with no way to invalidate it. Workers Caching now
offers one:

> `purge()` accepts either `purgeEverything: true` on its own, or one or both of
> `tags` and `pathPrefixes`. […] Purges triggered by `ctx.cache.purge()` use
> Cloudflare's Instant Purge infrastructure and propagate globally.
>
> — [Purging the cache](https://developers.cloudflare.com/workers/cache/purge/)

Tag PNG/JSON responses (`Cache-Tag: png` / `json`), and have a bump call
`ctx.cache.purge({ tags: ["png"] })`. Constraints: purge is called **from inside
the Worker** (`ctx.cache.purge`, or `import { cache } from "cloudflare:workers"`),
so it needs an authenticated route or a cron trigger; purge is scoped to the
calling entrypoint; tags must be printable ASCII; and it shares the zone purge
API's rate limits.

**(c) `stale-while-revalidate` on PNG/JSON** (only possible after (a)). At day 7
a requester gets bytes immediately while the re-render happens in the background.
Given crawlers rarely revisit the same seed, the effect is small. **Speculative.**

**(d) Bound-and-cache a small allowlist of `w`/`h` sizes.** Today every custom
size re-rasterizes on every edge miss. Whether this is worth anything depends
entirely on how much `w`/`h` traffic there actually is — the repo has Workers
Logs at `head_sampling_rate: 1`, so **measure before building.**

**(e) `limits.cpu_ms: 10000`** is a runaway guard, as its comment says. Leave it.

### 8.3 Outside caching, but it is the biggest crawl-efficiency number here

A `/{seed}.png` is **269,748 bytes** for a 1200×630 gradient **[measured]**;
`/api/og` is 273,045. PNG compresses smooth ramps poorly. Meta downloading ~270 KB
per crawled seed dwarfs every cache decision in this document in terms of bytes
on the wire and crawl budget consumed.

Egress is free on Cloudflare, so this costs no money — but the brief names crawl
efficiency as a binding constraint, and this is the dominant term in it. Quantized
8-bit PNG output, or serving WebP where `Accept` allows it, would plausibly cut it
several-fold. **This is a rendering change, not a caching change**, and I have not
investigated resvg's options — flagging it as the highest-leverage thing adjacent
to the stated goal, not as a validated recommendation.

### 8.4 One small observability wart

`X-Cache: MISS` gets frozen into the edge-cached copy: `/api/og` returns
`cf-cache-status: HIT` alongside `x-cache: MISS` on the repeat request
**[measured]**. The header describes the *render that filled the cache*, not the
current request. Harmless, but do not read `X-Cache` as a live signal.

---

## 9. Prioritized recommendations

Confidence key: **High** = doc-cited and measured. **Medium** = doc-cited,
effect size unmeasured. **Speculative** = mechanism is documented, benefit here
is a guess.

| # | Change | Mechanism | Expected effect | Configured where | Risk | Confidence |
|---|---|---|---|---|---|---|
| 1 | **Stop tuning against Security Analytics cache statuses** | Zone dashboard, sampled, measures a cache Cloudflare documents as separate from Workers Caching; Workers cache analytics is "coming soon" | Avoids optimizing a phantom. Use `curl` + Workers observability instead | Nothing to configure | None | **High** |
| 2 | **Enable "Always Use HTTPS"** | Edge 301 before the Worker runs | Removes a confirmed `BYPASS` class (every plain-HTTP request to an uncached path = 1 uncollapsed Worker run) and closes the `http://` → cached-200 canonicalization hole | **Dashboard** → SSL/TLS → Edge Certificates | Low. Keep the Worker's own redirect as fallback. **Verify with `curl -sI http://grabient.com/newest` after enabling** — ordering vs Workers is not documented | **High** (problem measured; fix's ordering unverified) |
| 3 | **Drop `s-maxage=604800` from PNG/JSON `Cache-Control`** | `s-maxage` disables `stale-while-revalidate` **and** `stale-if-error`, incl. the default serve-stale-on-Worker-error. `CDN-Cache-Control` already sets edge TTL, so it buys nothing | Restores serve-last-good-render on resvg failure for the two most expensive endpoints | `src/seo.ts` `pngResponseHeaders()`, `src/palette-json.ts` `JSON_HEADERS` | Very low — removing a redundant directive | **Medium** (docs don't say whether the check runs pre- or post-precedence) |
| 4 | **Ship the pending `_headers` change; add `Cache-Control` for `ads.txt`** | Workers-assets default is `max-age=0, must-revalidate` → `REVALIDATED` on every request | `llms.txt` and `ads.txt` become clean `HIT`s. **Cost saving is negligible** — do it for crawler friendliness on a file `robots.txt` advertises | `apps/web/public/_headers` | Very low | **High** (measured) |
| 5 | **`Cache-Tag` on PNG/OG/JSON + `ctx.cache.purge({tags})` on render-version bump** | `/{seed}.png` has no version in its URL, so an `OG_RENDER_VERSION` bump re-renders into KV but the edge serves the old PNG for up to 7 days | Makes render changes take effect immediately instead of over a week; prerequisite for #6 | Worker code (`ctx.cache.purge`); needs an authed route or cron. Wrangler ≥4.107.0 — repo has 4.112.0 ✔ | Low. Purge is entrypoint-scoped and shares zone purge rate limits | **Medium** (gap confirmed; mechanism documented) |
| 6 | **Reconsider `cross_version_cache: true` + tag-purge HTML only** | Tag HTML, purge that tag post-deploy; PNG/JSON stay warm across deploys | Modest. The KV layer already means a deploy costs a KV read, not a re-render (measured). **Real risk:** production is *currently serving cached 404s* for routes that exist in the working tree but not the deploy — `renderNotFound` caches 404s for 3600 s at the edge. Today `false` clears them on deploy; `true` would let a newly-added route keep 404ing for an hour unless the purge covers it | `wrangler.jsonc` + worker code. Contradicts the current `README.md`/`wrangler.jsonc` comments — update them if changed | Medium-high. **My recommendation is: don't.** Only after #5 exists and you have hit-rate data | **Speculative** |
| 7 | **Strip tracking params (`utm_*`, `fbclid`, `gclid`, `ref`) in `normalizeSearch()`** | Query string is in the cache key and **order matters**; `KNOWN_KEYS` covers only 5 params, everything else passes through verbatim | Fewer cache keys and fewer crawlable duplicates on an already-unbounded space. Free Cache Rules can't exclude specific params (Enterprise only) and wouldn't apply anyway | `apps/web/src/search.ts` | Low — it is a 301, same as existing behavior | **Speculative** (magnitude unmeasured — check Workers Logs first) |
| 8 | **Investigate PNG output size** (~270 KB per gradient) | Not a caching change. Dominant term in bytes-on-the-wire and crawl budget | Potentially several-fold reduction in crawl cost | `packages/data-ops` / resvg options | Unknown — visual regression risk, needs its own investigation | **Speculative** — flagged, not validated |
| — | **Do NOT enable zone Tiered Cache / Smart Tiered Cache** | Workers Caching is "tiered by default … You do not configure it"; zone topologies documented as having no effect on it | Zero | — | — | **High** |
| — | **Do NOT add Cache Rules for the Worker's responses** | "No zone configuration for caching applies to Workers Caching" | Zero | — | — | **High** |
| — | **Do NOT buy Cache Reserve** | Requires a paid plan; ≥10 h TTL eligibility excludes all HTML; ≈$42/mo at this volume (§7.2) vs a $10 ceiling; worst-case fit for a one-shot URL space | Negative | — | — | **High** |
| — | **Leave `run_worker_first` / `not_found_handling` unset** | Defaults are `false` / fall-through, which is exactly what the `/:seed` catch-all requires | Correct as-is; changing either breaks routing | — | — | **High** |
| — | **Leave `limits.cpu_ms: 10000`** | Runaway guard, not a tuning knob (per its own comment) | — | — | — | **High** |

### Note on the request-count line in billing

Enabling Workers Caching converted static-asset requests from free-and-unlimited
to standard-rate ($0.30/M). At this volume that is cents, and the CPU saved by
cache hits is worth far more. **Not a reason to change anything** — recorded so
the number is not a mystery later.

---

## Sources

**Workers Cache**
- https://developers.cloudflare.com/workers/cache/
- https://developers.cloudflare.com/workers/cache/configuration/
- https://developers.cloudflare.com/workers/cache/cache-keys/
- https://developers.cloudflare.com/workers/cache/purge/
- https://developers.cloudflare.com/workers/cache/debugging/
- https://developers.cloudflare.com/workers/cache/limitations/
- https://developers.cloudflare.com/workers/runtime-apis/cache/
- https://developers.cloudflare.com/workers/reference/how-the-cache-works/

**Static assets**
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://developers.cloudflare.com/workers/static-assets/headers/
- https://developers.cloudflare.com/workers/static-assets/binding/

**Zone cache**
- https://developers.cloudflare.com/cache/concepts/cache-responses/
- https://developers.cloudflare.com/cache/concepts/default-cache-behavior/
- https://developers.cloudflare.com/cache/troubleshooting/investigating-uncached-responses/
- https://developers.cloudflare.com/cache/how-to/cache-rules/
- https://developers.cloudflare.com/cache/how-to/cache-rules/settings/
- https://developers.cloudflare.com/cache/how-to/cache-keys/
- https://developers.cloudflare.com/cache/how-to/tiered-cache/
- https://developers.cloudflare.com/cache/advanced-configuration/cache-reserve/
- https://developers.cloudflare.com/cache/interaction-cloudflare-products/workers/

**Platform / other**
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/waf/analytics/security-analytics/
- https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/
- RFC 9111 §4.2.4 (stale-serving restrictions), §3.5 (authenticated responses)
