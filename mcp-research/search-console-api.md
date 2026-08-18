# Google Search Console API — full surface, and what the analytics MCP should expose

Researched 2026-08-16. Every capability claim below was **executed against our own
property** with our own service account, not read off a doc page — the probe
transcripts are the source for every "verified" note. Doc URLs are cited for the
normative statements (quotas, enum lists, scopes).

Companion docs: [`seo-research/mcp-design.md`](../seo-research/mcp-design.md) covers
MCP *transport and auth* (Streamable HTTP, Cloudflare Access managed OAuth). This
doc covers the *Search Console data surface* and the tools that should sit on it.
They do not overlap.

---

## 0. TL;DR

**The single highest-value change is one word: `dataState: "all"`.** Our dashboard
and MCP tool both send the default (`final`), which today returns **one day** of
data. `all` returns **three**, including today. On a property this young that is
the difference between "we have a trend" and "we have a dot".

Verified 2026-08-16, same property, same date range (`2026-08-01 → 2026-08-16`):

| `dataState` | Days returned | Clicks | Impressions |
|---|---:|---:|---:|
| `final` (our current default) | 1 (Aug 14 only) | 196 | 5,266 |
| `all` | 3 (Aug 14, 15, **16 — today**) | **339** | **9,772** |

**The second is hourly data.** `dimensions: ["hour"]` + `dataState: "hourly_all"`
returns per-hour rows up to ~1 hour ago. Verified working on our property right
now — data through `2026-08-16T08:00:00-07:00`. Nothing we have exposes this.

**The third is that our reported clicks are 56% low right now.** The dashboard
sums the top 15 of 825 query rows and calls it the site total. True total for its
own window is **271 clicks / 7,842 impressions**; it prints **119 / 1,764**. §7.1.

**Top three gotchas:** `dataState` defaults to `final` and silently truncates the
window; `aggregationType` changes impressions by 3× on the same query; summing
rows is not the site total, and an empty response omits the `rows` key entirely so
"no traffic" and "wrong property" look identical.

---

## 1. Our actual access — verified, not assumed

Probed 2026-08-16 with `grabient-gsc-reader@grabient.iam.gserviceaccount.com`.

```
GET https://www.googleapis.com/webmasters/v3/sites
200 {"siteEntry":[{"siteUrl":"sc-domain:grabient.com","permissionLevel":"siteFullUser"}]}
```

- **Exactly one property is visible**: `sc-domain:grabient.com`, a Domain property.
- **Permission level is `siteFullUser`** — confirmed. This is an upgrade since
  `seo-research/data/gsc-2026-08-16.md` was written, which recorded
  `siteRestrictedUser` and a 403 on sitemap submission. That is now fixed, and a
  sitemap **has** been submitted (`lastSubmitted: 2026-08-16T20:06:19Z`,
  899 URLs, **0 indexed so far**).
- **Both scopes mint and both are accepted.** `webmasters.readonly` works; the
  write scope `https://www.googleapis.com/auth/webmasters` also returns 200 on
  `sites.list`, so the write path is available end-to-end whenever we choose to
  use it. Nothing but our own code stops us writing today.
- **The property numbers everyone is quoting are an artefact of our own bug.**
  The figure in circulation — "~120 clicks and ~1,800 impressions" — is exactly
  what our dashboard prints, and it is wrong twice over. Replicating the
  dashboard's call precisely (top-15 `query` rows, `dataState` unset, window
  `2026-07-18 → 2026-08-15`) gives **119 clicks / 1,764 impressions**. The true
  totals for that same window are **271 clicks / 7,842 impressions**. See §7.1.
  Data begins **2026-08-14**, not 08-13.
- `SEO-PASSOFF.md`'s headline ("zero measured Google traffic", "0 clicks /
  0 impressions over 16 months") is now **obsolete**. It should be corrected.

Both API hosts work and are interchangeable for `webmasters/v3`:
`https://www.googleapis.com/webmasters/v3` and
`https://searchconsole.googleapis.com/webmasters/v3` (the latter is what
`apps/admin/src/search-console.ts` uses). URL Inspection lives only on
`https://searchconsole.googleapis.com/v1`.

---

## 2. Every endpoint

