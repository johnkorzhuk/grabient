# Infra + SEO action plan, 2026-08-17

## Status: shipped 2026-08-17

Merged to master as `1988c09` and deployed to grabient-production
(`336b0a06`). Verified live.

**Done — code (in production):**

- Query landing pages gated; junk queries `noindex,follow`, curated indexable
- Ten hub links on every palette page (seed pages previously linked none)
- robots.txt withholds the client-only JSON and `/cdn-cgi/`
- `s-maxage` removed from PNG/JSON so stale-if-error works again
- Palette naming live: titles are now "Lavender pink to cloudy blue Gradient
  Palette" rather than four hex codes
- Split sitemaps, `/{seed}.json` and `/api/search.json` now serve (were 404)
- **Spend bounds:** uncurated query renders redirect to the static card,
  over-length queries 400 before the embedding model, per-style pixel budget
- ads.txt cache policy

**Done — Cloudflare dashboard:**

- Always Use HTTPS on. Verified: `http://` and `www` now 301 to the canonical
- Minimum TLS 1.2; HSTS enabled at 12 months with includeSubDomains, no preload
- `skip-machine-readable` (order 1) — robots/llms/sitemap/ads/favicon/.well-known
- `block-credential-scanners` (order 3) — 275 events in its first two hours
- `api-burst-brake` extended to `/palettes/`, closing the unrate-limited
  Vectorize path. Verified: 297 through, 103 `429`, normal browsing unaffected

**Measured effect:** worst unauthenticated request 13.2s -> 2.08s; novel query
render 2.0s -> 0.12s redirect; 7,430 production requests post-deploy with zero
errors.

**Correction to a claim in the previous revision.** An earlier version of this
plan said the cssgradient.io embed sends 2.8x the traffic of organic search,
based on Cloudflare RUM referrers. **That is backwards.** RUM reports no
referrer for 91% of pageloads and captured roughly a third of the traffic GA4
saw, so it is not an attribution system. GA4 over the same 28 days:
**google 5,110 sessions vs cssgradient.io 222 — search is 23x the embed**, and
Organic Search is the largest channel by pageviews (76,614) ahead of Direct.

So the SEO work is optimisation of the channel that already dominates, not a
gamble on a negligible one. The embed remains the largest non-search referrer
and is worth nurturing, but it is not the primary channel. See §9b of
`traffic-forensics-2026-08-17.md`.

**The AI baseline is real.** GA4's AI Assistant channel: 205 sessions and 2,040
pageviews in 28 days — chatgpt.com 164, doubao.com 53, gemini.google.com 39.
About 7 sessions a day. Small next to 5,438 from search, but a measurable
number to move rather than an aspiration.

**Still open, in rough priority order:**

1. Index `grabient-dc` — 91.5M D1 rows/day from 4,320 queries (21,181 rows per
   query, a full scan). It is 75% of account row reads and is the ML project,
   not the website.
2. Rotate the `grabient-gsc-reader` service-account key (surfaced in transcripts
   twice).
3. GSC Links export (100k rows, manual — there is no Links API). Report was
   still "processing data" on 2026-08-17.
4. Bing AI Performance + Backlinks reports — populate ~48h after signup.
5. Bounded query vocabulary as a product decision, paired with the palette
   curation agent.
6. `admin/analytics-mcp` branch — WIP, deliberately unmerged.

---

Synthesis of four research reports and direct measurement against production.
Every claim here is either measured (marked **[measured]**) or cited in the
source report. Cost of everything below: **$0**.

Source reports:
- `infra-research/traffic-forensics-2026-08-17.md` (my measurements)
- `infra-research/cache-architecture.md`
- `infra-research/crawler-control.md`
- `seo-research/indexing-and-ai-visibility.md` — **carries a partial retraction;
  its image-SEO quantitative material was fabricated. Read the banner first.**
- `seo-research/legacy-urls-and-crawl-budget.md`

**Confidence note.** One sub-agent fabricated sources rather than reporting that
its search budget was exhausted. Everything in Tier 0 and Tier 1 below is either
measured by me directly against production or drawn from the cache/crawler
reports, which were not implicated. Claims sourced *only* to the indexing report
are marked **[unverified]** and should be checked before they drive work.

## The situation in one paragraph

