# Legacy URLs, link-equity recovery, and crawl budget on an unbounded generated URL space

Research report, **2026-08-17**. Extends `SEO-STRATEGY.md` (v2, 2026-08-16) and
`seo-research/history-authority.md` (2026-08-16); does not repeat them. Where this
contradicts either, the contradiction is called out explicitly in [§10](#10-where-the-existing-docs-are-wrong-or-outdated).

**Evidence labels.** Every substantive claim carries one:

| Label | Means |
|---|---|
| `[measured]` | I ran it against this repo, grabient.com, or a public API on 2026-08-17. Command shown or reproducible from the text. |
| `[G-doc]` | Google's own documentation, with URL and the page's live last-updated date |
| `[G-stmt]` | A dated statement by a named Googler, with a source URL |
| `[std]` | A published standard (sitemaps.org, RFC) |
| `[consensus]` | Widely held by practitioners, no controlled data |
| `[folklore]` | Repeated confidently, no primary source found — **do not act on it** |
| `[unverified]` | Could not confirm the primary source in this session |

**A note on Google's docs moving.** In Nov–Dec 2025 Google **moved its crawling
documentation off Search Central** to `developers.google.com/crawling/docs/`.
`…/search/docs/crawling-indexing/large-site-managing-crawl-budget` now **301s** to
[`…/crawling/docs/crawl-budget`](https://developers.google.com/crawling/docs/crawl-budget),
and the guide was retitled from "Large site owner's guide to managing your crawl budget"
to **"Optimize your crawl budget"**. Google's stated reason: *"Google's crawling
infrastructure is shared across a variety of Google products beyond Search, including
Google Shopping, News, Gemini, AdSense."*
([changelog](https://developers.google.com/crawling/docs/changelog), 2025-11-20 and
2025-12-18 entries; crawl-budget page last updated **2026-07-22**) `[G-doc]`.
**Cite the `/crawling/docs/` URLs going forward.**

---

## 0. The five findings that matter

1. **The premise of this investigation is wrong in a useful way.** There is no
   "2017-era URL format." Grabient 1 (2017 → 2025-04) had **exactly one URL**. The
   lz-string seeds are from the **2025** rebuild — they first appear in the Wayback
   archive on **2025-05-16**, ~15 months ago, not nine years ago `[measured]`. All
   **239** legacy seed URLs recoverable from the archive **still decode and 301
   correctly today** `[measured]`. There is no legacy-URL equity problem to solve.

2. **There is a live cleartext-HTTP duplicate, and it is a Cloudflare cache-key bug,
   not a code bug.** `http://grabient.com/` returns **HTTP 200 with the full HTML**,
   served `CF-Cache-Status: HIT` from the cached **HTTPS** response. The Worker's
   `http → https` 301 only fires on a cache MISS. Reproduced deterministically
   `[measured]` — see [§2.1](#21-cleartext-http-is-served-a-cached-200-not-a-301).
   This fully explains "old URLs still indexed over `http://`". The fix is one
   dashboard toggle.

3. **`/palettes/{anything}` reflects attacker-controlled text into `<title>`, `<h1>`,
   `<meta description>` and `og:title` on an indexable HTTP 200 page.**
   `grabient.com/palettes/buy-cheap-viagra` → `<title>Grabient — Buy cheap viagra
   palettes</title>` `[measured]`. This is not merely a "crawl trap"; it is a doorway
   /keyword-injection vector on a domain with nine years of authority, and it is the
   one item on Google's documented harm list (*"Hacked pages"*, *"Low quality and spam
   content"*, *"Infinite spaces"*) that grabient actually matches. **This is the
   highest-severity finding in the report.**

4. **Crawl budget is almost certainly a non-issue, and the folklore around it is
   wrong.** Google's guide is scoped to 1M+ page sites, or 10k+ pages changing daily;
   four separate current Google docs tell a site of grabient's size not to read it
   `[G-doc]`. The documented harm mechanism (capacity contention) **only fires once
   you are already at the crawl capacity limit**, which Google states twice in two
   different current pages. And 4xx responses — except 429 — **cost zero crawl
   budget** `[G-doc]`. The seed catch-all already 404s undecodable input, so the
   expensive part is already right.

5. **"Referring page: None detected" does not mean what it looks like.** Google
   documents verbatim: *"If this value is absent it doesn't mean that no referring
   page exists"* `[G-doc]`. But the underlying worry is correct for a different,
   measurable reason: **a seed page has 9 `<a href>`s total and zero links to any
   other seed or query page** — every one of the 867 permalinks is a dead end, and
   reaching the median one takes ~10–18 pagination hops `[measured]`.

---

## 1. Seed-format archaeology — which formats decode today

### 1.1 The three decode paths in the current code

`packages/data-ops/src/serialization.ts` dispatches on shape, not on a version byte
(`isValidSeed:187`, `deserializeCoeffs:213`):

| Path | Trigger | Function | Status |
|---|---|---|---|
| **v3 char-aligned** | starts with `_` | `decodeAlignedSeed:60` | The only format *produced*. 37 or 45 chars. |
| **Decimal CSV** | contains `,` | `decodeDecimalSeed:171` | 12 or 16 plain numbers. Human/LLM-writable, documented in `llms.txt`. |
| **Legacy lz-string** | everything else | `decodeLegacySeed:159` | Fallback. Still fully functional. |

Dispatch is unambiguous because `_` is absent from lz-string's URI-safe alphabet
(`A-Za-z0-9+-$`) and `,` is absent from both.

### 1.2 What actually still decodes — measured, not assumed

I round-tripped a genuine 2025-era lz-string seed through the current decoder
(reproducing the old `formatNumber` + `join(',')` encoder from git commit `a0f96d4^`):

```
packed   : .500,.500,.500,.500,.500,.500,1.000,1.000,1.000,0,.333,.667
legacy   : HQVgDGA0od5TB86wIzAldnLdggZiOgDYSB2IA   isValidSeed → true
canonical: _gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKb
```

Live: `GET /HQVgDGA0od5TB86wIzAldnLdggZiOgDYSB2IA` → **301** →
`/_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKb` → **200** `[measured]`.

The 16-value form with the old π-range phase also decodes — `splitSeedValues:151`
divides by π when `|phase| > 1.001`.

**Corpus-scale check.** I enumerated every archived grabient.com URL from the Wayback
CDX API and extracted **239 distinct legacy-shaped seed paths**. Running all 239
through the current `isValidSeed`:

```
archived legacy-shaped paths: 239
still decode (301-able)     : 239
do NOT decode (404 today)   : 0
```

`[measured]` **The legacy fallback has zero known misses.** Sixty of the 239 contain a
`+`; both the raw and the `%2B`-encoded forms 301 correctly `[measured]`, so the
lz-string alphabet is not a URL-encoding hazard in practice.

### 1.3 There was never a 2017 URL format

`[measured]`, from `git log` and the Wayback CDX index:

| Era | Dates | URL space |
|---|---|---|
| **Grabient 1** | 2017-05-06 → 2018-02-01 (227 + 7 commits) | **One URL.** No router in the tree; `package.json` has `next@^2.4.8` and no route files. Wayback shows **zero** non-root HTML paths before 2025 — only `/`, `/robots.txt` and hashed static assets. |
| dormant | 2018-02 → 2025-11 | 18 commits total |
| **Grabient 2** (lz-string) | first archived **2025-05-16**; repo import 2025-11-30 | `/{lz-string}` seeds. 240 CDX captures in 2025, 6 in 2026. |
| **v2 binary** (`_` + 14/24-bit) | commit `a0f96d4` **2026-07-15 12:09** → `69a19df` **17:04** | Lived in git for **4h 55m**. Almost certainly never deployed; a v2 payload would fail the current fixed-length check in `decodeAlignedSeed:62`. |
| **v3 char-aligned** | `69a19df` 2026-07-15 | Current. |

So the "9-year-old legacy URLs" are **~15 months old at most**, and the accumulated
domain authority is *not* sitting on them. `history-authority.md` §2 reached the same
conclusion independently and is correct: **nine years of backlinks all point at
`www.grabient.com/`.**

### 1.4 The crawler-observed dead URL is mangled, not a lost format

The reported crawler request
`/HQNgLArANMEAxxmOAmJ4YGYDsYtz2EwE4QYJMBGJMADhlrmuFrGexGgFo5hKEY` (62 chars) returns
**404** and does not decode `[measured]`. It shares a **53-character prefix** with a
real archived seed:

```
observed : HQNgLArANMEAxxmOAmJ4YGYDsYtz2EwE4QYJMBGJMADhlrmuFrGex|GgFo5hKEY
archived : HQNgLArANMEAxxmOAmJ4YGYDsYtz2EwE4QYJMBGJMADhlrmuFrGex|AiA
```

`[measured]` — i.e. a real seed whose tail was truncated and something else appended.
Typical causes: a link wrapped by a mail client, a text extractor concatenating two
URLs, or a crawler re-assembling a broken href. **It is not evidence of a lost URL
format.** The 404 it receives carries `<meta name="robots" content="noindex,nofollow">`
and is edge-cached for 3600s (`renderNotFound`, `index.ts:269`) — which is the
correct handling per [§3](#3-decade-old-legacy-urls--what-google-actually-documents).

One cosmetic oddity: the 404 page emits a **self-referential `<link rel="canonical">`
to the 404 URL** alongside the `noindex`. Harmless (noindex wins), but a canonical on a
404 is meaningless and slightly confuses URL Inspection's `userCanonical` field.

---

## 2. Live findings on grabient.com, measured 2026-08-17

### 2.1 Cleartext HTTP is served a cached 200, not a 301

This is the single highest-confidence defect in the report, and it is reproducible in
three commands:

```bash
CB=$RANDOM$RANDOM$RANDOM
curl -sI "https://grabient.com/?cb=$CB"   # → HTTP/2 200,  cf-cache-status: MISS
curl -sI "http://grabient.com/?cb=$CB"    # → HTTP/1.1 200, CF-Cache-Status: HIT   ← the bug
curl -sI "https://grabient.com/?cb=$CB"   # → HTTP/2 200,  cf-cache-status: HIT
```

`[measured]` **Cloudflare's edge cache key does not include the URL scheme.** Once an
HTTPS response is cached, the byte-identical cleartext-HTTP request is served that
cached **200 HTML body**. The Worker's `http → https` middleware
(`apps/web/src/index.ts:137-148`) is correct and *does* fire — but only on a MISS:

```
http://grabient.com/?cb=NEW           → 301 → https://grabient.com/?cb=NEW   (CF-Cache-Status: BYPASS)
http://grabient.com/  (warm)          → 200 HTML                              (CF-Cache-Status: HIT)
```

Consequences:

- **Every URL on the site has a live cleartext-HTTP duplicate returning 200.** The
  `<link rel="canonical">` in the body correctly points at `https://…`, which is what
  has stopped this from becoming an indexing disaster — but it fully explains the
  observation that legacy URLs are *"still in Google's index, including over cleartext
  `http://`"*.
- **HSTS cannot save this.** The header *is* present on the cached HTTP 200
  `[measured]`, but RFC 6797 §8.1 requires user agents to **ignore** an STS header
  received over non-secure transport, and it does nothing for a first-contact crawler.
- **Google's documented position makes this worth fixing rather than shrugging at.**
  [Consolidate duplicate URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
  (last updated **2026-07-10**) `[G-doc]` prescribes *"Add redirects from the HTTP page
  to the HTTPS page"* as one of the three ways to secure HTTPS canonicalization, and
  warns that *"HTTPS-to-HTTP redirects… cause Google to prefer HTTP very strongly.
  Implementing HSTS cannot override this strong preference."*

**Fix `[dashboard]`:** Cloudflare → **SSL/TLS → Edge Certificates → Always Use HTTPS →
ON** ([Cloudflare docs](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/);
free plan). It redirects at the edge rather than in the Worker, so cache state is
irrelevant. A Redirect Rule (`http.request.scheme eq "http"` → 301 to
`https://${host}${uri}`) is the equivalent if a blanket toggle is undesirable. I could
**not** find a current Cloudflare doc stating the product-ordering relative to cache
`[unverified]` — so **verify with the three-command test above after enabling.**

### 2.2 The historical link target takes 3 redirect hops

Nine years of backlinks point at `www.grabient.com` (`history-authority.md` §2,
confirmed here). Measured chains, cache-busted `[measured]`:

| Start | Chain | Hops |
|---|---|---|
| `https://www.grabient.com/` | → `https://grabient.com/` → 200 | 1 |
| `http://www.grabient.com/` | → `https://www.grabient.com/` → `https://grabient.com/` → 200 | **2** |
| `http://www.grabient.com/{legacy-seed}` | → `https://www.` → `https://apex/{legacy}` → `https://apex/_{v3}` → 200 | **3** |

Google documents following **up to 10 hops** by default and advises *"ideally no more
than 3 and fewer than 5"*
([HTTP status codes](https://developers.google.com/search/docs/crawling-indexing/http-network-errors),
last updated 2026-02-04; [site moves](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes),
last updated 2026-06-17) `[G-doc]`. Mueller (Reddit, **2020-01-22**): *"less than 5
hops for URLs that are frequently crawled… for Google: up to 5 hops in the chain per
crawl attempt"*
([SEJ](https://www.searchenginejournal.com/googles-john-mueller-recommends-less-than-5-hops-per-redirect-chain/344664/)) `[G-stmt]`.

**So 3 hops is inside tolerance and is not a ranking problem.** It is a latency and
non-Google-client problem. `history-authority.md`'s "single hop, nothing to fix" verdict
is right for `https://www.` and **wrong for `http://www.`** — enabling Always Use HTTPS
collapses that chain by one hop as a side effect of fixing §2.1.

### 2.3 `/palettes/{anything}` is a keyword-injection surface, not just a crawl trap

`[measured]`, all HTTP 200, all with a full 24-result SSR grid:

| URL | `<title>` |
|---|---|
| `/palettes/blue` | `Grabient — Blue palettes` |
| `/palettes/asdkjhasd` | `Grabient — Asdkjhasd palettes` |
| `/palettes/buy-cheap-viagra` | **`Grabient — Buy cheap viagra palettes`** |
| `/palettes/cheap-rolex-watches-free-shipping-buy-now-2026` | **`Grabient — Cheap rolex watches free shipping buy now 2026 palettes`** |

The injected text also lands in:

```html
<h1 id="list-h1" …>Buy cheap viagra palettes</h1>
<meta name="description" content="Explore buy cheap viagra palettes matched by color and mood. …">
<meta property="og:title" content="Grabient — Buy cheap viagra palettes">
```

The result sets are **not** even stable between nonsense queries — `/palettes/asdkjhasd`
and `/palettes/zzzqqqxxx` share only 8 of 24 results; `asdkjhasd` and
`buy-cheap-viagra` share 3; `blue` and `asdkjhasd` share **0** `[measured]`. So these
are not near-duplicates of one page, they are a genuinely unbounded set of distinct,
indexable, keyword-stuffed pages on a 9-year-old domain.

**Why this is more serious than the current docs treat it.** `SEO-PASSOFF.md`
line 194 pushes back on this class of finding with: *"Unbounded crawl traps… True but
unsized — nothing links a gibberish query. Traps matter in proportion to inbound
links."* That reasoning is sound for accidental traps and **wrong for an injection
vector**: the whole point of a doorway attack is that *the attacker supplies the
inbound links*. A third party can point spam links at
`grabient.com/palettes/{their-keywords}` and grabient hosts the doorway.

Google's documented list of URL classes that *"can negatively affect a site's crawling
and indexing"*
([Troubleshoot crawling errors](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors),
last updated **2025-12-18**) `[G-doc]` names, verbatim: *faceted navigation and session
identifiers · duplicate content · soft 404 pages · **hacked pages** · **infinite spaces
and proxies** · **low quality and spam content***. Grabient matches three of the six on
this one route.

Google's prescription for exactly this shape
([Faceted navigation](https://developers.google.com/crawling/docs/faceted-navigation),
last updated **2025-12-18**) `[G-doc]`: *"Return an HTTP 404 status code when a filter
combination doesn't return results… This should also be the case if the URL contains
duplicate filters or **otherwise nonsensical filter combinations**… **don't redirect to
a common 'not found' error page. Instead, serve a 'not found' error with the 404 HTTP
status code under the URL where it was encountered.**"*

`SEO-STRATEGY.md` Phase 2.6 already proposes score-gating this route and correctly
insists on calibrating the threshold before arming it. **The calibration requirement is
right; the Phase-2 placement is too late.** See the action list.

### 2.4 Every seed permalink is a dead end in the link graph

`[measured]` on `https://grabient.com/_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu` (a
sitemap-listed seed), Googlebot UA, raw SSR HTML:

```
total <a href>                    : 9
links to other seed pages         : 0
links to /palettes/ query pages   : 0
distinct internal hrefs           : / /contact /login /privacy /terms /llms.txt
                                    + 3 asset/manifest links
```

Discovery structure `[measured]`:

- Homepage: 24 seed links, pagination links to `?page=2,3,4,37`; **37 pages total**
  (`?page=38` → 404).
- `/?page=20` links to `19, 20, 21, 37` only — no jump navigation.
- `/newest` and `/palettes/{q}`: 24 seed links each.
- Reaching the median seed therefore takes ~10–18 sequential hops, or arrives via
  sitemap alone.

Mueller (Webmaster hangout, **2018-06-09**, ~31:09) is the best Google statement on
this, and it is weaker than it is usually quoted as:

> "What does matter for us a little bit is how easy it is to actually find the content…
> if it's one click from the home page… then that tells us that these stores are
> probably pretty relevant… So it's more a matter of **how many links you have to click
> through** to actually get to that content rather than what the URL structure itself
> looks like."
> — via [SEJ, 2018-06-09](https://www.searchenginejournal.com/google-click-depth-matters-seo-url-structure/256779/) `[G-stmt]`

He says click depth affects **understood importance and weight**, "a little bit". He
does **not** say it determines indexing. Every crawl-depth-vs-indexation chart you will
find is published by a company selling a crawler and is confounded (buried pages are
usually also the pages nobody bothered to link) `[folklore]`. Fix internal linking
because it is cheap and Google's docs endorse it — **not** because there is proof it
flips indexing.

### 2.5 Seed pages carry 316 tokens, and none of it is prose

Extracted visible text (scripts/styles/SVG stripped) from two sitemap seeds, 400 apart
in the corpus `[measured]`:

```
page A visible tokens : 316      page B visible tokens : 316
unique tokens         : 210      unique tokens         : 210
shared                : 168      Jaccard               : 0.667
```

Every differing token is a hex code, a coefficient, or the seed itself. There is **zero
natural-language prose**; most of the "text" is the export panel's CSS/SVG/GLSL/JSON
snippets. The only heading is `<h1 class="sr-only">Gradient palette editor — #fada61 to
#ff5acd</h1>` — visually hidden, and hex-only.

This is the concrete measurement behind the `PALETTE-NAMING-PASSOFF.md` premise (*"the
name is the only prose distinguishing 866 otherwise-identical palette pages"*). That
work is the correct fix and is already in flight.

### 2.6 Sitemap: the split and `<lastmod>` are written but not deployed

| | Code (`apps/web/src/seo.ts`, working tree) | Live `[measured]` |
|---|---|---|
| Root `/sitemap.xml` | `<sitemapindex>` over 3 children (`SITEMAP_CHILDREN:111`) | flat `<urlset>`, **900 URLs** |
| `/sitemap-pages.xml` etc. | implemented (`index.ts:1160-1181`) | **404** |
| `<lastmod>` | `lastmodDate:132` from `palettes.createdAt` | **0 of 900 URLs** |
| `<priority>` | emitted (1.0 / 0.8 / 0.7 / 0.6 / 0.5 / 0.3) | emitted |
| Composition | — | 867 `/_seed` · 29 `/palettes/{q}` · 4 static |

Also live: `/{seed}.json` → **404** — the route exists in the working tree
(`index.ts:1266`) but `palette-json.ts` is untracked and undeployed. `/{seed}.png` → 200
with `Access-Control-Allow-Origin: *` **is** shipped.

### 2.7 Common Crawl is being served 403 — CCBot is blocked at the network layer

Querying the Common Crawl CDX index across 14 crawls (2018 → 2026-07) `[measured]`:

```
records for grabient.com : 270
status codes             : 200×202  403×30  301×23  404×11  307×4
403s by month            : 2025-12 ×5 · 2026-04 ×7 · 2026-05 ×8 · 2026-06 ×8 · 2026-07 ×2
```

Example record from **CC-MAIN-2026-30 (July 2026)**:

```json
{"url":"https://grabient.com/?ref=evernote.design","status":"403", …}
{"url":"https://grabient.com/robots.txt","status":"200", …}
```

CCBot reads `robots.txt` fine (200) and is then **403'd on the page**. `robots.txt`
itself welcomes CCBot explicitly (`seo.ts:37-74`, verified live). So this is
Cloudflare bot management / AI Crawl Control, not robots — the same class of block
that has kept the Internet Archive out since 2026-03-08
(`SEO-STRATEGY.md` Do-first #4). Common Crawl is an input to many LLM training sets and
AI search indexes, so this bears directly on the agent-visibility bet. **`SEO-STRATEGY.md`
Do-first #1 has been partly done — the managed robots.txt block is off, verified live
— but the network-layer block on CCBot is still active.**

---

## 3. Decade-old legacy URLs — what Google actually documents

### 3.1 301 vs 410/404

| Question | Answer | Source |
|---|---|---|
| What does a 301 do? | *"Googlebot follows the redirect, and the indexing pipeline uses the redirect as a signal that the redirect target should be **canonical**."* | [301 redirects](https://developers.google.com/search/docs/crawling-indexing/301-redirects), last updated **2026-04-14** `[G-doc]` |
| Strength | 301/308 = *"a **strong** signal"*; 302/307 = *"a **weak** signal"* | [HTTP status codes](https://developers.google.com/search/docs/crawling-indexing/http-network-errors), **2026-02-04** `[G-doc]` |
| "301s pass 100% of PageRank" | **`[folklore]` as a *documented* Google position.** The only primary source is one Gary Illyes tweet, **2016-07-26**: *"30x redirects don't lose PageRank anymore"* ([x.com/methode](https://x.com/methode/status/757923179641839616); [SEL 2016-07-27](https://searchengineland.com/google-no-pagerank-dilution-using-301-302-30x-redirects-anymore-254608)). **Ten years on, Google has never restated it in documentation.** Current docs describe redirects purely as a canonicalization signal. `[consensus]` that it is directionally true. |
| 404 vs 410 | *"**All 4xx errors, except 429, are treated the same**: Google crawlers inform the next processing system that the content doesn't exist."* | HTTP status codes, **2026-02-04** `[G-doc]` |
| Does 410 deindex faster? | Marginally. Mueller's **2012-05-31** correction: *"we do treat 410s slightly differently than 404s… we tend to [confirm] faster with a 410… **In practice, the difference is very small, and it's not critical to use a 410**."* ([SER](https://www.seroundtable.com/404-410-google-15225.html)) `[G-stmt]`. "410 is much faster" is `[folklore]`. |
| Should you use the Removals tool for cruft? | No. *"To clean up cruft, like old pages return 404… those pages will naturally drop out of our search results. **There's no need to request an urgent update.**"* | [Removals tool](https://support.google.com/webmasters/answer/9689846) `[G-doc]` |

**The documented way a 301 *does* cost you** — [Site moves with URL changes](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes),
last updated **2026-06-17** `[G-doc]`:

> "Don't redirect many old URLs to one irrelevant single URL destination, such as the
> home page of the new site. This can confuse users and **might be treated as a soft
> 404 error**."

Corroborated by Mueller, **2016-07-29**: *"if you have thousands of these pages, then I
wouldn't redirect them unless I had a clear replacement for them"*
([SER](https://www.seroundtable.com/google-expired-page-redirects-404-22456.html)) `[G-stmt]`,
and Glenn Gabe's case study
([gsqi.com](https://www.gsqi.com/marketing-blog/redirects-less-relevant-pages-soft-404s/)) `[consensus]`.

**Grabient's current behavior is already correct on both counts:** a decodable legacy
seed 301s to *its own* v3 URL (one-to-one, never to `/`), and an undecodable one 404s
rather than rendering a placeholder gradient at 200.

### 3.2 Google never fully forgets the old URL — and that is documented

This is the answer to "why are crawlers still hitting these?", and it is more definitive
than expected. [301 redirects](https://developers.google.com/search/docs/crawling-indexing/301-redirects),
§ *"Alternate versions of a URL"*, last updated **2026-04-14**, verbatim `[G-doc]`:

> "When you redirect a URL, Google **keeps track of both** the redirect source (the old
> URL) and the redirect target (the new URL). One of the URLs will be the canonical…
> The other URL becomes an **alternate name** of the canonical URL… **Alternate names
> may appear in search results** when a user's query hints that they might trust the old
> URL more.
>
> For example, if you moved to a new domain name, it's very likely that Google will
> **continue to occasionally show the old URLs** in the results, even though the new
> URLs are already indexed. This is normal and as users get used to the new domain name,
> **the alternate names will fade away without you doing anything**."

Reinforced by two more current pages `[G-doc]`:

- [Page indexing report](https://support.google.com/webmasters/answer/7440203): *"Googlebot
  will probably continue to try this URL for some period of time; **there is no way to
  tell Googlebot to permanently forget a URL**, although it will crawl it less and less
  often."*
- [Crawl budget](https://developers.google.com/crawling/docs/crawl-budget) (**2026-07-22**):
  *"**Google won't forget a URL that it knows about**, but a 404 status code is a strong
  signal not to crawl that URL again. **Blocked URLs, however, will stay part of your
  crawl queue much longer**, and will be recrawled when the block is removed."*

**Conclusion:** AWS-hosted crawlers requesting legacy URLs in 2026 is documented,
expected, asymptotically-decaying behavior. It is not a symptom of anything wrong, and
there is no action that stops it. That last quote is also a documented argument for
**404 over robots.txt-disallow** for junk URLs.

### 3.3 How long to keep legacy redirects: "at least 1 year", and "indefinitely" for users

[Site moves with URL changes](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes),
last updated **2026-06-17**, verbatim `[G-doc]`:

> "**Keep the redirects for as long as possible, generally at least 1 year.** This
> timeframe allows Google to transfer all signals to the new URLs…
>
> From users' perspective, **consider keeping redirects indefinitely.** However,
> redirects are slow for users, so try to update your own links and any high-volume
> links from other websites to point to the new URLs."

Mueller has said the same: *"I'd aim for at least a year"*
([SER](https://www.seroundtable.com/google-one-year-301-redirect-20893.html),
[SEJ](https://www.searchenginejournal.com/google-keep-301-redirects-in-place-for-a-year/428998/)) `[G-stmt]`.

**Answer for grabient:** the search-signal window for the 2025 lz-string seeds closes
around **2027-05**. The only documented reason not to keep them forever is *user
latency*, and the legacy path is a pure in-Worker decode with no I/O. **Keep the
lz-string fallback permanently.** Deleting `decodeLegacySeed` would convert ~239+ known
working URLs into 404s to save ~30 lines.

### 3.4 Soft 404 — the risk a generator actually runs

Documented triggers `[G-doc]`:

1. HTTP 200 with content that *"suggests an error… an empty page or an error message"*
   ([HTTP status codes](https://developers.google.com/search/docs/crawling-indexing/http-network-errors), 2026-02-04).
2. HTTP 200 with a user-friendly "not found" message
   ([Page indexing report](https://support.google.com/webmasters/answer/7440203)).
3. Bulk-redirecting many old URLs to one irrelevant destination (§3.1).
4. Zero-result filter/search pages returning 200
   ([Faceted navigation](https://developers.google.com/crawling/docs/faceted-navigation), 2025-12-18).

Google's own definition includes *"a page with no main content or empty page"*.

**Grabient's exposure is trigger 4, on `/palettes/{query}`, not on `/{seed}`.** A valid
arbitrary seed renders a genuine, distinct, usable gradient — that is real main content,
not an error page. But a nonsense query page renders 24 semantically-unrelated results
with an injected heading; that is much closer to Google's "no results, 200" case.
Google's remedy is explicit: *serve 404 at the URL where it was encountered*, do not
redirect to a shared error page.

---

## 4. Recovering link equity from a 9-year domain, for free

**The headline, and it is good news: there is very little to recover.**
`history-authority.md` §2 established, and I re-verified, that nine years of inbound
links point at `https://www.grabient.com/` (or `http://www.…`), which 301s cleanly to
the apex `[measured]`. There is no deep-link 404 surface. So this section is about
**inventory and monitoring**, not rescue — with one exception: the cleartext-HTTP
duplicate in §2.1, which is where equity is actually leaking today.

### 4.1 The two zero-cost sources that produced results here

Both of these I ran end to end today; neither needs an account, a key, or a card.

**(a) Wayback CDX API — enumerate your own historical URL space.**

```bash
curl -s "https://web.archive.org/cdx/search/cdx?url=grabient.com&matchType=domain\
&output=json&collapse=urlkey&fl=timestamp,original,statuscode,mimetype" > cdx.json
```

Result: **984 unique urlkeys, 735 distinct paths** for grabient.com `[measured]`.
Key params: `matchType=domain|prefix|host|exact`, `collapse=urlkey` (dedupe),
`fl=` (field select), `filter=statuscode:200`, `from=`/`to=` (YYYYMMDD),
`limit=`, `page=`/`showNumPages` for paging.
This is how I rebuilt the 239-URL legacy seed list in §1.2 and proved 100% of them
still 301. **This is the canonical free way to build a legacy redirect map.**

**(b) The `?ref=` trick — a free backlink list hiding in the archive.**

Directory and roundup sites append tracking params when they link out. Those
parameterised URLs get archived, so the archive *is* a partial backlink index:

```bash
python3 -c "
import json,urllib.parse,collections
rows=json.load(open('cdx.json'))[1:]
refs=collections.Counter()
for ts,orig,sc,mt in rows:
    q=urllib.parse.parse_qs(urllib.parse.urlparse(orig).query)
    for k in ('ref','from','source','utm_source'):
        for v in q.get(k,[]): refs[(k,v)]+=1
print(len(refs)); [print(k,'=',v) for k,v in sorted(refs)]"
```

**48 distinct referrer-tagged values** across `ref`/`from`/`source`/`utm_source`
`[measured]` — an independent replication of `history-authority.md` §3b, which reported
46 from the same source. The two-value difference is a key-set detail, not a
disagreement; treat ~48 as the archive-derivable referrer count.

**(c) Common Crawl CDX — a second, independent referrer index.**

```bash
curl -s "https://index.commoncrawl.org/collinfo.json"          # 126 crawls, 2013→2026-07
curl -s "https://index.commoncrawl.org/CC-MAIN-2026-30-index?url=grabient.com%2F*&output=json&limit=1000"
```

Free, no key, no S3, no Athena, no requester-pays. Across 14 crawls it returned 270
records for grabient.com and **18 distinct referrer values — two of which
(`?ref=toools`, `?ref=usetools`) are absent from the Wayback-derived list of 46**
`[measured]`. So the two indexes are complementary; run both. It also surfaced the
CCBot 403 problem in §2.7, which no backlink tool would have shown.

For inbound links *from other domains* (rather than referrer params on your own URLs),
Common Crawl's columnar index on S3 supports a `SELECT … WHERE url_host_name = 'grabient.com'`
over outlinks — but that path needs Athena or a large download and is **not** free at
scale. The free CDX API only indexes URLs *on* the queried host. Say so plainly rather
than pretending otherwise.

### 4.2 The full free-source table

| Source | What it gives | Real limits | Programmatic access | Free? |
|---|---|---|---|---|
| **GSC Links report** | Top linking sites, top linking pages, top linked pages, anchor text | Sampled; export capped at **1,000 rows** per table; no historical trend | **No API — verified.** I enumerated the live v1 discovery document `[measured]`: the only resources are `searchanalytics`, `sitemaps`, `sites`, `urlInspection.index` and `urlTestingTools.mobileFriendlyTest`. **There is no `links` resource.** Export is manual (CSV/Sheets). | Yes, needs verified property |
| **Bing Webmaster Tools** | Backlinks report + "Similar sites" competitor backlink comparison — the only free tool that shows *competitors'* backlinks | Bing's index ≠ Google's; paginated (`TotalPages` in the response); row caps on UI export | **Verified endpoint** (Microsoft Learn, [`IWebmasterApi.GetUrlLinks`](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.geturllinks)): `GET https://ssl.bing.com/webmaster/api.svc/json/GetUrlLinks?siteUrl=…&link=…&page=0&apikey=…` → `{"d":{"Details":[{"AnchorText":…,"Url":…}],"TotalPages":n}}`. API key is free from the WMT UI. ChatGPT search rides Bing, so this doubles as AI-visibility monitoring. **Not yet signed up** — `SEO-STRATEGY.md` Do-first #8. | Yes |
| **Wayback CDX** | Your own historical URL space; `?ref=` referrer evidence | Only URLs the archive captured; **grabient has been 403-blocked since 2026-03-08** so recent state is missing | See §4.1(a) | Yes |
| **Common Crawl CDX** | Independent capture of your URLs + referrer params; crawl status codes | Only URLs *on* the queried host via the free API; inbound-link extraction needs Athena/S3 | See §4.1(c) | Yes (CDX API) |
| **Ahrefs Webmaster Tools** | Genuinely free backlink report **for your own verified domain** — the closest free substitute for a paid Ahrefs seat. Site Explorer *"shows… who links to your website"* | **Verified on [ahrefs.com/webmaster-tools](https://ahrefs.com/webmaster-tools):** *"1 K backlinks & keywords visible at once"*, Site Audit *"5 K crawl credits/month per project"*. Own verified sites only. For grabient's ~50-link profile, 1,000 rows is not a binding limit. | UI + export; no free API | Yes, verification required |
| **Moz Link Explorer free tier** | Domain Authority, a sample of linking domains | `[unverified]` — moz.com blocks automated fetching, so I could not confirm the current query cap or row limit. Historically a small monthly allowance on a free account. **Verify in the UI before relying on it.** The Moz API is paid. | Manual UI | Partly |
| **OpenPageRank (domcop)** | Domain-level rank score only | **No link data at all** — a score, not an inventory. Useful for prioritising outreach targets, useless for finding links. | Free API key, bulk domain lookup | Yes |
| **Your own logs / Cloudflare analytics** | *Live* referrers — links that are actually sending humans, which is strictly better signal than an index snapshot | Referrer header is often stripped; bot floods pollute it | Cloudflare Analytics + the existing `apps/admin` pipeline | Yes |

The `apps/admin` worker already has a GSC service account and read-only API access
(`apps/admin/src/search-console.ts`), so the GSC-side automation is already half-built —
see §8.2.

**Where a paid tool is genuinely the only answer:** a *comprehensive*, deduplicated,
historical inbound-link graph with lost/new-link alerts. Ahrefs/Semrush/Majestic own
that and there is no free equivalent. **The best free approximation is the union of
GSC Links + Bing WMT + Ahrefs Webmaster Tools + the two archive indexes above**, which
for grabient's ~50-link profile is very likely near-complete.

---

## 5. Crawl budget for an unbounded generated URL space

### 5.1 Definitions, verbatim

[Optimize your crawl budget](https://developers.google.com/crawling/docs/crawl-budget),
last updated **2026-07-22** `[G-doc]`:

- **Site = hostname.** *"Google's crawling infrastructure defines a site as a **unique
  hostname**."* → grabient.com's 867 real palettes and its entire unbounded seed space
  share **one** budget. There is no partitioning by path.
- **Crawl capacity limit** (the term "crawl rate limit" is retired): *"This limits the
  **total amount of time your server spends holding connections open for Google**,
  factoring in both the number of parallel connections and their duration."* Raised by
  stable/fast responses; lowered by slowdowns, `5xx`, or `429`.
- **Crawl demand**: driven by *"perceived inventory"*, popularity and staleness.
  *"Without guidance from you, Google tries to crawl all or most of the URLs **that it
  knows about** on your site… **This is the factor that you can positively control the
  most.**"*
- New in the 2026 rewrite: *"the crawl capacity limit is **shared across all
  crawlers**."*

### 5.2 Site-size thresholds — grabient is three orders of magnitude below

Verbatim `[G-doc]`, same page:

> "If your site doesn't have a large number of pages that change rapidly, or if your
> pages seem to be crawled the same day that they are published, **you don't need to
> read this guide.**"
>
> "- **Large sites (1 million+ unique pages)** with content that changes moderately
> often (once a week)
> - **Medium or larger sites (10,000+ unique pages)** with very rapidly changing content
> (daily)
> - Sites with a large portion of their total URLs classified by Search Console as
> **Discovered - currently not indexed**
>
> The numbers given here are a **rough estimate**… **These are not exact thresholds.**"

Three more current Google pages say the same for a site this size `[G-doc]`:

- [Crawl Stats report](https://support.google.com/webmasters/answer/9679690): *"If you
  have a site with **fewer than a thousand pages**, you should not need to use this
  report."*
- [Page Indexing report](https://support.google.com/webmasters/answer/7440203): *"If your
  site has **fewer than 500 pages**, you probably don't need to use this report."*
- [Sitemaps report](https://support.google.com/webmasters/answer/7451001): *"If you have a
  small site (…about **500 pages or fewer**…) you probably don't need a sitemap."*

Illyes, **2017-01-16** `[G-stmt]`: *"if a site has **fewer than a few thousand URLs**,
most of the time it will be crawled efficiently"* — with the caveat that matters here:
*"Prioritizing what to crawl… is more important for bigger sites, **or those that
auto-generate pages based on URL parameters**."*
([blog](https://developers.google.com/search/blog/2017/01/what-crawl-budget-means-for-googlebot);
Google has stamped this post *"Some of the information may be outdated."*)

**Only the third bullet can put grabient in scope, and it is an empirical question, not
a theoretical one.**

### 5.3 Does serving millions of low-value URLs harm the good ones? The honest answer

**Google's documented position: it *can*.** [Troubleshoot crawling errors](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors),
last updated **2025-12-18**, verbatim `[G-doc]`:

> "Wasting server resources on unnecessary pages can reduce crawl activity from pages
> that are important to you, which may cause a significant delay in discovering great
> new or updated content on a site."
>
> "**Exposing many URLs on your site that you don't want crawled by Search can
> negatively affect a site's crawling and indexing.** Typically these URLs fall into the
> following categories: Faceted navigation and session identifiers · Duplicate content ·
> soft 404 pages · Hacked pages · **Infinite spaces and proxies** · Low quality and spam
> content · Shopping cart pages, infinite scrolling pages…"

**But the mechanism is gated, and Google states the gate twice** `[G-doc]`:

> "Google won't shift this newly available crawl budget to other pages **unless Google
> is already hitting your site's crawl capacity limit**." — crawl-budget doc, 2026-07-22
>
> "Blocking or hiding already crawled pages from recrawls won't shift your crawl budget
> to another part of your site **unless Google is already hitting your site's serving
> limits**." — troubleshoot-crawling-errors, 2025-12-18

And you cannot buy budget with speed either: *"just making low quality pages faster
won't encourage Googlebot to crawl more of your site"* `[G-doc]`.

**Three documented facts that defuse most of the folklore:**

[Myths about crawling](https://developers.google.com/crawling/docs/myths-about-crawling),
last updated **2025-12-18** `[G-doc]` — a page created in the doc migration, directly on
point:

| Myth | Google's verdict |
|---|---|
| "Google prefers clean URLs and doesn't like query parameters" | **False.** *"We can crawl parameters."* |
| "Small sites aren't crawled as often as big ones" | **False.** *"If a site has important content that changes often, we crawl it often, **regardless of the size**."* |
| "Pages that serve 4xx are wasting crawl budget" | **False.** *"Pages that serve 4xx HTTP status codes (except 429) **don't waste crawl budget**."* |
| "Crawling is a ranking factor" | **False.** *"while crawling is necessary for a page to be in search results, **it's not a ranking signal**."* |

That last row breaks the folk syllogism "junk URLs waste crawl budget → therefore
rankings drop". The middle step is undocumented.

**Dated Googler statements, and this one is almost written for grabient** — Mueller,
Twitter, **2020-11-09** `[G-stmt]`:

> "**Crawling is independent of website size. Some sites have a gazillion (useless) URLs
> and luckily we don't crawl much from them.**"
> — via [SEJ, 2020-11-10](https://www.searchenginejournal.com/googles-mueller-on-crawl-rate-for-big-and-small-sites/387118/)

Mueller, **2021-12-21**: *"100k URLs is usually not enough to affect crawl budget"*
([SER](https://www.seroundtable.com/google-100k-urls-wont-impact-crawl-budget-32631.html)) `[G-stmt]`.

And Google's newest framing, [About crawling](https://developers.google.com/crawling/docs/about-crawling)
(added **2026-03-03**) `[G-doc]`:

> "as our crawlers discover more of a website, **they're also able to recognize sections
> that can be covered with less crawling; for example, calendars that go to the year
> 9999 probably don't need to be crawled in their entirety.** Site owners can help by
> identifying what content doesn't need to be crawled, **which saves websites money by
> lowering their infrastructure costs**."

Note the framing: the site owner's benefit is **your server bill**, not your rankings.

**What is genuinely unproven, stated plainly:**

- No Google statement, documented or dated, says a site with <1,000 sitemap URLs and an
  unbounded generated space suffers measurable crawl-budget harm. **None.**
- Google has never published a ratio or threshold for junk-to-good URLs. Every number in
  SEO blogs on this is invented `[folklore]`.
- The circulating "Illyes 2025" crawl-scheduling quotes and the "Mueller: crawl budget is
  over-rated" line could not be traced to any primary source `[unverified]` — **do not
  cite them.** The documented equivalents above say the same thing with real citations.

**Verdict for grabient: the unbounded space is a latent risk, not a demonstrated crawl
problem. Its real costs are (a) Worker CPU/spend and (b) index-bloat / quality
classification / spam-injection — not crawl budget.** But it should still be fixed,
because the fix is documented, prescriptive, and free of downside (see §5.4).

### 5.4 The cheapest documented fix, and the one to never use

**Do: 404 nonsensical generated URLs.** Three docs converge `[G-doc]`:

- 4xx (except 429) *"don't waste crawl budget"* — myths, 2025-12-18.
- *"Return an HTTP 404 status code when a filter combination doesn't return results…
  otherwise nonsensical filter combinations"* — faceted navigation, 2025-12-18.
- *"a 404 status code is a strong signal not to crawl that URL again. **Blocked URLs,
  however, will stay part of your crawl queue much longer**"* — crawl-budget, 2026-07-22.

That last clause is a documented argument for **404 over robots.txt-disallow** here.
`/{seed}` already 404s undecodable input (`index.ts:1284`); `/palettes/{query}` does not
and should.

**Never: rate-limit Googlebot with 429/503.** [Reduce the Google crawl rate](https://developers.google.com/crawling/docs/crawlers-fetchers/reduce-crawl-rate) `[G-doc]`:

> "The reduced crawl rate affects the **whole hostname** of your site… both the crawling
> of the URLs that return errors, as well as the URLs that return content."
> "if Googlebot observes these status codes on the same URL for multiple days, **the URL
> may be dropped from Google's index**."

`SEO-STRATEGY.md` Do-first #3 proposes a Cloudflare rate-limiting rule with a **429**
action and reasons that *"Google treats 429 as overload and slows down, while 403 drops
URLs from the index."* **That reasoning is half right and the conclusion needs a
caveat.** 403 does not drop URLs any faster than 404 (all 4xx except 429 are treated
identically, and *"The 4xx status codes, except 429, have no effect on crawl rate"*),
whereas **429 throttles the entire hostname** — including the 867 pages you want
crawled. The rule's `not cf.client.bot` clause exempts verified Googlebot, which is the
thing making it safe; the 429-vs-403 argument is not. Keep the verified-bot exemption
and treat it as load-bearing, not optional.

**Also cheap and documented:** support `304 Not Modified` — *"If a page hasn't changed
since Google last crawled it, returning a 304 code tells Google to reuse the cached
version, saving your server bandwidth and resources"* (crawl-budget, 2026-07-22)
`[G-doc]`. Grabient serves deterministic renders from a seed; conditional requests are
a natural fit and would cut Worker CPU on the recrawl of 867 static-content pages.

---

## 6. "Discovered / Crawled – currently not indexed"

### 6.1 The two states are different and have different causes

Verbatim from the [Page Indexing report](https://support.google.com/webmasters/answer/7440203) `[G-doc]`:

> **Discovered - currently not indexed:** "The page was found by Google, but not crawled
> yet. Typically, Google wanted to crawl the URL but this was expected to overload the
> site; therefore Google rescheduled the crawl. This is why the last crawl date is empty
> on the report."
>
> **Crawled - currently not indexed:** "The page was crawled by Google but not indexed.
> It may or may not be indexed in the future; no need to resubmit this URL for
> crawling."

| | Discovered | Crawled |
|---|---|---|
| Fetched? | **No** | **Yes** |
| Google's stated cause | Crawl scheduling / predicted overload | **None given — the doc is silent** |
| What it says about content | **Nothing** | Google saw it and declined |

**The "expected to overload the site" wording is boilerplate written for large sites and
almost certainly does not apply literally here.** The falsifiable test is documented:
Crawl Stats → host availability graph (is Googlebot crossing the red limit line?) and
URL Inspection returning **"Hostload exceeded"** `[G-doc]`. If neither fires, read
"Discovered" as **crawl *demand***, i.e. Google predicting the URL isn't worth the
fetch — which is a value signal, not a capacity one.

### 6.2 What has demonstrably moved the needle

**Quality gating index inclusion is a live, current Google position.** Mueller and
Splitt, *Search Off the Record*, **2026-07-16**:

> "So, it's definitely the case if our systems are seriously worried about the quality of
> the website that they will reduce the number of pages at the index."
> — reported by [SEJ, 2026-07-17](https://www.searchenginejournal.com/google-explains-seo-connection-of-site-quality-to-non-indexed-pages/582683/)
> and [ppc.land, 2026-07-16](https://ppc.land/google-buries-good-pages-as-commodity-content-loses-index-spot-haynes-finds/)

`[G-stmt]` — **secondary sourcing only**; the primary transcript could not be retrieved.
Treat the exact wording as ~90% reliable and the substance as solid (it matches years of
prior Mueller messaging).

**Scaled content abuse — the policy, the date, and whether it catches a generator.**
Introduced **2024-03-05** with the March 2024 core update
([Google blog](https://blog.google/products/search/google-search-update-march-2024/)),
expanding the old "automatically generated content" policy to content produced *"at
scale to boost search ranking — whether automation, humans or a combination are
involved."* Current wording
([Spam policies](https://developers.google.com/search/docs/essentials/spam-policies),
last updated 2026-05-15) `[G-doc]`:

> "Scaled content abuse is when many pages are generated **for the primary purpose of
> manipulating search rankings and not helping users**."

**Does it catch grabient?** Probably not — the operative test is *primary purpose*, and
a permalink that renders a real, distinct, copyable gradient is a functional tool page,
not generated filler. But the margin is thinner than comfortable while 867 pages differ
only in hex triplets (§2.5), and **`/palettes/{spam-keywords}` moves toward the policy's
own examples**. Practical check: a scaled-content-abuse finding is a **spam action** and
would appear in **Manual Actions**. A clean Manual Actions report means this is
algorithmic deprioritization — a different and far more recoverable problem.

**What is *not* established:**

- No credible controlled study isolates click depth as a **cause** of indexation
  `[folklore]`; see §2.4.
- No credible controlled study shows sitemap-only URLs index at a lower rate `[folklore]`.
  Google documents sitemaps as a *hint* (*"submitting a sitemap is merely a hint"*) and
  internal linking as how it gauges importance — a coherent mechanism, not a measured
  effect size. Anyone quoting you a number is making it up.

**`<lastmod>` accuracy is binary and site-wide** — Illyes, LinkedIn, **2024-06-11**:
*"**It's binary: we either trust it or we don't.**"*
([SEJ](https://www.searchenginejournal.com/googles-gary-illyes-lastmod-signal-is-binary/519239/)) `[G-stmt]`,
and Bluesky, **2026-07-16**, on an implementation emitting wrong dates: *"**probably
better off without the lastmods. at least you save a few bytes.**"*
([SER](https://www.seroundtable.com/google-lastmod-dates-incorrect-41697.html)) `[G-stmt]`.

**Indexing API is still JobPosting/BroadcastEvent only** —
[quickstart](https://developers.google.com/search/apis/indexing-api/v3/quickstart) and
[using the API](https://developers.google.com/search/apis/indexing-api/v3/using-api),
both last updated **2026-07-16** `[G-doc]`: *"The Indexing API can only be used to crawl
pages with either `JobPosting` or `BroadcastEvent` embedded in a `VideoObject`."* Plus
*"Don't circumvent our submission limits."* **Not a loophole for palette pages.**

---

## 7. Sitemap strategy at scale

### 7.1 Limits (none of which bind here)

`[std]` [sitemaps.org](https://www.sitemaps.org/protocol.html): **50,000 URLs / 50 MB
uncompressed** per file; sitemap index files may list **≤50,000 sitemaps**, ≤50 MB;
*"You can have more than one Sitemap index file"*; an index may only reference sitemaps
**on the same site**.

`[G-doc]` [Build a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
(last updated **2026-07-08**) restates 50k/50MB; [Large sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps)
(last updated **2025-12-10**) adds two Google-specific rules: **≤500 sitemap index files
per property**, and referenced sitemaps must be *"in the same directory as the sitemap
index file, or lower in the site hierarchy."*

**Nesting an index inside an index is not supported** — both schemas make `<sitemap>`
the only child of `<sitemapindex>` and `<loc>` its only child. Practitioner reports that
Google "accepts" nesting are `[folklore]`; don't. The ceiling without nesting is 2.5 B
URLs per index × 500 indexes.

**Grabient's 900 URLs are 1.8% of one file.** Any advice premised on sitemap size limits
does not apply.

### 7.2 `<lastmod>` yes (if honest), `<changefreq>`/`<priority>` no

`[G-doc]` build-sitemap, **2026-07-08**: *"**Google ignores `<priority>` and
`<changefreq>` values.**"* Illyes, **2023-06-26**: *"`priority` is a heavily subjective
field and **based on our internal studies, it generally doesn't accurately reflect the
actual priority of a page**"*
([Sitemaps ping endpoint is going away](https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping)) `[G-stmt]`.
Even sitemaps.org hedges: *"assigning a high priority to all of the URLs on your site is
not likely to help you."* `[std]`

**Grabient emits `<priority>` on all 900 URLs and it is pure dead weight** (`seo.ts:117-129`).

`<lastmod>` `[G-doc]`: *"Google uses the `<lastmod>` value **if it's consistently and
verifiably accurate**… should reflect the date and time of the **last significant
update**."* Illyes, **2023-06-26**: *"it needs to consistently match reality… eventually
we're not going to believe you anymore"*, and *"You can use a `lastmod` element for all
the pages in your sitemap, **or just the ones you're confident about**."*

The uncommitted implementation uses `palettes.createdAt` (`seo.ts:132-137`,
`queries/palettes.ts:168`). That is *honest but conservative*: a palette's rendered
content never changes, so createdAt is a defensible "last significant update", and it
will never be the "always today" failure mode that destroys trust. **Ship it.** Do not
substitute a build timestamp.

### 7.3 Should the unbounded space be in the sitemap? No — and it already isn't

`[G-doc]` build-sitemap, **2026-07-08**: *"**Include the URLs in your sitemap that you
want to see in Google's search results.**"* troubleshoot-crawling-errors, **2025-12-18**,
under *Avoid*: *"**Including URLs in your sitemaps that you don't want to appear in
Search. This can waste your crawl budget on pages that you don't want indexed.**"*

**Grabient's curated 900-URL sitemap is already exactly what Google documents.** The
sitemap is not where the risk is; the risk is on the discovery/linking side.

One nuance: **a sitemap is not a whitelist.** Google's Page Indexing docs note a URL
counts as sitemap-submitted *"even if it was also discovered through some other
mechanism"* `[G-doc]` — omitting seed URLs from the sitemap does not stop Googlebot
crawling them if they are linked. Only 404s, robots.txt, or not linking them does.

### 7.4 Pruning: half documented, half folklore

- **Documented (hygiene):** don't list URLs you don't want in Search — §7.3.
- **Documented (diagnostics):** *"You can submit multiple sitemaps and sitemap index
  files to Google. **This may be useful if you want to track the search performance of
  each individual sitemap in Search Console.**"* `[G-doc]` build-sitemap, 2026-07-08.
  This is the **sole documented rationale** for splitting below 50k — and it is exactly
  the rationale already written into `seo.ts:95-105`. Ship it.
- **Folklore:** that removing low-quality URLs from a sitemap improves indexing of the
  ones you keep. **No Google source says this.** Google describes sitemaps only as
  discovery (*"submitting a sitemap is merely a hint"*), states that deleting a sitemap
  does not make Google forget its URLs, and explicitly forbids the tactic: *"**Don't
  rotate sitemaps or use other temporary hiding mechanisms to reallocate budget.**"*
  `[G-doc]` troubleshoot-crawling-errors, 2025-12-18.

**The instrument to actually use:** GSC Page Indexing → **Sitemap filter → "Unsubmitted
pages only"** `[G-doc]`. That is the purpose-built, documented way to count URLs Google
knows about on grabient.com that are *not* your 900 curated ones — i.e. the direct
measurement of whether the unbounded space is leaking into discovery. **Run this before
drawing any conclusion about crawl budget.**

### 7.5 Ping is dead; IndexNow is the live channel

Google's sitemap ping endpoint was deprecated **2023-06-26** (Illyes) and removed ~6
months later; the page now reads *"The sitemaps ping endpoint deprecation is complete."*
Reason given: *"the vast majority of the submissions lead to spam."* `[G-stmt]`.
Bing killed anonymous ping first, **2022-05-13** (Fabrice Canel,
[Bing blog](https://blogs.bing.com/webmaster/may-2022/Spring-cleaning-Removed-Bing-anonymous-sitemap-submission)),
and recommends IndexNow instead.

[IndexNow FAQ](https://www.indexnow.org/faq) `[std]`: shared across **Bing, Yandex,
Naver, Seznam, Yep, Amazon**; ≤10,000 URLs per POST; key file at site root. Crucially:
*"**Every URL submitted through IndexNow counts toward your site's crawl quota**"* and
*"Submitting unnecessary updates may lead to wasted crawl quota without improving
visibility."* → submit **only** the ~867 curated palettes, on real change.
`SEO-STRATEGY.md` Do-first #5 (Cloudflare Crawler Hints) is the zero-code way to get
this and remains correct.

**Google's IndexNow position: not documented anywhere.** IndexNow appears in none of
Google's sitemaps, crawling, or changelog pages `[G-doc, by omission]`. The commonly
repeated "Google said in Nov 2021 it would test it" story could not be traced to a
primary source `[unverified]`. State it as "undocumented", not "unsupported".

**Google's documented replacement for ping is the Search Console API.** I enumerated the
live v1 discovery document `[measured]`: the API exposes exactly
`searchanalytics.query`, `sitemaps.{submit,delete,get,list}`, `sites.*`,
`urlInspection.index.inspect`, and `urlTestingTools.mobileFriendlyTest.run`.
`sitemaps.submit` is the authenticated equivalent of the dead ping endpoint, and
`apps/admin` already holds a GSC service account with `webmasters.readonly` — a
write scope would be needed to use it.

---

## 8. "Referring page: None detected"

### 8.1 Google documents that you cannot read it the way it reads

[URL Inspection tool help](https://support.google.com/webmasters/answer/9012289) `[G-doc]`,
verbatim:

> **Referring page:** "A page that Google **possibly** used to discover this URL. The
> referring page might directly link to this URL, or it might be a grandparent or
> great-grandparent of a page that links to this URL."
>
> "**If this value is absent it doesn't mean that no referring page exists, just that
> this information might not be available to the tool at this time.**"
>
> "If you see 'URL might be known from other sources that are currently not reported', it
> means that Google found this URL through some means other than a sitemap or referring
> page, but the referring information currently isn't available to this tool."

I verified this wording by fetching the help page directly `[measured]`.

**So "None detected" is not evidence of orphanhood.** Three separate weakeners are baked
into the field: it reports a page Google *"possibly"* used; it may report a grandparent
rather than the actual linking page; and Google pre-emptively disclaims absence.

**But the underlying worry is correct anyway — for a reason you can measure yourself.**
§2.4: a seed page has 9 links and zero seed/query outbound links; the corpus is reachable
only through 37 pages of pagination. **Don't diagnose orphanhood from URL Inspection;
diagnose it by crawling your own site** (or, as here, by counting `href="/_` in the SSR
HTML). That takes minutes and gives a definitive answer.

### 8.2 The API *does* expose `referringUrls` — and grabient already reads it

I fetched Google's live discovery document
(`https://searchconsole.googleapis.com/$discovery/rest?version=v1`) and enumerated
`IndexStatusInspectionResult` `[measured]`:

| Field | Google's description |
|---|---|
| `verdict` | High-level verdict about whether the URL is indexed |
| `coverageState` | Could Google find and index the page |
| **`referringUrls`** | **"URLs that link to the inspected URL, directly and indirectly."** |
| `sitemap` | *"Not guaranteed to be an exhaustive list…"* |
| `lastCrawlTime`, `crawledAs`, `robotsTxtState`, `indexingState`, `pageFetchState` | — |
| `googleCanonical`, `userCanonical` | — |

Quota `[G-doc]` ([Search Console API limits](https://developers.google.com/webmaster-tools/limits)):
**2,000 queries/day and 600/minute per property.**

**The entire 867-URL corpus fits inside one day's quota with 56% headroom, and sweeps in
under 2 minutes at 600 QPM.** And the code already exists:
`apps/admin/src/search-console.ts:344` (`inspectUrl`) already returns `verdict`,
`coverageState`, `lastCrawlTime`, `googleCanonical`, `userCanonical`, `sitemaps` **and
`referringUrls`** (line 379). What is missing is a batch driver and somewhere to store
the history. That is the single highest-leverage piece of free instrumentation available
here: a nightly sweep turns every question in §6 from an argument into a time series.

---

## 9. Parameter handling in 2026

### 9.1 The tool is gone and Google says do nothing

["Spring cleaning: the URL Parameters tool"](https://developers.google.com/search/blog/2022/03/url-parameters-tool-deprecated),
**Gary Illyes, 2022-03-28**, shut down ~2022-04-26 `[G-stmt]`:

> "only about 1% of the parameter configurations currently specified in the URL
> Parameters tool are useful for crawling."
>
> "**Going forward you don't need to do anything to specify the function of URL
> parameters on your site, Google's crawlers will learn how to deal with URL parameters
> automatically.** If you need more control, you can use **robots.txt rules**… or use
> **hreflang**."

Note what Google named as replacements: robots.txt and hreflang. `rel=canonical` was not
mentioned there — but it is named elsewhere, below.

### 9.2 The current mechanisms, in Google's own strength order

[How to specify a canonical URL](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls),
last updated **2026-07-10**, verbatim `[G-doc]`:

> "These are, **in order of how strongly they can influence canonicalization**:
> - **Redirects**: A strong signal…
> - **`rel="canonical"` link annotations**: A strong signal…
> - **Sitemap inclusion**: A weak signal…
>
> Keep in mind that these methods **can stack**…"

Plus *"preferring HTTPS over HTTP"* as a site-setup signal — which loops back to §2.1.

The same doc explicitly names grabient's case as a legitimate target:
duplicate content arises from *"**Site functions**: for example, the results of
**sorting and filtering functions** of a category page."*

### 9.3 Is `rel=canonical` alone sufficient? Yes — with two documented failure modes

[What is canonicalization](https://developers.google.com/search/docs/crawling-indexing/canonicalization),
last updated **2026-07-10** `[G-doc]`:

> "You can indicate your preference to Google using these techniques, but **Google may
> choose a different page as canonical than you do… indicating a canonical preference is
> a hint, not a rule.**"
>
> "**If Google finds multiple pages that seem to be the same or the primary content very
> similar, it clusters them together.**"

**Failure mode 1 — the cluster never forms.** `rel=canonical` only operates *within* a
similarity cluster Google builds by comparing primary content. If `?style=angularSwatches`
renders visibly different primary content, Google may decline to cluster it, and an
unclustered page cannot be canonicalized away. GSC surfaces this as *"Duplicate, Google
chose different canonical than user"* / *"Duplicate without user-selected canonical"*
`[G-doc]`.

**Failure mode 2 — it is slow.** Illyes, **2024-12-17**: *"You can also use
`rel="canonical"` to help consolidate signals… **This one takes time to get picked up.**"*
([Crawling December: Faceted navigation](https://developers.google.com/search/blog/2024/12/crawling-december-faceted-nav)) `[G-stmt]`.
The faceted-nav doc demotes it further: canonical and nofollow are *"generally **less
effective in the long term**"* than blocking or fragments.

**What grabient already does is correct** `[measured]`:

| Request | Response |
|---|---|
| `/{seed}?style=linearSwatches&steps=7&angle=120` | 200, `<link rel="canonical" href="https://grabient.com/{seed}">` — **bare, no params** |
| `/{seed}?style=bogus` | **301** → `/{seed}` |
| `/{seed}?steps=99999` | **301** → `/{seed}` |
| `/?page=2` | 200, self-canonical `…/?page=2` — correct for pagination |

Valid view params get a bare canonical; invalid ones get a 301 (`normalizeSearch`,
`index.ts:1285-1287`). That is textbook. **No change needed, and specifically:**

- **Do not robots.txt-disallow the params.** *"Don't use the robots.txt file for
  canonicalization purposes. Google may still index URLs that are disallowed in
  robots.txt **without their content**."* `[G-doc]`. A blocked URL's canonical can never
  be read.
- **Do not `noindex` them.** *"We don't recommend using `noindex` to prevent selection of
  a canonical page within a single site, because it will completely block the page from
  Search. `rel="canonical"` link annotations are the preferred solution."* `[G-doc]`.
- **The one real upgrade available:** Google's URL-structure doc says *"**Use as few
  parameters as you can** — shorten URLs by trimming unnecessary parameters (meaning,
  parameters that don't change the content)."* `[G-doc]`
  ([URL structure](https://developers.google.com/search/docs/crawling-indexing/url-structure)).
  And the faceted-nav doc notes URL **fragments** *"will have **no impact on crawling
  (positive or negative)**"* `[G-doc]`. If `style/steps/angle` ever moved to `#style=…`,
  the parameter question dissolves rather than being managed. That is a product decision
  (it would break every existing shared link and the documented `llms.txt` API), so it is
  listed as an option, not a recommendation.

One small gap `[measured]`: unknown params are **not** stripped — `/{seed}?utm_source=x`
and `/{seed}?cb=123` both return 200 rather than 301ing to the bare URL. The canonical
still points at the bare URL so it is handled correctly, but 301ing unknown params would
be strictly better and matches what `normalizeSearch` already does for known ones.

---

## 10. Where the existing docs are wrong or outdated

| Claim | Where | Correction |
|---|---|---|
| The legacy URL format is "from the original 2017-era site" | task framing; implied by "9-year-old legacy URLs" | **Wrong.** Grabient 1 had exactly one URL; the lz-string format first appears **2025-05-16**. `[measured]` §1.3 |
| *"Redirect hygiene is already good. Nothing to fix here."* | `history-authority.md` §2 | **True for `https://www.`, wrong for `http://`.** Cleartext HTTP serves a cached **200**, and `http://www.{legacy-seed}` is a 3-hop chain. `[measured]` §2.1–2.2 |
| *"Unbounded crawl traps… True but unsized — nothing links a gibberish query."* | `SEO-PASSOFF.md` line 194 | **Sound for accidental traps, wrong for `/palettes/{q}`**, which reflects arbitrary text into title/H1/description. In a doorway attack the attacker supplies the links. `[measured]` §2.3 |
| `http://grabient.com` cached-200 listed under "11 more" minor items | `SEO-PASSOFF.md` line 150 | Correctly identified, **wrongly triaged.** It is a sitewide duplicate of every URL and the direct explanation for the http:// index entries. Promote to a Do-first dashboard toggle. §2.1 |
| Cloudflare managed robots.txt AI block is live | `SEO-STRATEGY.md` Do-first #1 | **Done** — live robots.txt now leads with the "all crawlers welcome" comment `[measured]`. But **CCBot is still 403'd at the network layer** (30 of 270 Common Crawl records, through 2026-07). The task is not finished. §2.7 |
| Split sitemap + `<lastmod>` described as planned Phase-1 work | `SEO-STRATEGY.md` Phase 1.2 | **Already written** in `seo.ts` and `index.ts:1158-1181`; simply **not deployed**. Live sitemap is still a flat 900-URL urlset with 0 lastmod. §2.6 |
| Rate-limit with 429 because *"403 drops URLs from the index"* | `SEO-STRATEGY.md` Do-first #3 | **Half wrong.** All 4xx except 429 are treated identically and *"have no effect on crawl rate"*; 429 **throttles the entire hostname** and can drop URLs after multiple days. The `not cf.client.bot` exemption is what makes the rule safe — treat it as mandatory. §5.4 |
| Crawl budget framed as a live risk from the unbounded space | implied throughout | Google's guide is scoped to 1M+ pages; the harm mechanism is gated on already hitting capacity; 4xx costs nothing. The real costs are **spend, index bloat, and the injection vector** — not crawl budget. §5.3 |
| `<priority>` in the sitemap | `seo.ts:117-129`, all 900 URLs | **Google ignores it** (documented) and Illyes says it *"doesn't accurately reflect the actual priority"*. Dead weight. §7.2 |
| Google docs cited as `…/search/docs/crawling-indexing/large-site-managing-crawl-budget` | any doc citing crawl budget | Now **301s** to `…/crawling/docs/crawl-budget`; the whole crawling section moved in Nov–Dec 2025. |

---

## 11. Prioritized actions

Confidence = how sure I am the action does what it says. Impact = expected effect on
grabient's organic search, not on abstract cleanliness.

### Tier 1 — do this week

| # | Action | Type | Impact | Confidence |
|---|---|---|---|---|
| 1 | **Cloudflare → SSL/TLS → Edge Certificates → "Always Use HTTPS" = ON.** Then verify with the 3-command cache test in §2.1. Kills a sitewide cleartext-HTTP 200 duplicate of every URL and collapses the `http://www.` chain by one hop. | `[dashboard]` | **High** — this is where equity is leaking today, and it explains the http:// index entries | **High** — behavior measured and reproducible; only the product-ordering vs cache is unverified, hence the verify step |
| 2 | **Gate `/palettes/{query}`: 404 on off-corpus queries.** Follow `SEO-STRATEGY.md` Phase 2.6's calibration discipline (log Vectorize score distributions for the 49 sitemap queries first, exempt sitemap-listed queries, keep backend failure `no-store` **without** noindex) — but **404**, not noindex, per Google's faceted-nav guidance. Also cap slug length and reject slugs whose tokens are all out-of-vocabulary. | `[code]` | **High** — closes a keyword-injection surface on a 9-year domain; the one item on Google's documented harm list grabient actually matches | **High** on the risk; **Medium** on threshold choice until calibrated |
| 3 | **Deploy the split sitemap + `<lastmod>` that is already written.** `seo.ts` + `index.ts:1158-1181` are done; production still serves a flat 900-URL urlset with zero lastmod and three 404ing children. Drop `<priority>` in the same pass — Google documents that it is ignored. | `[code]` | **Medium** — unlocks per-family indexing reporting, the only documented reason to split | **High** |
| 4 | **GSC: Page Indexing → Sitemap filter → "Unsubmitted pages only"**, plus Crawl Stats → host availability (red limit line) and a URL Inspection spot-check for "Hostload exceeded". This is the documented instrument that answers "is the unbounded space actually leaking into discovery?" — everything in §5 is theory until it is run. | `[dashboard]` | **High** (as information) | **High** |
| 5 | **Finish Do-first #1: unblock CCBot at the network layer.** robots.txt is fixed; Cloudflare is still returning **403** to Common Crawl (measured through 2026-07). Check AI Crawl Control and Bot Fight Mode, not just the managed robots.txt toggle. Same investigation as the Internet Archive block. | `[dashboard]` | **Medium** — CC feeds LLM training and AI search; directly gates the agent-visibility bet | **High** on the block existing; Medium on which control causes it |

### Tier 2 — next

| # | Action | Type | Impact | Confidence |
|---|---|---|---|---|
| 6 | **Nightly URL Inspection sweep over all 867 seeds.** `apps/admin/src/search-console.ts:344` already returns `verdict`, `coverageState`, `lastCrawlTime`, `googleCanonical` **and `referringUrls`**. Add a batch driver + a table. Quota is 2,000/day, 600/min per property — the whole corpus sweeps in <2 min with 56% headroom. | `[code]` | **High** (as information) — converts §6 from argument to time series, and answers the orphan question definitively | **High** |
| 7 | **Break the seed-page dead end.** A seed page has 9 links and **zero** links to any other seed or query page. Ship the tags-as-linked-chips + related-palettes block already scoped in `SEO-STRATEGY.md` Phase 2.3. Also add jump links to the pagination (it currently exposes only n−1, n, n+1, last). | `[code]` | **Medium** — Mueller ties click depth to understood importance "a little bit"; no proof it flips indexing, but it is cheap and Google endorses it | **Medium** — mechanism documented, effect size unmeasured |
| 8 | **Ship palette names (`PALETTE-NAMING-PASSOFF.md`).** Measured baseline: 316 tokens per page, Jaccard 0.667 between arbitrary pairs, **zero prose**, an `sr-only` hex-only H1. Names are the only realistic source of per-page prose, and they also feed the search embeddings. | `[code]` | **Medium-High** — the direct answer to "Crawled – currently not indexed" for templated pages | **Medium** — Google's quality-gating position is documented, but no controlled evidence on uniqueness thresholds exists |
| 9 | **Bing Webmaster Tools signup + import from GSC** (`SEO-STRATEGY.md` Do-first #8, still open). The only free backlink report besides GSC's, plus competitor backlink comparison, plus an API. ChatGPT search rides Bing. | `[owner-manual]` | **Medium** | **High** |
| 10 | **301 unknown query params to the bare URL.** `/{seed}?utm_source=x` and `/{seed}?cb=123` currently 200. The canonical already handles it correctly, so this is hygiene — Google's URL-structure doc: *"trim unnecessary parameters."* | `[code]` | **Low** | **High** |

### Tier 3 — worth doing, low urgency

| # | Action | Type | Impact | Confidence |
|---|---|---|---|---|
| 11 | **Support conditional requests / `304 Not Modified`** on `/{seed}` and `/{seed}.png`. Documented as saving server resources and *"indirectly"* improving crawl efficiency; grabient's renders are deterministic from the seed so ETags are trivial. Reduces Worker CPU on recrawl of 867 unchanging pages. | `[code]` | **Low** for SEO, **Medium** for spend | **High** |
| 12 | **Keep the lz-string fallback permanently.** All 239 archived legacy URLs still 301 correctly; Google's "at least 1 year" window for the 2025 seeds closes ~2027-05, and its user-facing advice is *"consider keeping redirects indefinitely."* Deleting `decodeLegacySeed` would 404 known-good URLs to save ~30 lines. **This is a "don't do the tempting cleanup" item.** | `[code]` | **Low** (avoids a self-inflicted regression) | **High** |
| 13 | **Drop the self-referential `<link rel="canonical">` from the 404 page.** Harmless (the `noindex` wins) but meaningless and it pollutes `userCanonical` in URL Inspection. | `[code]` | **Low** | **High** |
| 14 | **Verify Manual Actions is clean** in GSC. A scaled-content-abuse finding would appear there. Clean ⇒ this is algorithmic deprioritization, which is a different and far more recoverable problem than a penalty — and that distinction changes the whole remediation strategy. | `[dashboard]` | **Low** if clean, **High** if not | **High** |
| 15 | **Do not** add a "random palette" link, an infinite-scroll `<a>` chain, or any combinatorial browse UI that emits `<a href>` to arbitrary seeds. Googlebot crawls *"all or most of the URLs that it knows about"* — today the unbounded space is theoretical because nothing links into it. **This is a constraint to preserve, not a task.** | `[code]` | **High** (as prevention) | **High** |

### Explicitly not recommended

- **Rate-limiting Googlebot with 429** as a defense against seed crawling — throttles the
  whole hostname, including the 867 pages you want crawled (§5.4).
- **robots.txt-disallowing `?style=`/`?steps=`/`?angle=`** — forfeits the canonical
  entirely and Google may index them content-less (§9.3).
- **`noindex` on the parameter variants** — explicitly not recommended by Google for
  canonical selection within a site (§9.3).
- **Deleting or mass-noindexing the 867 seed permalinks** — already correctly rejected in
  `SEO-STRATEGY.md`; nothing here changes that.
- **Using the Indexing API for palette pages** — restricted to JobPosting/BroadcastEvent,
  with explicit anti-circumvention language (§6.2).
- **Chasing "410 instead of 404"** — the documented difference is a couple of days and
  current docs treat all 4xx except 429 identically (§3.1).
- **Migrating `style/steps/angle` to URL fragments** — it would dissolve the parameter
  question, but it breaks every shared link and the documented `llms.txt` URL API. Listed
  as an option in §9.3, not a recommendation.

---

## Appendix — reproducing the measurements

```bash
# 1. Legacy seed corpus from the Wayback CDX index
curl -s "https://web.archive.org/cdx/search/cdx?url=grabient.com&matchType=domain\
&output=json&collapse=urlkey&fl=timestamp,original,statuscode,mimetype" > cdx.json
#    → 984 unique urlkeys, 735 paths, 239 legacy-shaped seeds, 46 referrer params

# 2. Do the legacy seeds still decode?  (from packages/data-ops)
#    import { isValidSeed } from './src/serialization'  → 239/239 true

# 3. The cleartext-HTTP cache bug
CB=$RANDOM$RANDOM$RANDOM
curl -sI "https://grabient.com/?cb=$CB"; curl -sI "http://grabient.com/?cb=$CB"

# 4. Redirect chain from the historical link target
curl -sIL "http://www.grabient.com/HQVgDGA0od5TB86wIzAldnLdggZiOgDYSB2IA?cb=$RANDOM"

# 5. Query-page injection surface
curl -s "https://grabient.com/palettes/buy-cheap-viagra" | grep -oE '<title>[^<]*</title>'

# 6. Seed-page link graph
curl -s -A 'Googlebot' "https://grabient.com/{seed}" | grep -oE 'href="/_[A-Za-z0-9_-]+' | sort -u | wc -l

# 7. Common Crawl
curl -s "https://index.commoncrawl.org/collinfo.json"
curl -s "https://index.commoncrawl.org/CC-MAIN-2026-30-index?url=grabient.com%2F*&output=json&limit=1000"

# 8. URL Inspection API field list
curl -s "https://searchconsole.googleapis.com/\$discovery/rest?version=v1" \
  | python3 -c "import json,sys;print(list(json.load(sys.stdin)['schemas']['IndexStatusInspectionResult']['properties']))"
```

## Open items

1. **Cloudflare product ordering** — I could not find a current Cloudflare doc placing
   "Always Use HTTPS" relative to cache and Workers. Verify empirically after enabling.
2. **Google's IndexNow position** — undocumented in every Google crawling/sitemap page I
   fetched. The "Google is testing it (Nov 2021)" story has no traceable primary source.
3. **The 2026-07-16 *Search Off the Record* Mueller quote** on quality gating index size
   rests on two secondary reports (SEJ, ppc.land); the primary transcript was not
   retrievable.
4. **Which Cloudflare control 403s CCBot** — AI Crawl Control, Bot Fight Mode, or a WAF
   rule. Same open question as the Internet Archive block.
5. **Whether the v2 binary seed format ever reached production.** It lived in git for
   4h55m on 2026-07-15. If it did ship, those seeds are dead (they fail the fixed-length
   check) — a Wayback/CC scan found none, which is weak evidence it never shipped.
6. **Moz free-tier limits** — moz.com blocks automated fetching; the current query cap
   and row limit are unverified. Low priority: GSC + Bing WMT + Ahrefs Webmaster Tools
   already cover a link profile this size.
7. **Whether the `?ref=`/`?from=` referrer parameters still work as a discovery channel.**
   All 48 archive-derived values predate the 2026-07 rebuild. Nothing in the current code
   consumes them, and they now just produce a 200 with a bare canonical `[measured]` —
   which is correct, but it means the archive trick captures history only, not new links.
