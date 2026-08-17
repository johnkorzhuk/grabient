# Traffic forensics, 2026-08-17

Measured, not inferred. Source: Cloudflare GraphQL Analytics against zone
`579276b6df91328d101988658d0b0082` (grabient.com, **Free** zone plan), queried
with wrangler's OAuth token. Window `2026-08-16T16:00Z .. 2026-08-17T16:00Z`
unless noted.

Two datasets, and they disagree in ways that matter:

- `httpRequests1dGroups` — unsampled, 365-day retention. Authoritative for
  totals and for history.
- `httpRequestsAdaptiveGroups` — sampled; estimates are `count x avg(sampleInterval)`.
  8-day retention, 24h max per query, 40 fields, 10k page size. Over-estimates
  totals here by roughly 1.5x versus the unsampled daily rollup, so **use it for
  proportions, never for absolute counts.**

Entitlements confirmed on this free zone: `userAgent`, `userAgentBrowser`,
`verifiedBotCategory`, `cacheStatus`, `clientRequestPath`, `edgeResponseStatus`,
`clientIP`, `originResponseDurationMs`. Not available: `botScore` (needs
Enterprise + Bot Management), `clientRefererHost` (paid plans).

---

## 1. The sitemap publishes near-duplicate palettes; crawlers obey it

This is the headline. `meta-webindexer` is the single largest identified client
at ~140k req/day (16.8%), and **0% of its requests are cache hits.** What it
fetches explains why:

```
/_gNVgK5gQgf89gBkgCEf2-f8Nf65f_dgAvf9A iFtSwzaE
/_gNVgK5gQgf89gBkgCEf2-f8Nf65f_dgAvf9A iF6LzJkY
/_gNVgK5gQgf89gBkgCEf2-f8Nf65f_dgAvf9A h6voomgA
/_gNVgK5gQgf89gBkgCEf2-f8Nf65f_dgAvf9A iXzJnbfO
/_gNVgK5gQgf89gBkgCEf2-f8Nf65f_dgAvf9A jhvoyUgh
                                        ^^^^^^^^ only this varies
```

Identical coefficient block, differing only in the trailing global-modifier
characters. In the v3 char-aligned format the four globals (exposure, contrast,
frequency, phase) own the tail positions, so these are **the same palette at
different slider settings**. Crawlers are walking that space.

Each permutation is a distinct URL, therefore a distinct cache key, therefore a
guaranteed `miss` and a full Worker execution.

### The crawlers are not enumerating anything — the sitemap lists these

An earlier draft of this document blamed crawler enumeration. That was wrong,
and the correction matters because it moves the fix from "crawler management" to
"our own corpus."

```
$ grep -oP '(?<=<loc>https://grabient\.com/)_[A-Za-z0-9_\-]+' sitemap.xml
867 seed URLs
  593 of length 37   (base seed, no modifiers)
  274 of length 45   (seed + 8-char global-modifier block)
747 distinct 37-char prefixes for 867 URLs
```

**120 base palettes are published more than once at different modifier
settings.** And the specific prefix `meta-webindexer` fetched five variants of
appears in the sitemap exactly five times:

```
_gNVgK5gQgf89gBkgCEf2-f8Nf65f_dgAvf9A
_gNVgK5gQgf89gBkgCEf2-f8Nf65f_dgAvf9A gFv2vafx
_gNVgK5gQgf89gBkgCEf2-f8Nf65f_dgAvf9A f9vfzcjd
_gNVgK5gQgf89gBkgCEf2-f8Nf65f_dgAvf9A fBvovogA
_gNVgK5gQgf89gBkgCEf2-f8Nf65f_dgAvf9A gFv2vahH
```

Meta crawled our sitemap faithfully. Nothing is enumerating a URL space.

### How duplicated are they, really? Measured, and it is NOT most of them

A first pass at this looked at the five variants above, saw
`#a9caff` vs `#abccff` (2/255 on one channel), and concluded the corpus was 14%
near-duplicate. **That was generalizing from a cherry-picked example** — that
pair turns out to be the 2nd-closest of 236 in the whole corpus.