Base URIs: **`https://www.googleapis.com/webmasters/v3`** (sites, sitemaps,
searchAnalytics) and **`https://searchconsole.googleapis.com/v1`** (urlInspection).
There is no separate "v1 vs v3" product split to worry about — v3 is simply the
long-standing path for the older resources and is not deprecated.
Source: [API reference index](https://developers.google.com/webmaster-tools/v1/api_reference_index).

| Endpoint | HTTP | Purpose | Scope | Min permission | Quota | Can **we** call it? |
|---|---|---|---|---|---|---|
| `searchAnalytics.query` | `POST /sites/{siteUrl}/searchAnalytics/query` | The workhorse: clicks/impressions/CTR/position sliced by dimension | `webmasters.readonly` | Restricted user | 1,200 QPM per site **and** per user; 40,000 QPM / 30M QPD per project | **Yes — verified 200** |
| `sites.list` | `GET /sites` | Which properties this identity can see, and at what permission level | `webmasters.readonly` | any | 20 QPS / 200 QPM per user | **Yes — verified 200** |
| `sites.get` | `GET /sites/{siteUrl}` | Permission level for one property | `webmasters.readonly` | any | as above | **Yes — verified 200** |
| `sites.add` | `PUT /sites/{siteUrl}` | Add a property to the account | **`webmasters` (write)** | n/a (creates) | as above | Scope available; **not useful** — see §6 |
| `sites.delete` | `DELETE /sites/{siteUrl}` | Remove a property | **`webmasters` (write)** | Owner | as above | Scope available; **destructive, do not expose** |
| `sitemaps.list` | `GET /sites/{siteUrl}/sitemaps` | All submitted sitemaps + counts/errors | `webmasters.readonly` | Full user | 20 QPS / 200 QPM per user | **Yes — verified 200** |
| `sitemaps.get` | `GET /sites/{siteUrl}/sitemaps/{feedpath}` | One sitemap's detail | `webmasters.readonly` | Full user | as above | **Yes — verified 200** |
| `sitemaps.submit` | `PUT /sites/{siteUrl}/sitemaps/{feedpath}` | Submit/resubmit a sitemap. Empty response body on success | **`webmasters` (write)** | Full user | as above | **Yes, in principle** — we are `siteFullUser` and the scope mints. Not exercised (would mutate). |
| `sitemaps.delete` | `DELETE /sites/{siteUrl}/sitemaps/{feedpath}` | Unsubmit a sitemap | **`webmasters` (write)** | Full user | as above | Yes in principle; **destructive** |
| `urlInspection.index.inspect` | `POST /v1/urlInspection/index:inspect` | Index status, canonical, crawl time, sitemap membership for ONE URL | `webmasters.readonly` | **Full user** (restricted gets 403) | **2,000 QPD + 600 QPM per site**; 15,000 QPM / 10M QPD per project | **Yes — verified 200** |

Sources: [usage limits](https://developers.google.com/webmaster-tools/limits),
[sitemaps.submit](https://developers.google.com/webmaster-tools/v1/sitemaps/submit),
[urlInspection.index.inspect](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect),
[permission levels](https://support.google.com/webmasters/answer/7687615).

**That is the whole API.** Nine methods. Anything an agent asks for that is not in
this table does not exist — see §5.

### What a WRITE scope would unlock

Switching `SCOPE_SEARCH_CONSOLE` to `https://www.googleapis.com/auth/webmasters`
(a superset — it also reads) enables exactly three useful things:

1. **`sitemaps.submit`** — resubmit `sitemap.xml` after a deploy that changes the
   URL set. Genuinely useful for us: we just went from 29 to 899 URLs.
2. `sitemaps.delete` — retiring a stale sitemap. Rare.
3. `sites.add` / `sites.delete` — property management. Irrelevant; we have one
   property and it is already verified.

It does **not** unlock indexing requests, removals, or disavow. Those have no API
at all (§5). The cost of the write scope is that a compromised admin Worker could
delete our sitemaps — so the recommendation in §6 is to keep the read-only scope
as the default and mint the write scope narrowly, per-call, only for
`submit_sitemap`.

---

## 3. The two endpoints that return real data, in depth

§3.1–3.8 cover `searchAnalytics.query`, the workhorse. §3.9 covers
`urlInspection.index.inspect`. Everything else in §2 is metadata about the
property itself.

### `searchAnalytics.query`

`POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query`

Scopes: `webmasters.readonly` or `webmasters`.
Source: [searchanalytics.query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).

### 3.1 Request body

| Field | Type | Required | Default | Valid values / range |
|---|---|---|---|---|
| `startDate` | string | **yes** | — | `YYYY-MM-DD`, **America/Los_Angeles** time |
| `endDate` | string | **yes** | — | `YYYY-MM-DD`, PT |
| `dimensions` | string[] | no | `[]` (site totals) | `date`, `hour`, `country`, `device`, `page`, `query`, `searchAppearance` |
| `type` | string | no | `web` | `web`, `image`, `video`, `news`, `googleNews`, `discover` |
| `dimensionFilterGroups` | object[] | no | — | see §3.4 |
| `aggregationType` | string | no | `auto` | `auto`, `byPage`, `byProperty`, `byNewsShowcasePanel` |
| `rowLimit` | int | no | `1000` | **1–25000** (0 and 25001 both 400) |
| `startRow` | int | no | `0` | zero-based |
| `dataState` | string | no | **`final`** | `final`, `all`, `hourly_all` |

`startDate > endDate` → 400. Dates **outside** the available range are silently
clamped, not rejected: a `startDate` of `2020-01-01` and an `endDate` of
`2026-12-31` both return 200 with only the days that exist. Verified.

### 3.2 `dimensions` — combination rules (all verified)

| Combination | Result |
|---|---|
| none | one totals row, no `keys` |
| up to 5 at once (`date,query,page,country,device`) | **200** — works |
| `[query, query]` | **400** `Duplicate dimensions are not allowed.` |
| `[searchAppearance, page]` | **400** `Cannot group by search appearance dimension together with another dimension.` |
| `[date, hour]` | **400** `Request cannot be grouped by both date and hour` |
| `[hour, query]`, `[hour, device]` | **200** — hour combines with everything except `date` |
| `hour` without `dataState: hourly_all` | **400** `Grouping by HOUR requires setting dataState=HOURLY_ALL` |
| `dataState: hourly_all` without `hour` | **400** `Using dataState=HOURLY_ALL … only when grouping by HOUR` |
| unknown dimension (`referrer`) | **400** `Invalid value at 'dimension[0]'` |

`searchAppearance` is therefore a **two-step dimension**: query it alone to
discover which appearance types the site has, then *filter* by one of those values
to get its breakdown by another dimension.
[Source](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data).
On our property it currently returns **no rows at all** — we have no rich-result
appearance types yet.

### 3.3 `type` — search-type rules (all verified)

| `type` | Our data (Aug 1–16, `all`) | Notes |
|---|---|---|
| `web` | 339 clicks / 9,772 impr | default |
| `image` | 0 clicks / 27 impr | we do appear in image search |
| `video` | 0 / 0 | |
| `news` | 0 / 0 | |
| `googleNews` | 0 / 0 | **cannot group by `query`** → 400; rows omit `position` |
| `discover` | 0 / 0 | **cannot group by `query`** → 400; rows omit `position` |

An invalid `type` returns a 400 naming the proto enum
(`google.searchconsole.v1.searchanalytics.SearchType`). `discover` and
`googleNews` force `responseAggregationType: "byPage"` regardless of what you ask
for, and their rows have **no `position` field at all** — code that does
`row.position ?? 0` will silently report position 0 for Discover, which reads as
"ranked #1". Our current mapper does exactly this.

### 3.4 `dimensionFilterGroups`

```jsonc
"dimensionFilterGroups": [
  { "groupType": "and",
    "filters": [ { "dimension": "query", "operator": "notContains", "expression": "gradient" } ] }
]
```

- **`groupType`**: `and` only. `"or"` → **400** (verified). The field exists but
  has one legal value.
- **Multiple groups are allowed and are ANDed together** — verified 200 with a
  `query` group plus a `device` group. This is how you express a conjunction
  across dimensions.
- **`operator`** (confirmed current list, 6 values): `contains`, `equals`
  (default), `notContains`, `notEquals`, `includingRegex`, `excludingRegex`.
  Regex is **RE2** syntax. `includingRegex` on `page` with `/palettes/.*`
  verified working.
- **`dimension`** — filterable dimensions are a *subset* of groupable ones:
  `country`, `device`, `page`, `query`, `searchAppearance`. **`date` is NOT
  filterable** → 400 (verified). Neither is `hour`. Restrict by date with
  `startDate`/`endDate`.
- **`country`** expressions are **lowercase ISO-3166-1 alpha-3** — `usa`, `ind`.
  Returned keys are lowercase too.
- **`device`** values are uppercase: `DESKTOP`, `MOBILE`, `TABLET`.

### 3.5 `aggregationType` — the one that silently changes your numbers

Verified on the same query, same range, `dimensions: ["query"]`:

| `aggregationType` | "grabient" clicks | "grabient" impressions | position |
|---|---:|---:|---:|
| `auto` (→ `byProperty`) | 38 | **50** | 1.00 |
| `byPage` | 38 | **156** | 1.02 |

Same query, same days, **3.1× the impressions**. `byProperty` counts one
impression when the site appears in a result set; `byPage` counts one per URL that
appears. Neither is wrong — but an agent that mixes them across two calls will
report a fabricated impressions trend.

- `aggregationType: "byProperty"` **with `dimensions: ["page"]`** → **400**
  `'BY_PROPERTY' is not a valid aggregation type in the context of the request.`
  (Grouping by page forces per-page aggregation.)
- `byNewsShowcasePanel` → 400 in our context (News Showcase only).
- Always read `responseAggregationType` off the response rather than assuming the
  request was honoured. Requesting `auto` on `page` returns `byPage`; on `query`
  it returns `byProperty`.

### 3.6 `dataState` and the freshness model — the most important parameter

| Value | Meaning | Our data as of 2026-08-16 |
|---|---|---|
| `final` (**default**) | Only days Google considers complete | ends **2026-08-14** (T-2) |
| `all` | Includes fresh/partial days | ends **2026-08-16** (T-0, today) |
| `hourly_all` | Required for, and only for, `dimensions: ["hour"]` | through **08:00 PT today** |

The lag is **not** a fixed "2 days". It is: *finalised* data lands about 2 days
back, and *fresh* data is available same-day but is incomplete and will be revised
upward. Google's wording is "collected data should be available in 2-3 days"
([About Search Console data](https://support.google.com/webmasters/answer/96568))
and "The newest data can be preliminary, meaning it's still being collected and
might change in the next few hours"
([Performance report](https://support.google.com/webmasters/answer/7576553)).

**Do not guess where the boundary is — the API tells you.** With `dataState: "all"`
the response carries a `metadata` object:

```jsonc
"metadata": { "firstIncompleteDate": "2026-08-15" }      // daily
"metadata": { "firstIncompleteHour": "2026-08-16T08:00:00-07:00" }  // hourly
```

Everything on or after that boundary is partial and will grow. **Note the wire
format is camelCase** (`firstIncompleteDate`) even though the reference page
renders these as `first_incomplete_date` — code keyed on the snake_case name
silently gets `undefined`.

#### Consequence for our current code

`apps/admin/src/search-console.ts` sets `LAG_DAYS = 1` and never sends
`dataState`. So it asks for a window ending T-1 (Aug 15) but gets `final` data,
which ends T-2 (Aug 14). The comment on `LAG_DAYS` says 3 was "too conservative…
a window ending at T-3 excluded every populated day" — correct diagnosis, wrong
fix. The real fix is `dataState: "all"`, which makes the lag question disappear
and would have surfaced Aug 15 and Aug 16 too.

### 3.7 Pagination, row caps, and empty responses

- `rowLimit` max is **25,000** per request; `0` and `25,001` both → 400.
- Paginate with `startRow` in steps of `rowLimit` until a response comes back with
  no rows. **`startRow: 100000` returns 200 with no `rows` key** — not an error,
  not `rows: []`. Verified.
- Beyond one request, the API exposes a maximum of **~50,000 rows per day per
  property per search type**
  ([source](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data)).
- **An empty result omits `rows` entirely.** A zero-traffic property returns
  `{"responseAggregationType":"byProperty"}` and nothing else. `payload.rows ?? []`
  is the only safe read.
- Rows are sorted by clicks descending, **except** when grouped by `date`, where
  they are ascending by date.
- Sum-of-rows ≠ totals. Query a no-dimension request for true totals; summing a
  truncated `query` breakdown undercounts, and Google drops some long-tail rows
  by design when `page`/`query` are involved.

### 3.8 Response shape

```jsonc
{
  "rows": [ { "keys": ["gradient maker"], "clicks": 55, "impressions": 715,
              "ctr": 0.0769, "position": 5.625 } ],
  "responseAggregationType": "byProperty",
  "metadata": { "firstIncompleteDate": "2026-08-15" }
}
```

`ctr` is a **fraction** (0.0769 = 7.69%). `position` is a 1-based average and is
**absent** for `discover`/`googleNews`. Averaging `position` across rows requires
weighting by impressions — `search-console.ts` already does this correctly and
the reasoning should be preserved in any new tool.

`metadata` is only present when grouping by `date` or `hour`. A no-dimension
totals request with `dataState: "all"` returns **no `metadata`**, so there is no
way to tell from that response alone how much of it is provisional.

### 3.9 `urlInspection.index.inspect` — the other real endpoint

`POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`
Scopes: `webmasters.readonly` or `webmasters`. **Requires Full user** — a
restricted user gets 403. Body: `{ inspectionUrl, siteUrl, languageCode? }`.
Source: [UrlInspectionResult](https://developers.google.com/webmaster-tools/v1/urlInspection.index/UrlInspectionResult).

Live response for `https://grabient.com/`, 2026-08-16:

```jsonc
{ "inspectionResult": {
  "inspectionResultLink": "https://search.google.com/search-console/inspect?resource_id=sc-domain:grabient.com&id=…",
  "indexStatusResult": {
    "verdict": "PASS", "coverageState": "Submitted and indexed",
    "robotsTxtState": "ALLOWED", "indexingState": "INDEXING_ALLOWED",
    "lastCrawlTime": "2026-08-16T16:39:36Z", "pageFetchState": "SUCCESSFUL",
    "googleCanonical": "https://grabient.com/", "userCanonical": "https://grabient.com/",
    "sitemap": ["https://grabient.com/sitemap.xml"],
    "referringUrls": ["http://www.grabient.com/", "https://icmsmt.com/list787/",
                      "http://grabient.com/", "https://dev.to/bjakyt/100-design-resources-for-developers-2ddk"],
    "crawledAs": "MOBILE" },
  "mobileUsabilityResult": { "verdict": "VERDICT_UNSPECIFIED" } } }
```

Enum values worth branching on:

- **`verdict`**: `VERDICT_UNSPECIFIED`, `PASS`, `PARTIAL`, `FAIL`, `NEUTRAL`
- **`robotsTxtState`**: `ROBOTS_TXT_STATE_UNSPECIFIED`, `ALLOWED`, `DISALLOWED`
- **`indexingState`**: `INDEXING_STATE_UNSPECIFIED`, `INDEXING_ALLOWED`,
  `BLOCKED_BY_META_TAG`, `BLOCKED_BY_HTTP_HEADER`, `BLOCKED_BY_ROBOTS_TXT`
- **`pageFetchState`**: `PAGE_FETCH_STATE_UNSPECIFIED`, `SUCCESSFUL`, `SOFT_404`,
  `BLOCKED_ROBOTS_TXT`, `NOT_FOUND`, `ACCESS_DENIED`, `SERVER_ERROR`,
  `REDIRECT_ERROR`, `ACCESS_FORBIDDEN`, `BLOCKED_4XX`, `INTERNAL_CRAWL_ERROR`,
  `INVALID_URL`
- **`crawledAs`**: `CRAWLING_USER_AGENT_UNSPECIFIED`, `DESKTOP`, `MOBILE`
- `coverageState` is a **free-text string**, not an enum — do not match on it
  exactly; it is the human-readable "Submitted and indexed" style label.

Notes:
- `referringUrls` is the closest thing the API has to a **links report**, but it
  is per-URL, capped to a handful of examples, and not a backlink index.
- `mobileUsabilityResult` always returns `VERDICT_UNSPECIFIED`: Google retired the
  Mobile Usability report and its API on **2023-12-01**
  ([announcement coverage](https://searchengineland.com/google-officially-drops-mobile-usability-report-mobile-friendly-test-tool-and-mobile-friendly-test-api-435377)).
  Treat the field as dead; do not surface it as a finding.
- `ampResult` and `richResultsResult` are absent when not applicable, as here.
- Inspecting a URL outside the property returns **403** `You do not own this site,
  or the inspected URL is not part of this property` — verified.

---

## 4. Data retention, anonymized queries, and the 16-month wall

Search Console retains **16 months** of performance data, in the API exactly as in
the UI — introduced with the current Search Console and unchanged since
([announcement](https://developers.google.com/search/blog/2018/01/introducing-new-search-console)).
Older data is deleted and no request shape recovers it. The only way to keep a
longer history is the **BigQuery bulk export**, configured in Search Console
settings, which accumulates from the day it is switched on (it does not backfill).

**Anonymized queries.** Google withholds rare queries — "we might not track some
queries that are made a very small number of times or those that contain personal
or sensitive information"
([About Search Console data](https://support.google.com/webmasters/answer/96568)).
The behaviour that matters for correctness is subtle and officially documented:

> "anonymized (rare) results are omitted from the table, but are included in the
> chart totals **unless a query filter is applied**"
> — [Troubleshooting data discrepancies](https://support.google.com/webmasters/answer/17010575)

Translated to the API: a **no-dimension** request includes anonymized clicks; a
request grouped by `query`, or *any* request carrying a `query` filter, excludes
them. So `filter(query contains X)` + `filter(query notContains X)` will **not**
sum to the unfiltered total. See also Google's
[deep dive on performance data filtering and limits](https://developers.google.com/search/blog/2022/10/performance-data-deep-dive).

On our property the gap is 20% of all clicks (216 summed vs 271 true).

**Recommendation, unrelated to the MCP but time-sensitive.** The 16-month wall is
moot for us today — we have three days of data — which is exactly why acting now
is cheap and acting later is impossible. **Switching on the BigQuery bulk export
costs nothing and preserves full-fidelity daily data forever**, including the
anonymized rows the API omits (exported with `is_anonymized_query = true` and a
null query). Every day it stays off is a day that can never be recovered.

---

## 5. Cannot be retrieved via the API

An agent *will* ask for these. Each one must produce an explicit "this has no API"
rather than an empty result, because an empty result reads as "the problem does
not exist" — the exact failure mode `SEO-PASSOFF.md` flagged when it noted that
*nobody had checked for a manual action*.

| UI feature | API? | What the agent should say |
|---|---|---|
| **Manual actions** | **No** | "No API exists. A human must open Search Console → Security & Manual Actions. I cannot rule out a manual action." |
| **Security issues** | **No** | Same — UI only. |
| **Core Web Vitals / Page Experience** | **No** | "Not in the Search Console API. Real-user field data comes from the [CrUX API](https://developer.chrome.com/docs/crux/api), a separate product with its own key; lab data from the [PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started)." |
| **Links report** (backlinks, top linking sites/pages, internal links, anchor text) | **No** | "There has never been a links API. Export the CSV from the UI, or use a third-party backlink index." **This is the single most-requested missing endpoint.** |
| **Crawl stats** (Settings → Crawl stats: requests/day, response codes, Googlebot type, host status) | **No** | UI only. Our own Cloudflare logs are the closest substitute for crawl volume. |
| **Removals / URL removal tool** | **No** | UI only. |
| **Page indexing report** (aggregate "why aren't my pages indexed" counts) | **No** | "Only per-URL, via `urlInspection`, at 2,000 URLs/day. There is no aggregate coverage endpoint." |
| **Rich results / enhancement reports** (aggregate) | **No** | Per-URL only, via `urlInspection`'s `richResultsResult`. |
| **Shopping / Merchant listings** | **No** | UI only. |
| **Search Console Insights** | **No** | Never had an API. Its inputs are GSC + GA4, both of which we already query. |
| **Disavow links** | **No** | UI only. |
| **Change of address, verification, user management** | **No** | UI only. |
| **Anonymized (rare) queries** | **Omitted** | "Google withholds rare queries for privacy. They are missing from every API row, so query-level clicks will not sum to site totals." |
| **AI Overviews / AI Mode traffic split** | **Not separable** | "Google folds AI-surface impressions and clicks into the ordinary `web` type. There is no dimension, filter or search type that isolates them." |
| **"Request indexing" for an arbitrary page** | **No** | "The Indexing API is a *different* API and it does not apply to us. Google: *'The Indexing API can only be used to crawl pages with either `JobPosting` or `BroadcastEvent` embedded in a `VideoObject`.'* Grabient has neither. For everything else the mechanism is the sitemap plus the UI's *Request Indexing* button." ([source](https://developers.google.com/search/apis/indexing-api/v3/quickstart), default quota 200/day) |

The design implication: the MCP should ship a tool whose entire job is to answer
"can you get me X" honestly. See `seo_data_availability` in §6.

---

## 6. Proposed MCP tools

Scored by how often a real SEO/analytics agent hits the need. The existing server
is `apps/admin/src/mcp.ts`; `[EXISTS]` marks what is already registered.

### Priority 0 — do these first

---

#### P0.1 `search_console` — **EXTEND the existing tool** `[EXISTS, incomplete]`

The current schema exposes `dimensions`, `days`, `limit`, `type`. It omits every
parameter that decides whether the answer is *correct* — `dataState`, filters,
explicit dates, pagination and aggregation. This is not a new tool; it is the
highest-value change in this document.

```ts
{
  // existing
  dimensions: z.array(z.enum(["query","page","country","device","date","searchAppearance"]))
    .max(5).optional(),          // default ["query"]; searchAppearance must be alone
  type: z.enum(["web","image","video","news","googleNews","discover"]).optional(),
  limit: z.number().int().min(1).max(25000).optional(),   // was capped at 500 — raise it

  // NEW — the important part
  dataState: z.enum(["final","all"]).optional(),          // DEFAULT SHOULD BE "all"
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.number().int().min(1).max(480).optional(),      // ignored if startDate given
  startRow: z.number().int().min(0).optional(),
  aggregationType: z.enum(["auto","byPage","byProperty"]).optional(),
  filters: z.array(z.object({
    dimension: z.enum(["query","page","country","device","searchAppearance"]),
    operator: z.enum(["equals","notEquals","contains","notContains",
                      "includingRegex","excludingRegex"]),
    expression: z.string().max(500),
  })).max(8).optional(),   // ANDed; country lowercase alpha-3; device uppercase
}
```

**Description for the agent:**
> Query Google Search Console for grabient.com — what people searched, which pages
> they landed on, clicks, impressions, CTR and average position. Combine up to 5
> dimensions to cross-tabulate. Filters are ANDed; use `includingRegex` (RE2) for
> URL patterns like `/palettes/.*`. `dataState` defaults to `all`, which includes
> today but marks incomplete days in `firstIncompleteDate` — treat any day on or
> after that boundary as provisional and rising. Pass `dataState: "final"` only
> when you need settled numbers, and expect it to stop about 2 days ago. CTR is
> returned as a percentage. Position is absent for `discover` and `googleNews`.

**Returns:** `{ property, startDate, endDate, dataState, responseAggregationType,
firstIncompleteDate, siteTotals, rowCount, hasMore, rows[] }`.

Must-fix implementation notes:
- **Default `dataState` to `all`.** On this property `final` returns one day.
- **Always return `siteTotals` from a second, no-dimension call** with the same
  window and filters-minus-any-query-filter. Without it the agent will sum `rows`
  and be wrong by 20%+ (§7.1). This is the fix for the bug that is live today, and
  it is one extra request.
- **Surface `firstIncompleteDate`** in the payload (camelCase on the wire).
- **Echo `responseAggregationType`** so the agent can see it did not get what it
  asked for.
- **Do not emit `position: 0` for Discover/News** — omit the field, as the API does.
- Set `hasMore = rows.length === limit` so an agent knows to page.
- Keep the existing impression-weighted position maths; a plain mean is wrong.

---

#### P0.2 `search_console_compare` — period-over-period delta (NEW)

The most common question an SEO agent is actually asked is "what changed?", and it
is the one most easily got wrong: it needs two calls, an outer join on the
dimension key, impression-weighted position maths, and separate handling for
appeared/disappeared keys. Making the agent assemble that from raw rows wastes
tokens and produces arithmetic errors.

```ts
{
  dimension: z.enum(["query","page","country","device"]),   // single dimension only
  days: z.number().int().min(1).max(90).optional(),         // default 7; window length
  offsetDays: z.number().int().min(0).optional(),           // default 0 = window ends today
  limit: z.number().int().min(1).max(1000).optional(),      // default 25
  sortBy: z.enum(["clicksDelta","impressionsDelta","positionDelta","ctrDelta"]).optional(),
  type: z.enum(["web","image","video","news","googleNews","discover"]).optional(),
  minImpressions: z.number().int().min(0).optional(),        // default 10, kills noise
}
```

**Description for the agent:**
> Compare two equal, adjacent time windows and return per-key deltas — the "what
> changed" tool. Returns movers sorted by the requested delta, plus keys that
> appeared or disappeared entirely. Position deltas are impression-weighted, and a
> NEGATIVE position delta is an IMPROVEMENT (position 8 → 5 is `-3`). Both windows
> use the same `dataState`, so they are comparable even when the recent one is
> partial — but if `partialWindow` is true in the response the newer window is
> still filling and a decline may be an artefact.

**Returns:** `{ current: {start,end}, previous: {start,end}, partialWindow,
totals: {current, previous, delta}, rows: [{ key, clicks, clicksPrev, clicksDelta,
impressions, impressionsPrev, impressionsDelta, ctr, ctrPrev, position,
positionPrev, positionDelta, status: "both"|"new"|"lost" }] }`.

The `partialWindow` flag matters enormously on a young property: comparing a
complete week against a 2-day-old partial week manufactures a fake crash.

---

#### P0.3 `search_console_hourly` — today's data (NEW)

Launched by Google in April 2025 and completely absent from our stack. It is the
only way to see **today**, which makes it the tool for "did the deploy an hour ago
break something?"

```ts
{
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),   // default today (PT)
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),// optional range
  breakdownBy: z.enum(["none","query","page","device","country"]).optional(),
  limit: z.number().int().min(1).max(25000).optional(),        // default 200
  type: z.enum(["web","image","video","news"]).optional(),
}
```

**Description for the agent:**
> Hour-by-hour clicks and impressions, available up to roughly the last complete
> hour — the only Search Console view that includes today. Use it to check whether
> a change shipped in the last few hours moved anything, or to compare today's
> shape against the same weekday last week. Hourly data goes back about 10 days
> only. Timestamps are returned in America/Los_Angeles with an explicit offset.
> The final hour before `firstIncompleteHour` is still filling — do not read a
> dip in the last bucket as a real decline.

**Returns:** `{ property, timezone: "America/Los_Angeles", firstIncompleteHour,
rows: [{ hour, ...breakdownKeys, clicks, impressions, ctr, position }] }`.

Implementation constraints (all verified, all 400s if violated): `hour` **requires**
`dataState: "hourly_all"`; `hourly_all` is **rejected** without `hour`; `hour` and
`date` **cannot** be combined — so a multi-day hourly range returns hour-stamped
rows carrying their own date, which is what you want anyway.

---

#### P0.4 `seo_data_availability` — what cannot be answered (NEW)

Cheap, static, and it prevents the most damaging failure mode: an agent
interpreting silence as good news.

```ts
{ topic: z.string().optional() }   // free text, e.g. "backlinks", "manual action"
```

**Description for the agent:**
> Ask before concluding that something is fine. Returns which Search Console
> features have no API, so you never report "no manual actions found" when the
> truth is "manual actions cannot be checked programmatically". Also states the
> current data window, the property's first day of data, and which alternative
> data source (CrUX, BigQuery export, Cloudflare logs) covers each gap.

**Returns:** the §5 table as structured data, plus `{ propertyFirstDataDate,
dataThroughFinal, dataThroughFresh, retentionMonths: 16 }`.

---

### Priority 1 — clear value, less frequent

---

#### P1.1 `page_queries` — queries driving one URL (NEW)

Expressible via P0.1 filters, but it is such a common intent that a dedicated tool
is worth it — and it is the natural companion to `url_inspection`.

```ts
{
  url: z.string().url(),
  match: z.enum(["exact","prefix","regex"]).optional(),   // default exact
  days: z.number().int().min(1).max(480).optional(),      // default 28
  limit: z.number().int().min(1).max(1000).optional(),    // default 50
}
```

**Description for the agent:**
> Which search queries earn impressions and clicks for one specific page, plus
> that page's own totals. Use it to judge whether a page ranks for what it was
> written for. `match: "prefix"` covers a section (e.g. all of `/palettes/`).
> Remember Search Console URLs are percent-encoded — `/palettes/aqua,-magenta`
> appears as `/palettes/aqua%2C-magenta`; pass the URL as you would type it and
> the tool will match both forms.

The encoding note is real: our own data contains
`https://grabient.com/palettes/%F0%9F%8C%B7` (an emoji slug) and
`aqua%2C-magenta%2C-yellow`. An exact-match filter on the decoded string finds
nothing.

---

#### P1.2 `index_status_batch` — indexing across many URLs (NEW)

`url_inspection` answers one URL. The actual question is "of the 899 URLs in our
sitemap, which are indexed?" — currently **0 indexed** per `sitemaps.get`, which is
the most urgent open question on the property.

```ts
{
  urls: z.array(z.string().url()).min(1).max(50),
  source: z.enum(["explicit","sitemap"]).optional(),
  sample: z.number().int().min(1).max(50).optional(),   // random sample when source=sitemap
}
```

**Description for the agent:**
> Index status for up to 50 URLs at once, returning a verdict summary plus the
> per-URL detail. This is the only way to tell "ranks badly" from "not in Google's
> index at all" — the two look identical in performance data and need opposite
> fixes. QUOTA IS HARD: 2,000 URLs per day and 600 per minute for the whole
> property, shared with every other caller. Sample rather than enumerate; the tool
> reports remaining daily budget and refuses rather than exhausting it.

**Returns:** `{ summary: { PASS, PARTIAL, FAIL, NEUTRAL }, byCoverageState: {...},
quotaUsedToday, quotaRemaining, results: [...] }`.

Implementation notes: cap concurrency to stay under 600 QPM; persist a daily
counter (D1 or KV) because the 2,000/day is per *site*, not per process, and a
restarted Worker would otherwise forget; a URL outside the property returns **403**
`You do not own this site, or the inspected URL is not part of this property` —
translate that rather than reporting a generic failure.

---

#### P1.3 `url_inspection` — **EXTEND** `[EXISTS, lossy]`

The tool exists and works. Two improvements:

- It **drops `pageFetchState`**, which our live response contains
  (`"pageFetchState": "SUCCESSFUL"`) and which is the field that distinguishes
  "Googlebot got a 5xx" from "indexed fine". Add it.
- It drops `inspectionResultLink`, the deep link into the UI — worth returning so
  a human can follow up on exactly what the agent saw.
- `mobileUsabilityResult.verdict` is `VERDICT_UNSPECIFIED` on our property
  (Google retired the mobile usability report); the tool should omit the field
  rather than reporting an unspecified verdict as a finding.

---

#### P1.4 `properties` — sites.list (NEW, trivial)

```ts
{}
```

**Description for the agent:**
> Which Search Console properties this credential can read, and at what permission
> level. Worth calling once when a Search Console call fails: an empty list means
> the service account was never added as a user in Search Console, and
> `siteRestrictedUser` means URL Inspection and sitemap tools will 403 while
> performance queries still work.

Cheap, and it converts our single most confusing failure mode into a diagnosis.

---

### Priority 2 — situational

- **`sitemaps` `[EXISTS]`** — fine as is. `sitemaps.get` adds nothing; `list`
  already returns the same `contents` array (`submitted: 899, indexed: 0`).
  One improvement: surface `submitted` vs `indexed` as a computed
  `indexedShare`, because that ratio is the headline number.
- **`submit_sitemap` (write scope)** — we *can* do this now (`siteFullUser` +
  the write scope mints). Recommendation: **expose it, but mint the write scope
  per-call** rather than switching the shared `SCOPE_SEARCH_CONSOLE` constant, so
  the blast radius of the admin Worker stays read-only by default. Guard with an
  allow-list of our own sitemap URLs so an injected instruction cannot submit an
  attacker's file. Note `PUT` returns an **empty body** on success — do not parse
  it as JSON (our helpers all call `res.json()` unconditionally and would throw).
- **`delete_sitemap`, `sites.add`, `sites.delete`** — do not expose. Destructive,
  no analytical value.

### Summary table

| Tool | Status | Priority | Why |
|---|---|---|---|
| `search_console` (+`dataState`, filters, dates, pagination, aggregation) | **exists, extend** | **P0** | Default `dataState` costs us 2 of 3 days of data |
| `search_console_compare` | new | **P0** | "What changed" is the most-asked question and the easiest to get wrong |
| `search_console_hourly` | new | **P0** | Only view of today; unused API capability since 2025 |
| `seo_data_availability` | new | **P0** | Stops "no data" being read as "no problem" |
| `page_queries` | new | P1 | Most common drill-down; encoding trap |
| `index_status_batch` | new | P1 | 0 of 899 sitemap URLs indexed — the live question |
| `url_inspection` | exists, extend | P1 | Add `pageFetchState`, `inspectionResultLink` |
| `properties` | new | P1 | Turns the worst failure mode into a diagnosis |
| `sitemaps` | exists | P2 | Add `indexedShare` |
| `submit_sitemap` | new (write scope) | P2 | Possible now; needs per-call scope + allow-list |
| `sites.add/delete`, `delete_sitemap` | — | never | Destructive, no analytical value |

---

## 7. Gotchas

### 7.1 The one that is currently costing us: our headline number is 56% low

Measured 2026-08-16, all four numbers from the same property and the same window
(`2026-07-18 → 2026-08-15`, the exact window `loadSearchConsole` builds):

| How the number is obtained | Clicks | Impressions |
|---|---:|---:|
| **What the dashboard prints today** — sum of top-15 `query` rows, `dataState` unset | **119** | **1,764** |
| Sum of *all* 825 query rows, `dataState: "all"` | 216 | — |
| True site totals, `dataState: "final"` | 196 | 5,266 |
| **True site totals, `dataState: "all"`** | **271** | **7,842** |

Three separate errors compound:

1. **Truncation.** The dashboard sums the top 15 of **825** distinct queries.
2. **Withholding.** Even summing all 825 rows gives 216, not 271 — the missing
   55 clicks (20%) are Google's anonymized rare queries, which are absent from
   every row-level response by design.
3. **`dataState`.** `final` drops the two most recent days.

Only a **no-dimension** request returns true totals. This is not a rounding issue;
it is the difference between "the SEO work is not landing" and "clicks nearly
tripled". `SEO-PASSOFF.md` and `brief.ts` both propagate the low number.

### 7.2 The rest

1. **`dataState` defaults to `final`, and `final` is two days behind.** Our
   dashboard shows one day when three exist. Default new code to `all` and report
   `firstIncompleteDate` alongside it.
2. **`aggregationType` changes impressions by 3×** on the same query
   (`byProperty` 50 vs `byPage` 156 for "grabient"). Never compare numbers across
   calls without checking `responseAggregationType` on **both** responses.
3. **An authenticated empty response is ambiguous, and the ambiguity has already
   burned this project.** `{"responseAggregationType":"byProperty"}` with no `rows`
   key means *any* of: no traffic yet; wrong property string; a date window before
   data existed; a filter that matched nothing. `search-console.ts` already
   handles the null-vs-empty distinction deliberately — preserve that, and make
   every new tool state which case it is in rather than returning `[]`.
4. **Domain vs URL-prefix.** `sc-domain:grabient.com` is ours;
   `https://grabient.com/` is **not a property we have** and returns **403**, not
   an empty set. Discovery via `sites.list` (already implemented) is the right
   pattern — keep it.
5. **Dates are America/Los_Angeles, not UTC.** Our helpers build windows with
   `toISOString()` on UTC dates. For most of the day UTC is ahead of PT, so a
   UTC "today" can be a PT day that does not exist yet. Harmless with `all`;
   off-by-one with `final`.
6. **Response metadata is camelCase on the wire** (`firstIncompleteDate`) though
   the reference page renders it snake_case. Keying on the doc spelling gets
   `undefined` with no error.
7. **Empty responses omit `rows` entirely** — no `rows: []`. And `startRow` past
   the end is a 200, not a 404. Pagination terminates on absence, not on error.
8. **Sum of rows ≠ site totals.** Anonymized rare queries are withheld, and long-
   tail rows are dropped when `page`/`query` are grouped. For real totals, request
   with **no dimensions**. Measured on our property: summing all 825 query rows
   gives 216 clicks against a true total of 271. Google's own wording is that
   totals differ "due to differences in aggregation (property vs. page)"
   ([source](https://support.google.com/webmasters/answer/7576553)).
   See §7.1 — this is live in our dashboard today.
9. **`position` does not exist for Discover and Google News.** `row.position ?? 0`
   reports position 0, which reads as rank #1.
10. **URL Inspection quota is per *site*, 2,000/day** — shared across every
    caller, including a human clicking around. A batch tool must budget, not spend.
11. **`searchAppearance` cannot be combined with any other dimension**, and needs
    the two-step discover-then-filter pattern. Ours returns nothing today.
12. **Filters cannot use `date` or `hour`.** Only `country`, `device`, `page`,
    `query`, `searchAppearance`. Restrict time with `startDate`/`endDate`.
13. **`groupType` accepts only `"and"`.** There is no OR. Express alternatives
    with `includingRegex` (`a|b`).
14. **URLs in Search Console are percent-encoded.** Exact-match filters against
    decoded slugs silently return nothing — we have emoji and comma slugs.
15. **The 16-month wall is real and unrecoverable.** Turn on the BigQuery bulk
    export now; it never backfills.
16. **Applying a `query` filter silently drops anonymized clicks from the
    totals.** `contains X` and `notContains X` do **not** sum back to the
    unfiltered total — this is documented behaviour, not a bug
    ([source](https://support.google.com/webmasters/answer/17010575)). Any tool
    that computes a share-of-total from a filtered query call is wrong. Compute
    the denominator from a *page*-filtered or no-dimension call instead.
17. **`sitemaps.submit` returns an empty body on success.** Every helper in
    `search-console.ts` calls `res.json()` unconditionally; on a 200 with no body
    that throws. Any write tool must branch on `204`/empty before parsing.

---

## 8. What changed in 2025–2026

### Hourly data — the one material addition (April 2025)

Google added a `HOUR` dimension and a `HOURLY_ALL` `dataState` to
`searchAnalytics.query`
([official announcement](https://developers.google.com/search/blog/2025/04/san-hourly-data)).

The API is **more generous than the UI**: the Search Console interface shows a
24-hour view, while the API returns hourly rows for roughly the **last 10 days**,
which is what makes day-of-week comparison possible ("this Tuesday 9am vs last
Tuesday 9am").

Verified live on our property 2026-08-16 — see §3.2 and §3.6 for the exact
constraints. Rows are keyed with a full offset timestamp
(`2026-08-16T05:00:00-07:00`), so the timezone is explicit and does not need to be
assumed. **We do not use this anywhere.** It is the largest unexploited capability
in the API for us, because it is the only way to see today.

### Everything else is stable

No new endpoints, no new resources, and no deprecations affecting the nine methods
in §2. `webmasters/v3` remains the current path for sites/sitemaps/searchAnalytics
and carries no sunset notice; `searchconsole.googleapis.com/v1` continues to host
only URL Inspection. Retention is still 16 months.

### AI Overviews / AI Mode

The persistent 2025–2026 SEO question is whether AI-surface traffic can be
isolated. It cannot: Google folds impressions and clicks from AI experiences into
the ordinary `web` search type, and has not shipped a dimension, filter,
`searchAppearance` value or `type` that separates them. Any tool or report that
claims to break out "AI traffic" from Search Console data is inferring it, not
measuring it — the MCP should say so rather than attempting a proxy.