Traffic is ~450k req/day and **falling** (1.30M on Aug 10 -> 338k on Aug 17), so
nothing here is urgent. Cost is $3.97/mo against a $10 ceiling and is not the
binding constraint. The real problem is that **Googlebot crawls this site 1,152
times a day — Meta out-crawls it 163 to 1** — and spends most of that budget on
`/cdn-cgi/zaraz/s.js` and `/api/*` rather than palette content. Meanwhile every
palette page is textually ~95% identical to every other, has zero internal
links, and exists at three URLs. Fix those and the crawl budget starts landing
on content.

---

# Tier 0 — dashboard, minutes, zero risk

### 0.1 Turn on "Always Use HTTPS" **[measured]**

SSL/TLS -> Edge Certificates -> Always Use HTTPS.

**The dashboard's redirect-loop warning does not apply here.** It describes an
origin server that forces its own HTTP-to-HTTPS redirect while Cloudflare
connects to it over plaintext. Measured over 24h, `originResponseStatus` is **0
on 720,279 requests** — no origin is contacted, the Worker generates the
response at the edge — and Always Use HTTPS fires *before* the Worker runs. The
Worker's own redirect simply stops being reachable for `http://`; keep it as
defence in depth in case the toggle is ever flipped back off.

**Right-sizing the benefit.** An earlier draft implied cleartext was a third of
traffic. That was wrong: it read `clientSSLProtocol: none` across all request
sources, which is dominated by internal `edgeWorkerCacheAPI` operations that
have no client TLS by definition. Filtered to real visitors:

| protocol | est req/day | % |
|---|---:|---:|
| TLSv1.3 | 506,988 | 97.0% |
| none (cleartext) | 10,552 | 2.0% |
| TLSv1.2 | 5,030 | 1.0% |

And of the cleartext 2%, most already behaves: 5,669 get a 301, 3,673 a 404,
858 a 403 — and **343/day get a 200 with real content.** That 343 is the actual
hole. So this is a correctness fix that removes `http://` as a duplicate URL
space for crawlers, not a traffic fix. Still worth one click; just not urgent.

**While you are on that page:** Minimum TLS Version is at 1.0. Exactly **8
requests/day** used TLSv1 — raising the floor to 1.2 costs nothing measurable.
HSTS shows as not enabled at the zone, but the Worker already sends
`strict-transport-security: max-age=31536000; includeSubDomains`, so it is
effectively on; enabling it at zone level is belt-and-braces and should come
*after* Always Use HTTPS. Note HSTS is deliberately hard to undo.

`http://grabient.com/_gKFgH0gGS...` returns **`200 OK, CF-Cache-Status: HIT`** —
the cached HTTPS body served over cleartext. The Worker's redirect middleware
never runs because **the cache key excludes the scheme**, so the response is
served before any Worker code executes. `/` and legacy paths do redirect; v3
seed routes do not.

Effect: collapses three live URLs per palette (`http://`, `http://www.`,
`https://`) into one. Also removes the cleartext-content exposure.

### 0.2 Block scanner paths at the WAF **[measured]**

Security -> WAF -> Custom rules. Free plan allows 5; one is in use.

`curl/8.7.1` from FR is running a credential wordlist: **70,574 est. req/day,
91% of them 404** — `/root/.gitconfig`, `/ssl/privkey.pem`, `/lambda/.env.production`,
`/dashboard/smtp.config.json`, `/admin/login.php`, and dozens more, each at a
near-uniform ~2,704 req/day. Every one currently executes the Worker.

Match on **path**, not on the `curl` user agent — blocking `curl` would break the
agent-access story this project is deliberately building. Suggested expression:

```
(http.request.uri.path contains ".env") or
(http.request.uri.path contains ".aws") or
(http.request.uri.path contains ".git") or
(http.request.uri.path contains "phpinfo") or
(http.request.uri.path contains "smtp") or
(http.request.uri.path contains "credentials") or
(http.request.uri.path contains "privkey") or
(http.request.uri.path contains "wp-admin") or
(http.request.uri.path contains "wp-login")
```

Saves ~$0.65/mo — negligible. The reason to do it is that it stops polluting the
logs and crawl signals you are about to start reading carefully.

### 0.3 Leave two toggles OFF — they would sabotage the AI goal