Measured properly: decode all 867 sitemap seeds with the repo's own
`deserializeCoeffs` + `applyGlobals` + `cosineGradient`, sample 8 stops, convert
to OkLab, and take mean perceptual distance between every within-prefix pair.

```
seeds: 867   decoded: 867   failed: 0
distinct base palettes: 747
base palettes published more than once: 65   -> 120 extra URLs
```

| variant pairs (mean OkLab dE over 8 stops) | count | % |
|---|---:|---:|
| identical (dE < 0.001) | 1 | 0.4% |
| imperceptible (dE < 0.02) | 7 | 3.0% |
| subtle (dE < 0.05) | 23 | 9.7% |
| **distinct (dE >= 0.05)** | **205** | **86.9%** |
| total | 236 | |

**87% of the modifier variants are genuinely different palettes.** Only 8 pairs
are true perceptual duplicates. The variants mostly deserve to exist, and
"dedupe the sitemap" is the wrong fix.

### The real duplication is textual, and it covers the entire corpus

Google does not compute OkLab distance. It compares rendered text. And every one
of the 867 pages currently emits:

```
<title>#a9caff → #d3cbff → #ffc5f1 → #ffbaec Gradient Palette | Grabient</title>
```

Same template, same tag vocabulary, and a title whose only varying content is 24
hex digits. Two palettes can be perceptually distinct and still produce HTML
that is ~95% character-identical. That is the duplication Google is reacting to,
and it applies to **all 867 pages**, not to the 120 variants.

This reframes the fix. It is not sitemap pruning — it is making each page
textually distinct, which is precisely what the undeployed `palette-name.ts`
work does. Production is running pre-naming code, so the differentiation that
would break these out of a duplicate cluster is written but not shipped.

Remaining gap: 2,741 distinct seed paths were requested in 24h against 867 in
the sitemap. The homepage links 24 seeds per render, 7 of which carried
modifiers in the sample taken, and it rotates - so repeated crawls harvest a
wider set than the sitemap alone. `/palettes/{query}` pages linked only 37-char
base seeds in the sample checked.

### The compounding problem: every permutation self-canonicalizes

```
$ curl -sL https://grabient.com/_gNVgK5gQgf89gBkgCEf2-f8Nf65f_dgAvf9AiFtSwzaE
<link rel="canonical" href="https://grabient.com/_gNVgK5gQgf89gBkgCEf2-f8Nf65f_dgAvf9AiFtSwzaE">
```

The canonical points at itself. So an unbounded family of near-identical pages
each declares itself the canonical version. That is the textbook cause of
"Crawled - currently not indexed", which is exactly what Search Console reports
for this corpus.

---

## 2. Answering "legacy links or recent sharing?" — neither, and they are not old

**There are no decade-old palette links, because there were never any palette
URLs to share until 2025.** From git:

```
2017-05-06  init commit                                    <- Grabient 1
2025-11-30  Grabient 2 init commit
2025-12-09  feat: add dedicated search route with lz-string compression
2026-07-15  feat: char-aligned seed format (v3, current)
```

Grabient 1 ran 2017 to 2025 with a single URL — the root. The lz-string seeds
that look ancient are from the Grabient 2 rebuild and are roughly **8 months
old**, not nine years. (An independent Wayback CDX sweep dates their first
archive to 2025-05-16, slightly earlier than the squashed "init" commit, which
is consistent with development preceding the import. Either way: 2025, not
2017.)

They also still work. Every one of 239 legacy seeds recoverable from the Wayback
archive decodes and 301s correctly, verified live:

```
$ curl -sI https://grabient.com/HQFgrA7ANKCcIzAZjDFrgCZYAYabAyVg0wEZSkA2KJYZPMYKgqM0aqAWhzlXbIRYbLCDw9gZTDiA
301 -> https://grabient.com/_gHJgHugIXgFjgEigD_gGLgDXgDsg3KhX5gWcYRybzYeI
```

So there is **no legacy-URL link equity to recover** — the premise that a decade
of inbound links is stranded on dead URLs is false.

As traffic, they are a rounding error: ~2,600 est. req/day across ~368 distinct
URLs, 0.4% of total. A handful of AWS-hosted crawlers re-checking a fixed known
set — a stale crawler list, not humans sharing links.

Real link-preview traffic is also tiny: `facebookexternalhit` is **466 req/day**.
That is the user-agent Facebook/Instagram/WhatsApp use when a human actually
pastes a link. So there is no wave of social sharing.

The 140k/day is `meta-webindexer`, a systematic index crawl. Cloudflare
classifies it as verified-bot category **"Page Preview"**, which is what made it
look like sharing activity in the dashboard.

---

## 3. Full client breakdown (est., 24h)

| Client | est req/day | % | hit% | 404% | verified as |
|---|---:|---:|---:|---:|---|
| browser-like UA, unverified | 281,755 | 33.8% | 6% | 1% | (unverified) |
| **(empty user agent)** | 233,718 | 28.0% | **95%** | 3% | (unverified) |
| **meta-webindexer** | 140,447 | 16.8% | **0%** | 0% | Page Preview |
| **curl/8.7.1** | 70,574 | 8.5% | 6% | **91%** | (unverified) |
| meta-externalagent | 47,229 | 5.7% | 1% | 0% | AI Crawler |
| Amzn-SearchBot | 26,020 | 3.1% | 34% | 0% (**100% 301**) | AI Search |
| Sogou | 4,217 | 0.5% | 25% | 0% | — |
| bingbot | 4,113 | 0.5% | 16% | 0% | Search Engine Crawler |
| MJ12bot | 3,481 | 0.4% | 1% | 0% | SEO |
| PetalBot | 2,984 | 0.4% | 0% | 0% | AI Crawler |
| GPTBot | 2,344 | 0.3% | 1% | 1% | AI Crawler |
| Baiduspider | 1,748 | 0.2% | 1% | 0% | Search Engine Crawler |
| **Googlebot** | **1,152** | **0.1%** | 5% | 3% | Search Engine Crawler |
| Applebot | 707 | 0.1% | 21% | 0% | AI Search |
| facebookexternalhit | 466 | 0.1% | 51% | 0% | Page Preview |

Verified-bot category totals: Page Preview 18.5%, AI Crawler 6.8%, AI Search
3.5%, **Search Engine Crawler 0.9%**, SEO 0.7%.

**Meta out-crawls Google 163 to 1.**

---

## 4. Googlebot spends its budget on subresources, not content

Of ~728 sampled Googlebot requests, the top paths are:

```
249  /cdn-cgi/zaraz/s.js        <- analytics loader
148  /api/like-info
 59  /api/like-counts
 57  /api/og
 37  /                          <- homepage
 19  /  (301)
 16  /metrics/
 15  /e/flags/
 15  /flags/
 13  /assets/module-*.js
 10  /api/geo
  8  /api/auth/get-session
```

Almost none of it is palette content. Googlebot renders the page, the client JS
fires, and the API calls it makes consume the crawl allocation. `robots.txt`
currently says `Disallow:` (nothing) for every user agent, so all of this is
fair game.

At 1,152 req/day total, Google's entire crawl budget for this site is smaller
than the waste.

---

## 5. `http://` serves palette pages in cleartext — three live duplicates

```
http://grabient.com/                       -> 301 https
http://grabient.com/HQNgLArANM... (legacy) -> 301 https
http://grabient.com/_gKFgH0gGS...  (v3)    -> 200 OK, CF-Cache-Status: HIT
http://www.grabient.com/_gKF...            -> 200 OK
https://www.grabient.com/_gKF...           -> 301 -> apex
```

The HTTP-to-HTTPS redirect has a hole for v3 seed routes. Every palette page is
therefore reachable at three live URLs, and the cleartext copy is being cached
and served at the edge. HSTS is set correctly on HTTPS responses
(`max-age=31536000; includeSubDomains`) but a crawler arriving over `http://`
never sees it.