- **Managed robots.txt** prepends `Disallow: /` for ClaudeBot/GPTBot/Amazonbot
  **above** the hand-written allow list.
- **AI training blocking** also blocks *mixed* Search+Training crawlers per
  Cloudflare's own doc — exactly the class that produces citations.

A defaults change lands **2026-09-15**. Existing zones are unaffected, but this
zone is ad-detected via AdSense, so re-check the toggles after that date.

### 0.3b Skip the challenge rule for machine-readable files **[measured]**

Honest magnitude first, because I overstated this on the first pass: **total 403s
across the zone are 1,212/day out of ~450k requests.** Attribution:

| action | source | est req/day |
|---|---|---:|
| managed_challenge | firewallCustom | 898 |
| unknown | unknown | 228 |
| block | firewallManaged | 70 |

Most of it lands on `/favicon.ico` and `/`, from browser-like UAs — the
"Challenge HTTP/1.1 Chrome bots" rule doing roughly what it was built for.

The part that matters is narrow: `/robots.txt` was served 200 **415 times** and
403 **22 times**; `/llms.txt` 200 twenty-three times and 403 **five times**. That
is ~5% of robots.txt fetches, not a systemic block. But on the Free plan a
Managed Challenge to a non-browser client is an unsolvable 403 (no Log action
below Enterprise), and a crawler that cannot read robots.txt never learns it is
welcome — which is expensive for rare crawlers specifically (see 0.3c).

Cheap and safe: a skip rule ahead of the challenge rule for `/robots.txt`,
`/llms.txt`, `/sitemap.xml` and `/.well-known/*`. These files exist to be read by
machines; there is no reason to gate them.

### 0.3b-ii GitHub rate-limits 28% of our star-count fetches **[measured]**

I first read this as a routing bug. It is not — the requests are
`requestSource: edgeWorkerFetch` against `host: api.github.com`, i.e. correctly
attributed Worker subrequests from `githubStars()` in `index.ts:234`.

The real finding is the status split over 24h:

| status | est/day |
|---|---:|
| 200 | 227 |
| **403** | **99** |
| 504 | 19 |
| 429 | 1 |

**28% failure rate.** GitHub's unauthenticated limit is 60 req/hr per IP and
Cloudflare edge IPs are shared, so we are competing with every other Worker on
the colo. The code degrades correctly (`if (!res.ok) return 0` hides the star
chip), so the symptom is just a footer element that intermittently vanishes.

Cheap fixes, in order: raise `STARS_FRESH_MS` (the count changes rarely and
347 fetches/day for it is the per-colo cache multiplying), or move the value to
KV so all colos share one entry, or add a token. Low priority — cosmetic only.

### 0.3c Common Crawl is blocked at the network layer **[measured elsewhere]**

30 of 270 CCBot records over Dec 2025 - Jul 2026 came back **403**, despite
`robots.txt` explicitly welcoming CCBot. Same root cause as 0.3b: the challenge
rule fires before robots.txt is ever consulted.

This matters more than its traffic share suggests — Common Crawl is an input to
several LLM training corpora, and it is one of the few free ways to audit your
own backlink graph (a CDX sweep yielded 18 referrer domains, two of them
net-new).

### 0.4 Sign up for Bing Webmaster Tools

Bing shipped an **AI Performance report on 2026-02-10** [unverified] — the only free
first-party measurement of AI citation that exists anywhere. ChatGPT and Copilot
lean on Bing's index.

Note: the 2026-08-31 retirement is the **Webmaster Tools SOAP/POX formats**
(migrating to REST, same keys and quotas), not the product.

---

# Tier 1 — code, highest SEO leverage

### 1.1 Gate `/palettes/{anything}` — brand safety, not just SEO **[measured]**

```
$ curl -s -o /dev/null -w "%{http_code}" https://grabient.com/palettes/buy-cheap-viagra
200
<title>Grabient — Buy cheap viagra palettes</title>
<h1 ...>Buy cheap viagra palettes</h1>
```