**Magnitude, measured rather than assumed.** Filtered to `requestSource:
eyeball`, real visitors are 97.0% TLSv1.3, 1.0% TLSv1.2 and 2.0% cleartext
(10,552/day). Of that cleartext slice most already behaves — 5,669 get a 301,
3,673 a 404, 858 a 403 — and **343/day are served a 200 with real content.**
That 343 is the whole exploitation of this bug today. The reason to fix it is
that `http://` remains a structurally duplicate URL space for crawlers, not
that it is bleeding traffic.

**Fix: Cloudflare -> SSL/TLS -> Edge Certificates -> "Always Use HTTPS" = On.**
Free, one toggle, resolves at the edge before the Worker runs.

This is also the source of `Amzn-SearchBot`'s 100% 301 rate (26k/day): it is
crawling the `www.` hostname, which is the one combination that does redirect.

---

## 6. Palette pages are orphans — zero internal links

Every `href` on a 117KB palette page:

```
2  /llms.txt          1  https://iquilezles.org/articles/palettes/
2  /                  1  https://github.com/johnkorzhuk/grabient
1  /terms             1  https://grabient.com/_gLvgKR...  (self-canonical)
1  /privacy           1  /login   /contact   /site.webmanifest   fonts, icons
```

**Not one link to another palette.** The corpus has no internal link graph at
all, and the only discovery path is the sitemap.

Caveat on the evidence: I earlier called this "the direct explanation for Search
Console's 'Referring page: None detected'". That inference was too strong —
Google documents verbatim that an absent referring page *"doesn't mean that no
referring page exists"*. The conclusion stands anyway, but it stands on the
direct evidence above (grep the HTML, count the links) rather than on the GSC
field. An independent sweep found 9 `<a href>` elements per seed page, none of
them to another seed or query page, and ~10-18 hops from the homepage to the
median seed across 37 pagination pages.

---

## 7. Scanner botnet: 70k/day of Worker-executed 404s

`curl/8.7.1`, all from **FR**, 91% 404, in a near-uniform ~2,704 est. req per
distinct path — a wordlist being walked by a distributed botnet:

```
/lambda/.env.production   /ssl/privkey.pem      /root/.gitconfig
/stage/.aws/config        /admin/login.php      /mail/config.yml
/docker-compose.dev.yml   /horizon/api/stats    /terraform/.env.local
/dashboard/smtp.config.json  /rest/oauth1-credential/auth  /api/.env.staging
```

Every one is a Worker invocation returning 404. ~8.5% of all traffic, 100%
waste. Blockable at the edge with a free WAF custom rule matched on **path**
(not on the `curl` user agent — blocking that would break the agent-access
story this project is deliberately building).

---

## 8. Cache is healthier than the dashboard suggested

Security Analytics' "top 3 cache statuses" panel omitted `hit`, which made the
cache look broken. The full distribution:

| status | est req | % |
|---|---:|---:|
| hit | 253,279 | 33.3% |
| miss | 252,755 | 33.2% |
| bypass | 120,922 | 15.9% |
| none | 97,645 | 12.8% |
| dynamic | 28,281 | 3.7% |
| expired | 6,372 | 0.8% |

By route class:

| route | est req | % | cache |
|---|---:|---:|---|
| v3 seed pages | 247,075 | 40.4% | **hit 92%** |
| `/cdn-cgi/*` (Zaraz, RUM) | ~72,000 | 11.8% | none (pre-Worker, not billed) |
| `/api/*` dynamic | 99,636 | 15.1% | **bypass 95%** |
| static assets | 48,035 | 7.8% | none 66%, hit 33% |
| scanner 404s | ~70,000 | 11.4% | miss |
| `/api/og` | 7,459 | 1.2% | **miss 96%** |
| `/palettes/*` | 6,401 | 1.0% | miss 51%, hit 17% |
| legacy lz-string seeds | ~2,600 | 0.4% | 301 |

Seed pages cache well **when the URL repeats**. The misses are the enumeration
in section 1, which no cache configuration can fix — an unbounded key space
never warms.