No robots meta. **Anyone can mint an indexable grabient.com page containing any
text they choose, just by linking to it.** Google's doorway-abuse policy names
this shape almost verbatim ("substantially similar pages that are closer to
search results than a clearly defined, browseable hierarchy"), and the old
"don't index internal search results" guidance was *promoted* into that spam
policy rather than retired.

This is the highest-severity item on the list. A score gate on semantic-search
confidence, with `noindex` below threshold, is already scoped in
`SEO-STRATEGY.md` Phase 2.

### 1.2 Deploy the palette naming work — the indexation fix **[measured]**

Every one of the 867 pages currently emits a title whose only varying content is
24 hex digits:

```
<title>#a9caff → #d3cbff → #ffc5f1 → #ffbaec Gradient Palette | Grabient</title>
```

Two seed pages share 1,059 tokens and differ by ~45. That is the duplication
Google is reacting to, and it covers the **whole corpus** — not the 120 modifier
variants I initially blamed.

Correcting that earlier claim, measured with the repo's own decoder over all 867
sitemap seeds (mean OkLab dE across 8 stops, within-prefix pairs):

| | count | % |
|---|---:|---:|
| identical / imperceptible | 8 | 3.4% |
| subtle | 23 | 9.7% |
| **genuinely distinct** | **205** | **86.9%** |

**87% of modifier variants are real, different palettes.** Do not prune them.
The fix is textual differentiation, which `palette-name.ts` already implements
and which is not deployed.

Google's documented rule makes the canonical strategy conditional on this:
*"If the user-declared canonical is not similar to the current page, then Google
won't ever choose that URL as canonical."* Distinct names are what let the
genuinely-distinct variants stand as separate pages instead of collapsing.

### 1.3 Give palette pages internal links **[measured]**

Every `href` on a 117KB palette page: `/`, `/llms.txt` (x2), `/login`,
`/contact`, `/privacy`, `/terms`, the self-canonical, fonts, icons, and two
external links. **Not one link to another palette.**

This is the literal cause of Search Console's "Referring page: None detected" and
of Google's minimal crawl allocation — the sitemap is the only discovery path
that exists. `/palettes/{query}` pages do link 24 seeds each; seed pages link
none.

Add a related-palettes block with real `<a href>` elements. Google's documented
ordering — consolidate first, block second — depends on a crawlable link graph
existing at all.

### 1.4 Stop Googlebot spending its budget on subresources **[measured]**

Of ~728 sampled Googlebot requests in 24h: `/cdn-cgi/zaraz/s.js` 249,
`/api/like-info` 148, `/api/like-counts` 59, `/api/og` 57, homepage 37. Almost
no palette content. `robots.txt` currently says `Disallow:` (nothing) for every
agent.

`Disallow: /api/like-info`, `/api/like-counts`, `/api/geo`,
`/api/auth/` — none are needed to render page content, so blocking them does not
trip Google's "don't block rendering resources" rule. Leave `/api/og` crawlable
(it is the social card) and leave the agent-facing JSON endpoints crawlable.

Caveat from the crawl-budget doc: Google only reallocates freed budget **if it
is already hitting your crawl capacity limit**. At 1,152 req/day it almost
certainly is not — so treat this as removing noise from your own measurement
rather than as a guaranteed crawl-budget win.

### 1.5 Fix llms.txt overclaiming

The rewritten file opens with "Every URL in this document is live." Against
production, `/{seed}.json`, `/api/search.json`, `/mcp` and all three split
sitemaps **404** — production is running an older build than the working tree.
It also documents a 300 req/10s rate limit with a verified-crawler exemption
that exists nowhere in the repo.

Either ship the endpoints or stop advertising them. An agent that follows the
file and gets a 404 is worse than one that never read it.

### 1.6 Header and payload cleanups

- Remove `s-maxage=604800` from the PNG/JSON `Cache-Control`. It is redundant
  (`CDN-Cache-Control` outranks it) and per the docs it disables
  `stale-while-revalidate` **and** `stale-if-error` — including serve-stale-on-
  Worker-error, on the two most CPU-expensive endpoints.
- Add a version param to `/{seed}.png` as `/api/og` already has (`?v=16`).
  Without it, bumping `OG_RENDER_VERSION` re-renders into KV while the edge
  serves the stale PNG for its full 7-day TTL. `ctx.cache.purge({tags})` is now
  available as an alternative.
- **PNGs are 191KB, 1200x630, RGBA** for a four-stop gradient **[measured]**.
  Dropping the alpha channel is ~25% free; WebP on smooth gradients is roughly
  an order of magnitude. Relevant to LCP and to Google Images eligibility.
- Add `Access-Control-Allow-Origin: *` to `.png`. Figma plugin iframes have a
  `null` origin, so `*` is the only value that works. The branch has it;
  production does not.

---

# Explicitly NOT doing, with reasons

| Thing | Why not |
|---|---|
| Block or throttle Meta | Owner decision, and `meta-webindexer` is the **citation** crawler (`meta-externalagent` is the training one). Both are Cloudflare-*verified* in `PAGE_PREVIEW`, so AI Crawl Control has no lever anyway. |
| Zone Tiered Cache | Workers Caching is tiered by default and not configurable. |
| Cache Rules | Documented as having no effect on Workers Caching. |
| Cache Reserve | ~$42/mo at this volume; its >=10h TTL eligibility excludes all HTML. |
| Free-plan rate limiting | 1 rule, IP-only counting, 10s window. Meta announces ~300 IPv6 ranges. ASN counting is Enterprise. |
| Prune modifier variants from sitemap | 87% are perceptually distinct palettes. |
| `noindex` for crawl budget | Google: "will still request, but then drop the page... wasting crawling time." |
| llms.txt as a citation strategy | 97% of published files received zero requests (Ahrefs, N=137,210 domains) **[unverified]**; Google explicitly ignores it. Keep it as agent documentation, not as an SEO lever. Re-check the Ahrefs number before quoting it — it sits in the same report as the retracted material. Our own logs give a milder version: `/llms.txt` got **28 requests/day** against 415 for `/robots.txt` and 74 for `/sitemap.xml` **[measured]**. Low, but not zero — something is reading it. |
| `FAQPage` / `HowTo` / `WebApplication` / `CreativeWork` JSON-LD | FAQ rich results ended 2026-05-07; the others are not supported types. `SearchAction` has been dead since 2024-11-21. **[unverified]** `ImageObject` is the only one that matches what this site produces. |
| Image SEO as a primary channel | Google does not index CSS backgrounds, and every gradient on the site is one **[verified]**. Note: the *quantitative* case against image SEO in the source report was retracted as fabricated — see the banner on `seo-research/indexing-and-ai-visibility.md`. The blocker is real; "how much traffic image SEO would be worth" is **unresearched**. |

---

# Corrections to existing docs in this repo

- **`SEO-STRATEGY.md` Do-first #3** reasons that "429 is safe, 403 drops URLs".
  Half wrong: a 429 throttles the **whole hostname**, including the 867 pages you
  want crawled. Do not reach for 429 as a targeted tool.
- **`SEO-PASSOFF.md` line 150** noticed the cleartext-HTTP issue but filed it
  under "11 more" minor items. It is a sitewide duplicate of every URL and is
  item 0.1 here.
- **`SEO-PASSOFF.md` line 194** dismisses unbounded crawl traps because "nothing
  links a gibberish query". That reasoning fails for `/palettes/{anything}`:
  in a doorway attack the attacker supplies the links.
- **The premise that a decade of link equity is stranded on dead legacy URLs is
  false.** Grabient 1 (2017-2025) had exactly one URL. The lz-string seeds are
  from the 2025 rebuild, ~8 months old, and 239/239 recoverable ones still
  decode and 301 correctly. There is nothing to recover.
- **"Referring page: None detected"** is weaker evidence than I first treated it
  as — Google documents that it "doesn't mean that no referring page exists".
  The orphan finding stands on direct link-counting instead.

# Already built, not yet used

`referringUrls` **is** exposed by the URL Inspection API, and
`apps/admin/src/search-console.ts:344` already returns it. Quota is 2,000/day,
so the entire 867-seed corpus can be swept in under two minutes. That is a ready
made way to measure whether the internal-linking work in 1.3 actually moves
Google's view of the corpus.

# Two things worth knowing that change the framing

**The Figma end-state is not reachable as phrased [unverified].** Figma is an MCP *server*,
not a client, and its catalog allowlist runs the other way. The reachable
version is the user's coding agent holding both Figma's MCP server and
grabient's simultaneously. That is a different and more achievable target.

**AI Overview citation is measurable now [unverified].** Search Console added a
generative-AI performance report in 2026 (impressions only, AIO + AI Mode
combined, subset rollout), and there is a Search generative-AI opt-out control.
`Google-Extended` does **not** affect AIO or AI Mode — that is a common and
costly misreading.

---

# Done in code, 2026-08-17 (uncommitted, undeployed)

| # | Change | Files |
|---|---|---|
| 1.1 | `/palettes/{query}` indexability gate | `index.ts`, `popular-searches.ts`, `semantic-route.test.js` |
| 1.3 | Browse-hub links in the footer of every page | `pages.ts` |
| 1.4 | robots.txt disallows client-only API + `/cdn-cgi/` | `seo.ts` |
| 1.6 | `s-maxage` removed from PNG and JSON | `seo.ts`, `palette-json.ts`, `palette-json.test.js` |
| 1.5 | llms.txt: `s-maxage` wording corrected (read rate-limit claim **restored**, see below) | `llms.txt` |
| — | GA4 referring-page report | `apps/admin/src/ga4.ts` |
| — | 379 referring domains saved | `seo-research/data/referring-domains-2026-08-17.txt` |

Four new tests pin the gate; both apps type-check; the suite is back to its six
pre-existing failures (`fit-bench` x4 from the abandoned fitting workstream,
plus stale `export` and `analytics` tests).

**The gate is calibrated, not guessed.** Probing the live Vectorize index with
the same model the Worker uses: the weakest real query ("lagoon") tops out at
0.3796 and the strongest junk query ("zzzzz") at 0.3734 — 0.006 apart, and
mean-of-16 overlaps outright. So a score threshold alone cannot separate them.
The gate is therefore curated-vocabulary-first (POPULAR_SEARCHES + CURATED_THEMES
+ FEATURED + EMOJI, 265 queries), with color/hex/seed context as a second route
and a score of 0.45 — 0.077 clear of every junk probe — as a third. Everything
else is `noindex,follow`, keeping the crawl path to seed pages open.

**Deliberately not done:** redirects for `/random`, `/collection`, `/feed/`.
They 404 and have no 1:1 replacement, and Google documents that a redirect
without one is treated as a soft 404 anyway, while a real 404 is "a strong
signal not to crawl that URL again". Leaving them is the correct behaviour.

**A claim I got wrong and reverted.** I grepped `checkRateLimit` in the Worker,
found it guarding only writes, and concluded reads were unlimited — then edited
llms.txt to say so. Wrong: the read limit lives in a **Cloudflare rate limiting
rule**, not in code, and I never checked the dashboard. Verified live by
bursting 400 requests at one cached URL: **301 returned 200, then 99 returned
`429`**.

```
api-burst-brake  (rate limiting rules, order 1, active)
  (not cf.client.bot and (
      starts_with(http.request.uri.path, "/api/")
      or ends_with(http.request.uri.path, ".png")
      or ends_with(http.request.uri.path, ".json")))
  IP · 300 requests / 10 seconds · Block · 10s duration
```

The original llms.txt wording was accurate on every point — threshold, window,
scope, the 429, and "verified crawlers are exempt" (`not cf.client.bot`). It has
been restored verbatim. **Lesson: this stack's behaviour is split between the
Worker and the dashboard; grepping the repo is not sufficient evidence that a
control does not exist.**

Note this also means the big crawlers are already exempt by design — Meta's
bots, Googlebot and Bingbot are all Cloudflare-verified, so `not cf.client.bot`
excludes them. The limit bites unverified traffic only, which is the intent.

**Deliberately not duplicated:** CORS headers. `isPublicApiPath` in `index.ts`
already sets `Access-Control-Allow-Origin: *` for every `.png`/`.json`/`/api`
render in one place; production simply has not shipped it yet.

# Suggested order

1. **0.1 Always Use HTTPS** — one toggle, removes two duplicate hostnames
2. **1.1 Gate `/palettes/{anything}`** — highest severity, brand safety
3. **1.2 Deploy palette naming** — the actual indexation fix
4. **1.3 Internal links between palettes** — fixes orphan status
5. **0.2 WAF scanner block** — cleans the measurement surface
6. **0.4 Bing WMT** — starts the only free AI-citation measurement
7. Everything in 1.4-1.6 as cleanup

Items 2, 3 and 4 all ship in the same `apps/web` deploy, which has been deferred
pending "a more polished state". That deploy is now the bottleneck for the three
highest-leverage SEO changes available.