`/api/*` at 95% bypass is correct-by-design (per-user, `no-store`): `/api/like-info`
30.7k, `/api/auth/get-session` 26.4k, `/api/geo` 25.1k, `/api/like-counts` 5.7k.
But note these are ~88k Worker invocations/day driven by client JS, against
247k seed pageviews — i.e. only ~10% of palette page requests execute JS,
confirming most are non-rendering bots.

`/api/og` at 96% miss is 7k resvg rasterizations/day that could be cached.

---

## 9. History: this is a receding wave, and the cache metric changed meaning

Unsampled `httpRequests1dGroups`, monthly averages:

| month | req/day | cache% | uniq IP/day | GB/day |
|---|---:|---:|---:|---:|
| 2025-08 | 138,143 | 7.9% | 8,189 | 1.96 |
| 2025-09 | 155,562 | 7.8% | 9,420 | 2.05 |
| 2025-10 | 85,582 | 10.2% | 5,054 | 1.28 |
| 2025-11 | 209,261 | 29.0% | 6,694 | 1.72 |
| 2025-12 | 4,782,874 | 87.6% | 57,285 | 17.86 |
| 2026-01 | 343,620 | 33.8% | 121,392 | 2.52 |
| 2026-02 | 287,699 | 39.5% | 12,908 | 3.43 |
| 2026-03 | 567,114 | 53.2% | 19,570 | 9.72 |
| 2026-04 | 1,796,389 | 59.7% | 33,341 | 36.26 |
| 2026-05 | 1,791,559 | 53.8% | 59,304 | 30.18 |
| 2026-06 | 511,477 | 36.4% | 41,567 | 6.04 |
| 2026-07 | 2,051,067 | 62.7% | 55,769 | 35.04 |
| 2026-08 | 900,266 | 4.0% | 73,421 | 11.00 |

Two things to read here.

**The cache% collapse on 2026-07-25** (64.5% -> 8.8%, and 3-6% since) coincides
with the web-lite cutover (commits cluster on 2026-07-25..27). This is a change
in traffic *composition*, not a regression: the old React SPA served many hashed
static bundles per pageview, which cache near-100%. The new SSR Worker serves
one HTML document per pageview. Fewer, richer requests.

Caveat worth resolving: `httpRequests1dGroups.cachedRequests` reports ~5% for
2026-08-16 while the adaptive dataset reports `hit` at 33% for the same window.
The two are counting different things — most likely the Workers-level cache
(`cache: { enabled: true }` in wrangler.jsonc) registers as `hit` in the
adaptive dataset without counting as a zone `cachedRequest`. **Do not quote the
5% figure as the cache hit rate.**

**Volume is falling fast**, which matters for any decision made today:

```
2026-08-10  1,296,773      2026-08-14    532,493
2026-08-11  1,145,930      2026-08-15    464,088
2026-08-12    715,636      2026-08-16    450,117
2026-08-13    622,794      2026-08-17    337,672
```

The Meta crawl wave is ending on its own. Nothing here needs an emergency
response.

---

## 10. Cost is not the constraint

August month-to-date across the whole account: **$3.97**, projected **$5.60**.
Ceiling is $10.

| product | total | billable | cost |
|---|---:|---:|---:|
| Workers Standard Requests | 17.72M | 7.72M | $2.40 |
| Workers CPU ms | 61.32M | 31.32M | $0.64 |
| Container Memory GiB-s | 325.67k | 325.67k | $0.59 |
| R2 Data Storage | 26.97 GB-mo | 17 GB-mo | $0.26 |
| Vectorize Stored Dimensions | 46.78M | 36.78M | $0.05 |
| Container Disk GB-s | 1.3M | 1.3M | $0.04 |

Marginal request cost is $0.30/M. Eliminating the entire 70k/day scanner load
saves about **$0.65/month**. The container lines ($0.63) are the data-collection
trainer, not grabient.com.

**Optimize for crawl efficiency and latency, not for cost.** The reason to kill
scanner traffic and duplicate hostnames is that they consume Googlebot's
attention and muddy the index, not that they cost money.
