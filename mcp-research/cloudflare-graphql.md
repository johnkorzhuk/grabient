# Cloudflare GraphQL Analytics API — what grabient can reach, and what the analytics MCP should expose

Researched 2026-08-16. Every factual claim carries a `developers.cloudflare.com`
URL. Anything I could not confirm from an official doc, or could not test because
`CF_ANALYTICS_TOKEN` is a deployed secret I do not have, is marked **UNVERIFIED**
and carries the exact query the owner can run to settle it.

Scope: zone `grabient.com` on the **Free** zone plan; the account is on **Workers
Paid**. Credentials the admin Worker holds: `CF_ANALYTICS_TOKEN` (scoped Zone →
Analytics → Read), `CF_ZONE_ID`, `CF_ACCOUNT_ID`.

Existing code, which this document must not re-propose:
`apps/admin/src/traffic.ts` (three queries) and `apps/admin/src/mcp.ts` (seven
registered tools).

---

## 0. TL;DR

**The single most important finding is not a dataset — it is that the API
describes its own limits per token.** The `settings` node returns, for every
dataset, `enabled`, `maxDuration`, `maxNumberOfFields`, `maxPageSize` and
`notOlderThan` *as they apply to this zone on this plan with this token*
([Settings node](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/)).
Combined with standard GraphQL introspection, that makes a hardcoded dataset list
obsolete: the MCP server can answer "what can I query?" truthfully at runtime.
§4 gives the exact queries. **Run those two queries before building anything
else in this document** — they replace roughly half of it with fact.

**Second finding: Cloudflare already ships this MCP server.**
`https://graphql.mcp.cloudflare.com/mcp` exposes `graphql_schema_search`,
`graphql_schema_overview`, `graphql_type_details`, `graphql_complete_schema`,
`graphql_query` and `graphql_api_explorer`
([apps/graphql README](https://github.com/cloudflare/mcp-server-cloudflare/tree/main/apps/graphql)),
and it is now superseded by a unified server at `https://mcp.cloudflare.com/mcp`
([cloudflare/mcp](https://github.com/cloudflare/mcp)). That is strong prior art
for the passthrough-plus-introspection shape argued for in §8, and it is also a
reason not to build very much: a lot of this is a connector-config decision, not
a coding project.

**Third: the reason `refererHost` failed on the zone dataset is now documented.**
`clientRefererHost` in `httpRequestsAdaptiveGroups` is **Paid plans only**, while
`userAgent` and `userAgent_like` are available on **all** plans
([AI Crawl Control GraphQL API](https://developers.cloudflare.com/ai-crawl-control/reference/graphql-api/)).
That second half is the actionable part: we can group by the **raw user-agent
string** instead of `browserMap`'s coarse family bucket, which is a materially
better bot split than the heuristic in `traffic.ts` — within the 1-day window.

**Fourth: AI-crawler traffic is queryable on Free**, via
`userAgent_like: "%GPTBot%"` on `httpRequestsAdaptiveGroups`, and Cloudflare
documents five ready-made queries for exactly this. The `botDetectionIds`
route needs Bot Management; the user-agent route does not.

**Fifth: Core Web Vitals are available, but not where anyone would look.** Not
`rumPerformanceEventsAdaptiveGroups` (navigation timing only) — LCP, INP and CLS
live in **`rumWebVitalsEventsAdaptiveGroups`**, broken out by page path and
device, with the elements responsible. §3. That is field data on the metrics
Google ranks on, and it is currently unreachable for a boring reason: it is
account-scoped, and `CF_ANALYTICS_TOKEN` appears to be zone-only. **§4.3 is a
one-curl check and it is the highest-value thing in this document to run.**

**Sixth, and it changes a design decision: the Free-plan limits are published
after all** — not as a dataset-availability table (that does not exist) but as
retention and query-window tables in the WAF docs. `httpRequestsAdaptiveGroups`:
**7-day retention, 24-hour query window**. `firewallEventsAdaptive`: **24-hour
retention**, meaning firewall data is lost permanently unless polled. Both in §1.

---

## 0.5 The dataset table

"Available to us" is **yes** only where it is empirically proven (running in
production) or documented as all-plans. Retention and max range are the Free-zone
/ Workers-Paid figures where published. **Every "unverified" in the last column
resolves with one query — §4.2.**

### Zone scope (`viewer.zones`, needs Zone → Analytics → Read)

| Dataset | Plan gate | Retention | Max range | Key dimensions / metrics | Available to us? |
|---|---|---|---|---|---|
| `httpRequests1dGroups` | All plans | ~365 d (unverified; 180 d works) | full retention | `date`; `sum{pageViews requests bytes cachedRequests cachedBytes threats browserMap countryMap contentTypeMap responseStatusMap ipClassMap clientSSLMap threatPathingMap}`, `uniq{uniques}` | **YES** — in production |
| `httpRequests1hGroups` | All plans | unverified | unverified | as above, `datetimeHour` | **yes** (same family) |
| `httpRequests1mGroups` | All plans | unverified | unverified | as above, `datetimeFiveMinutes` | **yes** (same family) |
| `httpRequestsAdaptiveGroups` | All plans ("essential") | **7 days** | **24 hours** | `userAgent`, `clientRequestPath`, `clientCountryName`, `clientDeviceType`, `clientRequestHTTPHost`, `edgeResponseStatus`, `cacheStatus`, `coloCode`, `datetimeHour`; `count`, `sum{edgeResponseBytes visits edgeTimeToFirstByteMs originResponseDurationMs}` | **YES** — in production |
| `httpRequestsAdaptive` (raw) | unverified | 7 days | 24 hours | per-request rows | unverified |
| `httpRequestsOverviewAdaptiveGroups` | unverified | unverified | unverified | undocumented | **unverified** — schema-only, no docs |
| `firewallEventsAdaptive` | All plans ("essential") | **24 hours** | **24 hours** | `action`, `source`, `ruleId`, `clientIP`, `clientAsn`, `clientCountryName`, `userAgent`, `clientRequestPath` | **yes**, sampled logs only |
| `firewallEventsAdaptiveGroups` | All plans | 24 h (unverified for Groups) | 24 h (unverified) | `count` + above as dimensions | **yes** (unverified) |
| `firewallEventsAdaptiveByTimeGroups` | unverified | unverified | unverified | time-bucketed variant | unverified |
| `rateLimitingEventsAdaptiveGroups` | — | — | — | — | **DOES NOT EXIST**. Use `firewallEvents*` + `source:"ratelimit"` |
| `healthCheckEventsAdaptive(Groups)` | Pro+ | — | — | — | **NO** — Health Checks unavailable on Free |
| `zarazTrackAdaptiveGroups` and 3 siblings | unverified | unverified | unverified | event counts, `datetimeHour`, fetch status codes | **unverified** — Zaraz is enabled here |
| `cacheReserve*AdaptiveGroups` | Cache Reserve | — | — | — | no — not enabled |
| `dnsAnalyticsAdaptive(Groups)` | unverified | unverified | unverified | DNS query analytics | unverified — DNS is on Cloudflare, so plausible |

### Account scope (`viewer.accounts`, needs Account → Account Analytics → Read)

| Dataset | Plan gate | Retention | Max range | Key dimensions / metrics | Available to us? |
|---|---|---|---|---|---|
| `rumPageloadEventsAdaptiveGroups` | Web Analytics (all plans); node marked **Beta** | 7 d unsampled, ~6 months aggregated | unverified | `refererHost`, `requestPath`, `countryName`, `deviceType`, `userAgentBrowser`, `userAgentOS`, `bot`, `siteTag`, `datetimeHour`; `count`, `sum{visits}`, `avg{sampleInterval}` | **unverified — token scope suspect.** In code; returned null on 08-16 |
| `rumWebVitalsEventsAdaptiveGroups` | as above | as above | unverified | **LCP / INP / CLS / FCP / TTFB** quantiles P25–P999, Good/NI/Poor sums, 36 dimensions incl. `requestPath`, `deviceType`, `*Element` | **unverified** — this is the CWV dataset |
| `rumPerformanceEventsAdaptiveGroups` | as above | as above | unverified | navigation timing: DNS, connection, request/response, FCP, page load, render — **no CWV** | unverified |
| `rumWebVitalsEventsAdaptive` (raw) | as above | as above | unverified | raw CLS + layout-shift rects only | unverified |
| `workersInvocationsAdaptive` | **Beta**; Workers plan gate undocumented | 3 months | ≤1 month (or ≤1 week) per query | `scriptName`, `status`, `datetime`; `sum{requests errors subrequests}`, `quantiles{cpuTimeP50 cpuTimeP99}` | **unverified** — account is Workers Paid |
| `d1AnalyticsAdaptiveGroups` | undocumented | **31 days** | unverified | `date`, `databaseId`; `sum{readQueries writeQueries rowsRead rowsWritten queryBatchResponseBytes databaseSizeBytes}`, `quantiles{queryBatchTimeMsP90}` | **unverified** |
| `kvOperationsAdaptiveGroups` | undocumented | **31 days** | unverified | `date`, `actionType`; `sum{requests}`, `quantiles{latencyMsP25…P999}` | **unverified** |
| `kvStorageAdaptiveGroups` | undocumented | 31 days | unverified | `date`; **`max{keyCount byteCount}`** | unverified |
| `r2OperationsAdaptiveGroups` | undocumented | **31 days** | unverified | `actionType`, `actionStatus`, `bucketName`, `responseStatusCode`, `datetime`; `sum{requests}` | **unverified** |
| `r2StorageAdaptiveGroups` | undocumented | 31 days | unverified | `bucketName`, `datetime`; **`max{payloadSize metadataSize objectCount uploadCount}`** | unverified |
| `durableObjects*` (4 nodes) | undocumented | unverified | unverified | `sum{requests responseBodySize cpuTime}`, `quantiles{memoryUsageBytes*}`, `max{storedBytes}` | unverified — we run one DO |
| `workersAnalyticsEngineAdaptiveGroups` | — | — | — | **no field documentation exists** | **name only** — use the SQL API instead |
| `aiGatewayRequestsAdaptiveGroups` | undocumented | unverified | unverified | `model`, `provider`, `gateway`, `datetimeMinute`; `count` | **no data** — we call `env.AI` directly, not via AI Gateway |
| `vectorizeQueriesAdaptiveGroups` | — | — | — | — | **DOES NOT EXIST** |
| Workers AI (`aiInferenceAdaptiveGroups`) | — | — | — | — | **DOES NOT EXIST** |
| Queues / Hyperdrive nodes | undocumented | 31 d (Hyperdrive) | unverified | — | not applicable — we run neither |

**Not GraphQL at all:** Workers Analytics Engine, read via
`POST /accounts/{id}/analytics_engine/sql`, 3-month retention, free on both
Workers plans (§2.7). That is the fallback for everything above marked
DOES NOT EXIST.

---

## 1. Zone-level datasets

`viewer { zones(filter: {zoneTag: $zoneTag}) { <dataset> } }`.

Cloudflare's own summary of plan gating:

> "Cloudflare allows access to ALL plans for essential datasets like
> `httpRequestsAdaptiveGroups`, though users on larger plans benefit from an
> extended set of datasets and wider query limits."
> — [Datasets (tables)](https://developers.cloudflare.com/analytics/graphql-api/features/data-sets/)

and, on where the real numbers live:

> "Node limits are tied to requested `zoneTag` or `accountTag`. Higher plans have
> access to a greater selection of datasets or fields, and can query over broader
> historical intervals."
> — [Limits](https://developers.cloudflare.com/analytics/graphql-api/limits/)

There is **no published table of dataset *availability* by plan.** It does not
exist — the datasets page, the limits page and the API landing page all defer to
the `settings` node. This is why §4 matters more than this section.

There is, however, a published table of **retention and query window** by plan,
and it is the single most useful table in this document. Verbatim from
[Security Events](https://developers.cloudflare.com/waf/analytics/security-events/):

| Data retention for… | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Security Events (`firewallEventsAdaptive`) | **24 hours** | 24 hours | 3 days | 30 days |
| Security Analytics (`httpRequestsAdaptive`) | **7 days** | 7 days | 31 days | 90 days |

| Maximum query window for… | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Security Events (`firewallEventsAdaptive`) | **24 hours** | 24 hours | 3 days | 31 days |
| Security Analytics (`httpRequestsAdaptive`) | **24 hours** | 7 days | 31 days | 31 days |

That is the documentation for the error we already hit. Free gets a **24-hour
query window** on the adaptive HTTP dataset with **7 days of retention** — so any
24-hour slice of the last week is reachable, just never a week in one query. And
firewall events on Free retain for **24 hours only**: unqueried, they are gone
permanently.

The table names the raw `httpRequestsAdaptive` / `firewallEventsAdaptive` nodes.
Whether the `*Groups` variants carry identical numbers is **UNVERIFIED** — §4.2
answers it for our zone in one call.

### 1.1 `httpRequests1dGroups` / `httpRequests1hGroups` / `httpRequests1mGroups`

The pre-adaptive, fully-aggregated request rollups. **Available to us — in
production use today** (`traffic.ts` pulls 180 days of `httpRequests1dGroups`).

Not sampled (no `Adaptive` in the name
— [Sampling](https://developers.cloudflare.com/analytics/graphql-api/sampling/)),
which makes these the right source for stable totals and the only one where a
180-day series is possible.

Complete field set, verbatim from the migration guide's `httpRequests1mGroups`
example — the `1h` and `1d` nodes take the same `sum`/`uniq` shape and differ
only in the time dimension
([Zone Analytics to GraphQL Analytics](https://developers.cloudflare.com/analytics/graphql-api/migration-guides/zone-analytics/)):

```graphql
sum {
  browserMap { pageViews uaBrowserFamily }
  bytes
  cachedBytes
  cachedRequests
  contentTypeMap { bytes requests edgeResponseContentTypeName }
  clientSSLMap { requests clientSSLProtocol }
  countryMap { bytes requests threats clientCountryName }
  encryptedBytes
  encryptedRequests
  ipClassMap { requests ipType }
  pageViews
  requests
  responseStatusMap { requests edgeResponseStatus }
  threats
  threatPathingMap { requests threatPathingName }
}
uniq { uniques }
```

Time dimension per node: `date` (1d), `datetimeHour` (1h),
`datetimeFiveMinutes` (1m).

**What `traffic.ts` is leaving on the table.** It reads `pageViews`,
`browserMap` and `uniques` only. Also available on the same free-plan call, at
zero extra cost, over the same 180 days:

- `countryMap { clientCountryName requests bytes threats }` — a **180-day**
  country series. `loadAcquisition` currently gets countries from the adaptive
  dataset and is therefore stuck at a 24-hour snapshot. This is the single
  cheapest upgrade available and it deletes a caveat from the dashboard.
- `responseStatusMap` — a 4xx/5xx error series for the site, 180 days.
- `contentTypeMap` — how much of the flood is PNG vs HTML, which is loose end #1
  in `seo-research/data/traffic-anatomy.md`.
- `ipClassMap { ipType requests }` — Cloudflare's own client classification. See
  §7.2: this is a bot signal that does not need Bot Management.
- `cachedRequests` / `cachedBytes` vs `requests` / `bytes` — cache hit ratio,
  180 days, which is otherwise hard to get on Free.
- `threats`, `threatPathingMap` — mitigated requests and what mitigated them.

Retention: **UNVERIFIED at 365 days.** Secondary sources say 365; `traffic.ts`
assumes ~200 and asks for 180, which works. Settle with the §4.2 settings query.

### 1.2 `httpRequestsAdaptiveGroups`

The canonical per-request dataset, sampled, groupable by almost any request
attribute. **Available to us — in production use today** (`loadAcquisition`).

**Capped at a 24-hour query window on Free, with 7 days of retention** (table
above). Already hit empirically: "cannot request a time range wider than 1d".
This is `maxDuration` = 86400 and `notOlderThan` = 604800; confirm with §4.2.

The 7-day retention is the part `traffic.ts` does not currently exploit. Its
comment says the breakdowns are "a 24-hour snapshot […] short enough that a
single crawler run can reorder the country list", which is true — but seven
separate 24-hour queries, stitched, give a 7-day picture for 7 of the 300
queries in a 5-minute budget. That is a legitimate answer to the cap; the thing
to avoid is looping it over 30 days, which retention forbids anyway.

Dimensions and filters, with the plan gate, verbatim from the AI Crawl Control
reference — this is the only page that publishes a per-plan filter table for
this dataset
([AI Crawl Control GraphQL API](https://developers.cloudflare.com/ai-crawl-control/reference/graphql-api/)):

| Filter | Plans |
|---|---|
| `requestSource: "eyeball"` | All |
| `userAgent_like` | All |
| `edgeResponseStatus_geq` / `_lt` | All |
| `clientRequestPath_like` | All |
| `clientRefererHost_like` | **Paid only** |
| `botDetectionIds_hasany` | **Bot Management** |

Dimensions named on that page: `datetimeHour`, `botDetectionIds`,
`clientRequestHTTPHost`, `userAgent`, `clientRequestPath`, `clientRefererHost`.
Metrics: `count`, `sum { edgeResponseBytes }`. Elsewhere: `sum { visits }`
([end-customer analytics](https://developers.cloudflare.com/analytics/graphql-api/tutorials/end-customer-analytics/)),
`clientCountryName`, `clientDeviceType` (both in production use in `traffic.ts`),
`coloCode`
([colo groups migration](https://developers.cloudflare.com/analytics/graphql-api/migration-guides/graphql-api-analytics/)),
and `webAssetsOperationId` / `webAssetsLabelsManaged` added 2026-03-23
([changelog](https://developers.cloudflare.com/changelog/post/2026-03-23-web-assets-graphql-fields/)).

Two corrections to the comment block in `traffic.ts`:

1. It says "`refererHost` is not available on this zone's plan (the API rejects
   the field outright)". Right conclusion, and now there is a citation: the field
   is `clientRefererHost` and it is **Paid-only**. Worth updating the comment so
   the next person does not re-test it.
2. `requestSource: "eyeball"` is not in any of our queries. Cloudflare uses it in
   every published example. **UNVERIFIED** what it excludes for us — plausibly
   Worker subrequests and internal traffic — but it is free to test and could
   change the top-paths list materially.

`sum { visits }` is defined as "a page view that originated from a different
website or direct link"
([migration guide](https://developers.cloudflare.com/analytics/graphql-api/migration-guides/graphql-api-analytics/)),
i.e. it excludes same-site navigation. That is a closer proxy for sessions than
anything currently on the dashboard.

### 1.3 `httpRequestsOverviewAdaptiveGroups`

Listed as a zone dataset
([Data Localization GraphQL datasets](https://developers.cloudflare.com/data-localization/metadata-boundary/graphql-datasets/))
and present in the schema at **both** zone and account scope, described as "A
high-level summary of HTTP requests made by end users" — but it is **documented
nowhere on developers.cloudflare.com**. No page, no example, no field list.

Worth one probe anyway, because a reduced-cardinality overview node plausibly
carries a wider `maxDuration` than `httpRequestsAdaptiveGroups`, and if so it is
the free fix for the 24-hour cap. **UNVERIFIED; treat as unsupported until §4.2
says `enabled: true`, and do not build a tool on it** — an undocumented node can
change without a changelog entry.

### 1.4 `firewallEventsAdaptiveGroups` / `firewallEventsAdaptive`

**Available on Free** — named among the "essential datasets" open to all plans
([Settings node](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/)).
Three nodes exist: `firewallEventsAdaptive`, `firewallEventsAdaptiveGroups`,
`firewallEventsAdaptiveByTimeGroups`.

> **Retention on Free is 24 HOURS.** Not 24-hour *window* — 24-hour *retention*
> (table above). Anything not queried within a day is gone permanently, with no
> backfill. This is the one dataset in this document where the MCP design
> question is not "how do we read it" but "do we poll and persist it".

Cloudflare confirms the dataset identity: "If you query Security Events data
through the GraphQL Analytics API, the underlying dataset is
`firewallEventsAdaptive`"
([Security Events](https://developers.cloudflare.com/waf/analytics/security-events/)).
Free is also marked "Sampled logs only" in that page's availability matrix.

Fields, verbatim from the curl example
([Execute a GraphQL query with curl](https://developers.cloudflare.com/analytics/graphql-api/getting-started/execute-graphql-query/)):
`action`, `clientAsn`, `clientCountryName`, `clientIP`, `clientRequestPath`,
`clientRequestQuery`, `datetime`, `source`, `userAgent`. `ruleId` and
`clientRequestHTTPHost` also appear in Cloudflare's reference material.
Which of these are groupable `dimensions` on the `*Groups` variant is
**UNVERIFIED** — resolve with `availableFields` (§4.2).

**Relevance to us is real but narrow.** The zone has exactly one free WAF rate-
limiting rule (300 req/10s on `/api/*`, `*.png`, `*.json` — recorded in
`seo-research/mcp-design.md` §2.4). Firewall events tell you whether it is
firing and against whom. Note `clientIP` here: this is the one zone dataset that
returns a per-person identifier, which is a design constraint in §8.4.

### 1.5 Rate-limiting events

**`rateLimitingEventsAdaptiveGroups` does not exist.** It is absent from the
published dataset list
([Data Localization GraphQL datasets](https://developers.cloudflare.com/data-localization/metadata-boundary/graphql-datasets/)),
absent from the schema, and referenced nowhere on developers.cloudflare.com.

**Our new rate-limit rule surfaces in `firewallEventsAdaptiveGroups` with
`source: "ratelimit"`.** Rate limiting rules are listed among the services that
generate Security Events
([Security Events](https://developers.cloudflare.com/waf/analytics/security-events/)),
and the `source` enum — shared with the Logpush `firewall_events` dataset
([Logpush firewall_events](https://developers.cloudflare.com/logs/logpush/logpush-job/datasets/zone/firewall_events/))
— is:

```
unknown | asn | country | ip | iprange | securitylevel | zonelockdown | waf |
firewallrules | uablock | ratelimit | bic | hot | l7ddos | validation |
botfight | apishield | botmanagement | dlp | firewallmanaged | firewallcustom |
apishieldschemavalidation | apishieldtokenvalidation | apishieldsequencemitigation
```

Two values matter to us: **`ratelimit`** (our one free rule) and **`botfight`**
(Bot Fight Mode, which is the only bot product on the Free plan —
[Bots on Free](https://developers.cloudflare.com/bots/plans/free/)). If Bot
Fight Mode is enabled, `source: "botfight"` is a *second* free bot signal and it
is one Cloudflare computed, not a regex we wrote.

Free-plan rate limiting is severely constrained and worth stating so nobody
expects it to solve the flood problem
([Rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)):
**1 rule**, expression fields limited to **Path and Verified Bot**, counting by
**IP only**, max counting period **10 s**, max mitigation timeout **10 s**. It
generates queryable events; it is close to useless as mitigation.

### 1.6 `healthCheckEventsAdaptive` / `healthCheckEventsAdaptiveGroups`

First, the node name in the brief does not exist: it is
`healthCheckEventsAdaptive` / `healthCheckEventsAdaptiveGroups`.

Second, **Health Checks are not available on Free at all.** Verbatim from
[Health Checks](https://developers.cloudflare.com/health-checks/): availability
Free = **No**, number of checks = **0**, analytics = **No**. Ruled out entirely.
Not "unverified" — ruled out.

### 1.7 Cache and performance

There is no separate cache dataset on Free. Cache data comes from two places:

- `httpRequests1dGroups`: `cachedRequests` / `cachedBytes` vs `requests` /
  `bytes` → hit ratio over 180 days (§1.1).
- `httpRequestsAdaptiveGroups`: a **`cacheStatus`** dimension ("hit, miss,
  dynamic, etc.") exists in the schema, alongside `edgeResponseStatus` and the
  performance sums `edgeTimeToFirstByteMs` and `originResponseDurationMs`. The
  24-hour window applies.

  **Do not confuse the dashboard gate with the dataset gate.** Cache Analytics
  *in the UI* is Pro+ — Free = "No", Pro 7 days, Business/Enterprise 30 days
  ([Cache Analytics](https://developers.cloudflare.com/cache/performance-review/cache-analytics/))
  — but `httpRequestsAdaptiveGroups` is named as an all-plans essential dataset.
  So the dataset may well answer cache questions the dashboard refuses to show
  us. **UNVERIFIED whether `cacheStatus` appears in our `availableFields`; this
  is the single most valuable empirical check in §1**, because a "yes" gives us
  a cache-hit-ratio-by-path view we cannot otherwise buy.

  `edgeTimeToFirstByteMs` is separately interesting: the project memory records
  a TTFB problem attributed to "D1 + double `getSession`". This measures it at
  the edge, per path.

`cacheReserveOperationsAdaptiveGroups` / `cacheReserveRequestsAdaptiveGroups` /
`cacheReserveStorageAdaptiveGroups` exist but Cache Reserve is not enabled here.

### 1.8 Zaraz

`zarazTrackAdaptiveGroups`, `zarazActionsAdaptiveGroups`,
`zarazTriggersAdaptiveGroups`, `zarazFetchAdaptiveGroups` — zone-scoped
([Zaraz monitoring API](https://developers.cloudflare.com/zaraz/monitoring/monitoring-api/)).

Worth a look precisely because **GA4 on this site is delivered through Zaraz**.
`zarazFetchAdaptiveGroups` returns server-side request status codes, so it can
answer "is the GA4 beacon actually firing and succeeding" without going to
Google. `zarazTrackAdaptiveGroups` returns event counts by `datetimeHour`.
**UNVERIFIED** on our plan; Zaraz has a free tier and is enabled here, so this is
likely reachable. Low priority, genuinely useful for debugging the analytics
visibility gotcha already in the project memory.

---

## 2. Account-level datasets

`viewer { accounts(filter: {accountTag: $accountTag}) { <dataset> } }`.

> **The token permission question is the gate on this entire section.** The API
> token docs describe creating the analytics token as: "select *Account* in the
> first drop-down list, *Account Analytics* from the second drop-down list, and
> *Read* from the third"
> ([API token authentication](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/)).
> `CF_ANALYTICS_TOKEN` is documented in `apps/admin/src/env.d.ts` as **Zone →
> Analytics → Read**. A zone-scoped permission does not grant `viewer.accounts`.
>
> **There is direct evidence this is already biting.**
> `seo-research/data/brief-2026-08-16.json` has `"traffic_sources": null`, which
> is what `loadReferrers` returns when the account-scoped RUM query errors — and
> `traffic-anatomy.md` records "`traffic_sources` was still null on 08-16". That
> was read as "RUM has no data yet". It may equally be "the token cannot read
> account scope". **Settle this first** (§4.3); if the token needs widening,
> every account-level tool below is blocked behind one dashboard edit.

Everything below is **account-scoped and therefore blocked on that one question.**
Retention and plan gates are almost never published per dataset — resolve them
with §4.2 rather than trusting this table.

### 2.1 `workersInvocationsAdaptive` — Workers health

The account is on Workers Paid, and this is the dataset that would tell us
whether the traffic floods are costing us anything. Marked **beta** in
Cloudflare's own naming-convention note: "we have a node that currently excluded
from that naming convention - `workersInvocationsAdaptive` (**beta**)"
([Datasets (tables)](https://developers.cloudflare.com/analytics/graphql-api/features/data-sets/)).

Documented fields — and the list is short, which matters:

- Dimensions: `datetime`, `scriptName`, `status` (plus `dispatchNamespaceName` for
  Workers for Platforms, which we do not use).
- `sum { requests errors subrequests }`
- `quantiles { cpuTimeP50 cpuTimeP99 }`

`status` enum, verbatim from the invocation-statuses table whose column header is
literally "GraphQL field"
([Workers metrics and analytics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)):
`success`, `clientDisconnected`, `scriptThrewException` (error 1101),
`exceededResources` (1102, 1027), `internalError`.

> **`duration`, `wallTime`, `responseBodySize` and memory quantiles are NOT
> documented for this node**, despite the dashboard displaying all of them.
> They may exist. Resolve by introspection (§4.1) rather than by guessing.

Retention — the docs give two different numbers and both are worth knowing:

> "We can query **up to one month of data for dates up to three months ago**"
> — [Querying Workers Metrics with GraphQL](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/)

> "Worker metrics can be inspected for **up to three months in the past in
> maximum increments of one week**"
> — [Workers metrics and analytics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)

Complete example, verbatim from the tutorial:

```graphql
query GetWorkersAnalytics($accountTag: string, $datetimeStart: string, $datetimeEnd: string, $scriptName: string) {
  viewer {
    accounts(filter: {accountTag: $accountTag}) {
      workersInvocationsAdaptive(limit: 100, filter: {
        scriptName: $scriptName,
        datetime_geq: $datetimeStart,
        datetime_leq: $datetimeEnd
      }) {
        sum {
          subrequests
          requests
          errors
        }
        quantiles {
          cpuTimeP50
          cpuTimeP99
        }
        dimensions{
          datetime
          scriptName
          status
        }
      }
    }
  }
}
```

Note the variable type is lowercase `string`, not `String!`. That is how
Cloudflare's schema declares it, consistently across every product example.

Related account nodes, named but not field-documented
([Data Localization GraphQL datasets](https://developers.cloudflare.com/data-localization/metadata-boundary/graphql-datasets/)):
`workersSubrequestsAdaptiveGroups`, `workersInvocationsScheduled`,
`workerPlacementAdaptiveGroups`, `workersOverviewRequestsAdaptiveGroups`,
`workersOverviewDataAdaptiveGroups`, plus zone-scoped
`workersZoneInvocationsAdaptiveGroups` / `workersZoneSubrequestsAdaptiveGroups`.

### 2.2 `d1AnalyticsAdaptiveGroups` — D1 usage

**Retention: "Metrics can be queried (and are retained) for the past 31 days"**
([D1 metrics and analytics](https://developers.cloudflare.com/d1/observability/metrics-analytics/)).
Requires `accountTag`. Siblings: `d1StorageAdaptiveGroups`,
`d1QueriesAdaptiveGroups` (the latter captures query strings, bound parameters
excluded — a PII consideration, see §8.4).

Dimensions `date`, `databaseId`. Metrics, from the page's own "GraphQL Field
Name" column:

| Metric | GraphQL field | Note |
|---|---|---|
| Read queries | `readQueries` | raw count, **not** the billing figure |
| Write queries | `writeQueries` | raw count, **not** the billing figure |
| Rows read | `rowsRead` | this *is* the billing dimension |
| Rows written | `rowsWritten` | |
| Query response bytes | `queryBatchResponseBytes` | |
| Query latency | `queryBatchTimeMs` | server-side, incl. serialization |
| Storage | `databaseSizeBytes` | |

Only `queryBatchTimeMsP90` is documented under `quantiles`; others UNVERIFIED.

```graphql
query D1ObservabilitySampleQuery(
	$accountTag: string!
	$start: Date
	$end: Date
	$databaseId: string
) {
	viewer {
		accounts(filter: { accountTag: $accountTag }) {
			d1AnalyticsAdaptiveGroups(
				limit: 10000
				filter: { date_geq: $start, date_leq: $end, databaseId: $databaseId }
				orderBy: [date_DESC]
			) {
				sum {
					readQueries
					writeQueries
				}
				dimensions {
					date
					databaseId
				}
			}
		}
	}
}
```

`rowsRead` per day is the number that matters here. `CLAUDE.md` records that
every page load fires a session check, and the memory notes a TTFB problem from
"D1 + double `getSession`". This dataset measures exactly that, and it measures
what the floods are doing to it.

### 2.3 `kvOperationsAdaptiveGroups` — KV usage

**Retention 31 days**
([KV metrics and analytics](https://developers.cloudflare.com/kv/observability/metrics-analytics/)).
Dimensions `date`, `actionType` (`read` / `write` / `delete` / `list`);
filterable by `namespaceId`. `sum { requests }`. Quantiles `latencyMsP25`,
`latencyMsP50`, `latencyMsP75`, `latencyMsP90`, `latencyMsP99`, `latencyMsP999`.

Sibling `kvStorageAdaptiveGroups`: dimension `date`, and **`max { keyCount
byteCount }`** — `max`, not `sum`.

Relevant because `apps/web` runs `SEARCH_CACHE` and `OG_IMAGE_CACHE`. A KV read
spike with a flat write count is a cache working; both spiking is a cache being
bypassed.

### 2.4 `r2OperationsAdaptiveGroups` / `r2StorageAdaptiveGroups` — R2 usage

**Retention 31 days**
([R2 metrics and analytics](https://developers.cloudflare.com/r2/platform/metrics-analytics/)).

Operations dimensions: `actionType`, `actionStatus` (`success` / `userError` /
`internalError`), `bucketName`, `objectName`, `responseStatusCode`, `datetime`.
Metric `sum { requests }`; no latency quantiles documented.

Storage: `bucketName`, `payloadSize`, `metadataSize`, `objectCount`,
`uploadCount`, `datetime`, aggregated with **`max {}`**.

Two traps: R2 uses `datetime_geq` with `Time`, while D1 and KV use `date_geq`
with `Date` — do not copy filter shapes between datasets. And buckets with a
jurisdiction need the jurisdiction prefixed with an underscore (`eu_bucket-name`)
or you may silently query a different same-named bucket.

Relevant to the avatars bucket, and specifically to the incident recorded in
`CLAUDE.md` about the two r2.dev URLs each fronting exactly one bucket.

### 2.5 Vectorize — **no GraphQL dataset exists**

`vectorizeQueriesAdaptiveGroups` is **not documented anywhere**. A grep of the
complete Vectorize documentation bundle
([vectorize/llms-full.txt](https://developers.cloudflare.com/vectorize/llms-full.txt),
194 KB) returns zero occurrences of `vectorizeQueries`, `AdaptiveGroups` or
`graphql`, and there is no observability page under
[developers.cloudflare.com/vectorize/](https://developers.cloudflare.com/vectorize/)
at all.

This is a real gap for us, not a footnote: `traffic-anatomy.md` loose end #2
lists Vectorize as flood-exposed cost, because `/palettes/{anything}` runs a
Vectorize query on cache miss. **That exposure is not measurable through
GraphQL.** The available answers are the dashboard, or instrumenting it
ourselves into Analytics Engine.

### 2.6 Workers AI — **no GraphQL dataset either**

Same method, same result: `workers-ai/llms-full.txt` (492 KB) contains zero
occurrences of `aiInference`, `AdaptiveGroups` or `graphql`. Neuron usage is
dashboard-only ([Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)).

The one GraphQL path is `aiGatewayRequestsAdaptiveGroups`, which covers **only**
inference routed through AI Gateway, not raw `env.AI` binding calls
([AI Gateway analytics](https://developers.cloudflare.com/ai-gateway/observability/analytics/)).
Account-scoped; dimensions `model`, `provider`, `gateway`, `datetimeMinute`;
metric `count`; filters `datetimeHour_geq` / `datetimeHour_leq`. We call `env.AI`
directly, so today this returns nothing. Routing embeddings through AI Gateway
would make per-model usage queryable — a real option, and a bigger change than it
sounds.

### 2.7 `workersAnalyticsEngineAdaptiveGroups` — name only; use the SQL API

The node name appears exactly once in all of Cloudflare's documentation — in the
Data Localization dataset table
([GraphQL datasets](https://developers.cloudflare.com/data-localization/metadata-boundary/graphql-datasets/))
— with no field documentation and no example query anywhere.
`developers.cloudflare.com/analytics/analytics-engine/graphql-api/` returns 404.

**Analytics Engine is read through its SQL API, not GraphQL**
([SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/)):
`https://api.cloudflare.com/client/v4/accounts/<account_id>/analytics_engine/sql`.
Schema is auto-created per dataset as `index1`, `blob1`…`blob20`,
`double1`…`double20`
([Get started](https://developers.cloudflare.com/analytics/analytics-engine/get-started/)).
Retention **3 months**
([Limits](https://developers.cloudflare.com/analytics/analytics-engine/limits/)).
Free on both plans
([Pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/)):
Workers Free gets 100,000 data points written and 10,000 read queries **per
day**; Workers Paid gets 10 million writes and 1 million reads per month.

This is the escape hatch for everything GraphQL cannot see — Vectorize calls,
Workers AI neurons, per-MCP-tool metrics. `seo-research/mcp-design.md` §4.3
already proposes an `MCP_METRICS` Analytics Engine dataset for exactly this
reason. Note it is a **different API** from everything else in this document, so
an MCP tool for it is a separate tool, not another dataset argument.

### 2.8 Durable Objects, Queues, Hyperdrive

We run one Durable Object (`RateLimiter`) and neither Queues nor Hyperdrive.

Durable Objects: `durableObjectsInvocationsAdaptiveGroups`
(`sum { requests responseBodySize }`), `durableObjectsPeriodicGroups`
(`sum { cpuTime }`, `quantiles { memoryUsageBytesP50 … P999 }`),
`durableObjectsStorageGroups` (`max { storedBytes }`),
`durableObjectsSubrequestsAdaptiveGroups`. The docs decline to list fields —
"Use GraphQL Introspection to get information on the fields exposed by each
datasets"
([DO GraphQL analytics](https://developers.cloudflare.com/durable-objects/observability/graphql-analytics/)),
which is a second official endorsement of the §4 approach. Retention and plan
gate UNVERIFIED.

Queues and Hyperdrive are documented (Hyperdrive at 31 days retention) but we run
neither. Skipping.

---

## 3. Core Web Vitals through RUM — yes, but not from the dataset you would guess

**`rumPerformanceEventsAdaptiveGroups` does NOT carry LCP, INP or CLS.** It is
navigation-timing only: DNS, connection, request/response, FCP, page load and
render. It is the dashboard's *Page load time* tab.

Core Web Vitals live in **`rumWebVitalsEventsAdaptiveGroups`**, a fourth RUM
dataset. All four RUM nodes are account-scoped and appear in the authoritative
dataset list under Web Analytics / RUM
([Data Localization GraphQL datasets](https://developers.cloudflare.com/data-localization/metadata-boundary/graphql-datasets/)):
`rumPageloadEventsAdaptiveGroups`, `rumPerformanceEventsAdaptiveGroups`,
`rumWebVitalsEventsAdaptive`, `rumWebVitalsEventsAdaptiveGroups`.

> **Sourcing caveat, stated plainly.** Cloudflare publishes **no per-field
> documentation for any RUM dataset.** The field lists in §3.1–§3.3 were
> extracted from a third-party mirror of the `__schema` introspection output
> ([pages.johnspurlock.com/graphql-schema-docs/cloudflare.html](https://pages.johnspurlock.com/graphql-schema-docs/cloudflare.html)),
> which is **not authoritative**. They are consistent with dashboard behaviour
> and with `traffic.ts`'s working `refererHost` query, but every one of them
> should be re-derived with §4.1 against our own token before code depends on
> it. This is the strongest argument in the document for building introspection
> into the MCP server rather than a static field list.

### 3.1 `rumWebVitalsEventsAdaptiveGroups` — the CWV dataset

`quantiles`: 9 metrics × 7 percentiles (`P25 P50 P75 P90 P95 P99 P999`):
`largestContentfulPaint*`, `interactionToNextPaint*`, `cumulativeLayoutShift*`,
`firstContentfulPaint*`, `timeToFirstByte*`, `firstInputDelay*` *(deprecated)*,
`lcpElementRenderDelay*`, `lcpResourceLoadDelay*`, `lcpResourceLoadTime*`.

So `largestContentfulPaintP75`, `interactionToNextPaintP75` and
`cumulativeLayoutShiftP75` — the three headline Core Web Vitals at the standard
75th percentile — are directly queryable. **INP is present; FID is deprecated.**

`sum`: rating buckets, which is how the dashboard's Good / Needs Improvement /
Poor bars are built, with thresholds baked into the schema comments:

| Metric | Good | Needs improvement | Poor | Total |
|---|---|---|---|---|
| LCP | `lcpGood` <2.5 s | `lcpNeedsImprovement` | `lcpPoor` >4.0 s | `lcpTotal` |
| INP | `inpGood` <200 ms | `inpNeedsImprovement` | `inpPoor` >500 ms | `inpTotal` |
| CLS | `clsGood` <0.1 | `clsNeedsImprovement` | `clsPoor` >0.25 | `clsTotal` |
| FCP | `fcpGood` <1.8 s | `fcpNeedsImprovement` | `fcpPoor` >3 s | `fcpTotal` |
| TTFB | `ttfbGood` <800 ms | `ttfbNeedsImprovement` | `ttfbPoor` | `ttfbTotal` |

Plus `visits`. `avg` carries the same nine metrics plus `sampleInterval`.

Dimensions: the 21 shared RUM dimensions (§3.2) plus 15 CWV attribution
dimensions — `largestContentfulPaintElement`, `interactionToNextPaintElement`,
`cumulativeLayoutShiftElement`, `largestContentfulPaintObjectPath`,
`lcpFetchPriority`, `lcpInitiatorType` and friends. Those power the dashboard's
Debug View ("top five elements with a negative impact on each metric" —
[Core Web Vitals](https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/)),
and they are the genuinely actionable part for SEO: they name the element that is
slow, not just the number.

> **Three traps, each of which produces plausible-looking wrong data:**
>
> 1. **Timings are in MICROSECONDS** (`int64`), not milliseconds. Divide by 1000.
> 2. **A negative value means N/A**, not a fast page. Filter before averaging.
> 3. **Group by `requestPath` for "CWV by page".** `largestContentfulPaintPath`
>    is the observed path *of the metric* and `largestContentfulPaintObjectPath`
>    is the path *of the LCP resource*. Both look right and are not.
>
> CLS is the exception to (1): a unitless `float64`.

### 3.2 `rumPageloadEventsAdaptiveGroups` — what `traffic.ts` already uses

21 dimensions: `bot`, `countryName`, `customTagInternalSxg`, `date`,
`datetimeFifteenMinutes`, `datetimeFiveMinutes`, `datetimeHalfOfHour`,
`datetimeHour`, `datetimeMinute`, `deliveryType`, `deviceType`,
`navigationType`, `refererHost`, `refererPath`, `refererScheme`, `requestHost`,
`requestPath`, `requestScheme`, `siteTag`, `userAgentBrowser`, `userAgentOS`.
`sum { visits }`, `count`, `avg { sampleInterval }`. **No CWV fields.**

Three things `loadReferrers` is missing:

- **`bot` is a dimension** — `uint8`, "Returns 1 if from a bot, 0 otherwise",
  matching the dashboard's "Exclude Bots" toggle
  ([Web Analytics dimensions](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/)).
  The comment in `traffic.ts` says RUM counts are "already bot-free, without the
  user-agent heuristic" because crawlers do not run JavaScript. **That is close
  but not exact** — Cloudflare ships a bot flag precisely because some do. Add
  `bot: 0` to the filter and say "bot-filtered by Cloudflare" rather than
  "bot-free by construction".
- **`siteTag` is not filtered.** These datasets are account-scoped, so an
  unfiltered query aggregates **every Web Analytics site in the account**. One
  site today, so it is currently harmless and permanently fragile. Get the tag
  from `GET /accounts/{account_id}/rum/site_info/list`
  ([RUM API](https://developers.cloudflare.com/api/resources/rum/)) — it is also
  the `data-cf-beacon` token in the page.
- **`requestPath` exists.** Landing pages from real browsers, bot-filtered — the
  thing `loadAcquisition`'s adaptive top-paths query cannot give without the
  1-day cap and cannot bot-filter at all.

`datetime` is **not** a groupable dimension here (only a filter). Use
`datetimeHour`.

### 3.3 Retention, sampling and the plan gate

Verbatim from the [Web Analytics FAQ](https://developers.cloudflare.com/web-analytics/faq/):

> "We retain unsampled beacon data for the past 7 days, after this point data is
> aggregated down to around 10%."

> "Currently, you can access data for the previous six months."

> "When aggregating metrics in the Cloudflare Dashboard or querying the GraphQL
> API, a level of sampling (between 0.0001% and 100%) will be dynamically
> selected based on the filters applied and the volume of matching rows."

> "The GraphQL API exposes a `sampleInterval` field to indicate which level of
> sampling has been applied to the query."

**Plan gate: UNVERIFIED.** Web Analytics itself is "Available on all plans"
([Web Analytics](https://developers.cloudflare.com/web-analytics/)), but all four
RUM GraphQL nodes are marked `Beta.` in the schema, and the introspection docs
warn beta nodes are "typically available to customers on extensive plans"
([Introspection](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/introspection/)).
Since RUM only started collecting on 2026-08-15, "no rows" and "not entitled" are
currently indistinguishable — which is exactly the ambiguity in
`"traffic_sources": null`. §4.2 and §4.3 separate them.

For grabient specifically, sampling is the practical worry, not the plan: at ~4–6K
real pageviews/day, per-path CWV percentiles rest on very few rows. Cloudflare's
own guidance — "results based on thousands of rows are highly likely to be
representative, while those based on just a few rows may not be as reliable"
([Understanding sampling](https://developers.cloudflare.com/analytics/sampling/))
— means a per-path CWV table should refuse to render a row below a minimum
`count`. Site-wide P75 will be fine; `/palettes/{seed}` per-seed will not.

### 3.4 Worked example — CWV by page path and device

**UNVERIFIED: assembled from introspected field names, never executed.** Validate
in the API Explorer (§4.4) before building on it.

```graphql
query CoreWebVitalsByPath($accountTag: string!, $siteTag: string!, $start: Time!, $end: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      rumWebVitalsEventsAdaptiveGroups(
        filter: { siteTag: $siteTag, datetime_geq: $start, datetime_leq: $end, bot: 0 }
        limit: 100
        orderBy: [count_DESC]
      ) {
        count
        avg { sampleInterval }
        dimensions { requestPath deviceType }
        quantiles {
          largestContentfulPaintP75
          interactionToNextPaintP75
          cumulativeLayoutShiftP75
          firstContentfulPaintP75
          timeToFirstByteP75
        }
        sum {
          visits
          lcpGood lcpNeedsImprovement lcpPoor lcpTotal
          inpGood inpNeedsImprovement inpPoor inpTotal
          clsGood clsNeedsImprovement clsPoor clsTotal
        }
      }
    }
  }
}
```

Post-processing, in the data layer and not the view: divide timing quantiles by
1000; drop negative quantiles; multiply **counts only** by `sampleInterval`;
never scale quantiles.

This closes a real gap. The project memory records a PageSpeed baseline from
July 2026 (perf 64, TBT 870 ms, INP 367 ms) taken from **lab** measurement. This
dataset is **field** measurement of the same metrics, segmented by real page and
real device, which is what Google actually ranks on.

---

## 4. Runtime discovery — the part that matters most

Three queries, in order. Together they answer "what can THIS token see, on THIS
plan, right now", which no document can answer for you and which will drift.

### 4.1 Introspection: what datasets and fields exist

Cloudflare supports standard GraphQL introspection and publishes the full
`__schema` query
([Introspection](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/introspection/)).
That query returns the *entire* schema — thousands of types, megabytes of JSON,
useless to paste into a model's context. Use the targeted `__type` form instead.

**Step 1 — list every zone-scoped dataset.**

```bash
printf '%s' '{"query":"{ __type(name: \"Zone\") { fields { name description } } }"}' \
  | curl --silent https://api.cloudflare.com/client/v4/graphql \
    --header "Authorization: Bearer $CF_ANALYTICS_TOKEN" \
    --header "Content-Type: application/json" \
    --data @-
```

Swap `"Zone"` for `"Account"` to list account-scoped datasets.

> Introspection describes the **schema**, which is the same for everyone. It does
> **not** tell you what your plan permits — a Free zone still sees
> `healthCheckEventsAdaptive` in `Zone.fields`. §4.2 is what filters that list
> down to reality. Use them together, never introspection alone.

**Step 2 — get the element type and filter type for one dataset.**

```graphql
{
  __type(name: "Zone") {
    fields {
      name
      type { name kind ofType { name kind ofType { name } } }
      args { name type { name kind ofType { name } } }
    }
  }
}
```

Naming follows a strict convention — `ZoneZarazTriggersAdaptiveGroupsOrderBy`
appears verbatim in the Zaraz docs
([Zaraz monitoring API](https://developers.cloudflare.com/zaraz/monitoring/monitoring-api/))
— so the types are predictable, but **read them out of the response rather than
constructing them by hand**. That is the whole point of doing this at runtime.

**Step 3 — the payoff: enumerate every dimension, metric and filter operator.**

```graphql
{
  element: __type(name: "<ElementTypeFromStep2>") {
    fields { name description type { name kind ofType { name } } }
  }
  filter: __type(name: "<FilterTypeFromStep2>") {
    inputFields { name description type { name kind ofType { name } } }
  }
}
```

The `filter` half is the most valuable single response in this document. It
returns every filterable key **including every operator suffix** — `datetime`,
`datetime_geq`, `datetime_leq`, `userAgent_like`, `edgeResponseStatus_geq`,
`botDetectionIds_hasany` and so on. It is the definitive answer to "does
`clientRefererHost_like` exist for us", "is there a `cacheStatus` filter", and
"which operators work on which field" — questions §1 could only answer as
UNVERIFIED.

### 4.2 The `settings` node: per-token, per-plan limits

Verbatim from
[Settings node](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/):

```graphql
query SampleQuery($zoneTag: string) {
	viewer {
		zones(filter: { zoneTag: $zoneTag }) {
			settings {
				firewallEventsAdaptive {
					enabled
					maxDuration
					maxNumberOfFields
					maxPageSize
					notOlderThan
				}
			}
		}
	}
}
```

```json
{
	"data": {
		"viewer": {
			"zones": [
				{
					"settings": {
						"firewallEventsAdaptive": {
							"enabled": true,
							"maxDuration": 259200,
							"maxNumberOfFields": 30,
							"maxPageSize": 10000,
							"notOlderThan": 2678400
						}
					}
				}
			]
		}
	},
	"errors": null
}
```

Field meanings, verbatim from the same page:

- `enabled` — "Indicates dataset availability for the requester"
- `maxPageSize` — "retrieves the maximum number of records that can be returned"
- `maxNumberOfFields` — "answers on how many fields could be used in a single query for that node"
- `notOlderThan` — "returns a number of seconds on how far back in time a query can read" (retention)
- `maxDuration` — "shows how wide the requested time range could be" (the 24-hour cap, in seconds)

**Also request `availableFields`** — a list of the fields this token may actually
request on this node, in flattened form (`sum_requests` and so on). It is not in
the documented example above but is described on the same page, and it is the
field that settles every "is `cacheStatus` / `botScore` / `clientRequestPath`
available to us" question in §1 without trial and error. Treat it as
**UNVERIFIED-but-try-it**: if the server rejects the field name, drop it and fall
back to §4.1 introspection.

**Run this for grabient.com, naming every dataset at once.** This is the query
that turns §1 from research into fact:

```bash
printf '%s' '{"query":"query($z:string){viewer{budget zones(filter:{zoneTag:$z}){settings{
httpRequests1dGroups{enabled maxDuration maxNumberOfFields maxPageSize notOlderThan availableFields}
httpRequests1hGroups{enabled maxDuration maxNumberOfFields maxPageSize notOlderThan}
httpRequestsAdaptiveGroups{enabled maxDuration maxNumberOfFields maxPageSize notOlderThan availableFields}
httpRequestsOverviewAdaptiveGroups{enabled maxDuration maxNumberOfFields maxPageSize notOlderThan}
firewallEventsAdaptive{enabled maxDuration maxNumberOfFields maxPageSize notOlderThan}
firewallEventsAdaptiveGroups{enabled maxDuration maxNumberOfFields maxPageSize notOlderThan availableFields}
}}}}","variables":{"z":"'"$CF_ZONE_ID"'"}}' \
  | tr -d '\n' \
  | curl --silent https://api.cloudflare.com/client/v4/graphql \
    --header "Authorization: Bearer $CF_ANALYTICS_TOKEN" \
    --header "Content-Type: application/json" \
    --data @-
```

`viewer { budget }` returns the remaining GraphQL query allowance (§5.7). Cheap,
and worth including in any tool that runs several queries in one turn.

Adding a dataset our plan does not know about produces a GraphQL error naming the
unknown field, which is itself an answer. To discover which datasets *have*
settings without guessing, introspect the settings type:
`{ __type(name: "ZoneSettings") { fields { name } } }` — **UNVERIFIED type name**,
read the real one out of step 2 above.

**Is there an account equivalent?** UNVERIFIED. The documented example is
zone-scoped only. Try:

```graphql
{ viewer { accounts(filter: {accountTag: "<ACCOUNT_ID>"}) { settings { workersInvocationsAdaptive { enabled maxDuration notOlderThan } } } } }
```

### 4.3 The token-scope probe

The cheapest possible test of whether `CF_ANALYTICS_TOKEN` can reach account
scope at all. Run it before believing anything in §2:

```bash
printf '%s' '{"query":"{viewer{accounts(filter:{accountTag:\"'"$CF_ACCOUNT_ID"'\"}){__typename}}}"}' \
  | curl --silent https://api.cloudflare.com/client/v4/graphql \
    --header "Authorization: Bearer $CF_ANALYTICS_TOKEN" \
    --header "Content-Type: application/json" \
    --data @-
```

`{"data":{"viewer":{"accounts":[{"__typename":"Account"}]}}}` means the token has
account scope. An empty `accounts` array or an authorization error means it does
not, and the fix is to add **Account → Account Analytics → Read** to the token in
the dashboard
([API token authentication](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/)).

### 4.4 Two tools you can use today instead of writing code

- **GraphQL API Explorer** — `https://graphql.cloudflare.com/explorer`, a hosted
  GraphiQL with schema browsing, already authenticated as your dashboard session
  ([changelog 2025-05-23](https://developers.cloudflare.com/changelog/post/2025-05-23-graphql-api-explorer/)).
  The fastest way to answer every UNVERIFIED item in this document.
- **Cloudflare's own MCP servers** — `https://graphql.mcp.cloudflare.com/mcp`
  (schema search + query execution) and the unified
  `https://mcp.cloudflare.com/mcp`
  ([servers-for-cloudflare](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/),
  [cloudflare/mcp](https://github.com/cloudflare/mcp)). Connect one of these to
  the same client for an afternoon before writing a line of our own. See §8.1.

---

## 5. Query mechanics

### 5.1 Transport

One endpoint, POST, JSON body with `query` and `variables`. Verbatim
([Execute a GraphQL query with curl](https://developers.cloudflare.com/analytics/graphql-api/getting-started/execute-graphql-query/)):

```bash
echo '{ "query":
  "{
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        firewallEventsAdaptive(
          filter: $filter
          limit: 10
          orderBy: [datetime_DESC]
        ) {
          action
          clientAsn
          clientCountryName
          clientIP
          clientRequestPath
          clientRequestQuery
          datetime
          source
          userAgent
        }
      }
    }
  }",
  "variables": {
    "zoneTag": "<zone-tag>",
    "filter": {
      "datetime_geq": "2022-07-24T11:00:00Z",
      "datetime_leq": "2022-07-24T12:00:00Z"
    }
  }
}' | tr -d '\n' | curl --silent \
https://api.cloudflare.com/client/v4/graphql \
--header "Authorization: Bearer <API_TOKEN>" \
--header "Content-Type: application/json" \
--data @-
```

Structure
([Querying basics](https://developers.cloudflare.com/analytics/graphql-api/getting-started/querying-basics/)):
`viewer` is "the root node"; `zones` or `accounts` "indicate the scope of the
query"; then the dataset node; then a fieldset.

**GraphQL reports failures in a 200 body.** `traffic.ts` already checks
`payload.errors` separately from `res.ok`; anything new must do the same.

### 5.2 Filters

Operators, verbatim
([Filtering](https://developers.cloudflare.com/analytics/graphql-api/features/filtering/)):

| Suffix | Meaning |
|---|---|
| `_gt` | greater than |
| `_lt` | less than |
| `_geq` | greater or equal to |
| `_leq` | less or equal to |
| `_neq` | not equal |
| `_in` | in |
| `_like` | supports `%` as wildcard |
| `_has` | array contains a value |
| `_hasall` | array contains all of a list of values |
| `_hasany` | array contains at least one of a list of values |

Bare `field: value` is equality. Multiple keys in one filter object are ANDed
implicitly; **`OR` must be given explicitly as an array**:

```graphql
httpRequestsAdaptiveGroups(
  filter: {
    datetime: "2018-01-01T10:00:00Z",
    OR:[{clientCountryName: "US"}, {clientCountryName: "GB"}]
  }
) { ... }
```

`notin` and `notlike` are **not documented**. Do not assume they exist — check
the filter input type (§4.1 step 3) before using one.

**Filter objects are per-dataset types.** `traffic.ts` records this the hard way:

> "Filters are inlined rather than passed as variables: the three sub-queries
> reuse one filter object and the adaptive-groups filter type is per-field-set,
> so a shared `$f` variable does not typecheck server-side."

Correct diagnosis, avoidable workaround: declare **one variable per sub-query**,
each typed to its own filter type, instead of string-substituting. String
substitution into a query is also the thing that makes a passthrough tool
dangerous to build carelessly (§8.4).

### 5.3 Sorting

`fieldName_DIRECTION`, `ASC` or `DESC`
([Sorting](https://developers.cloudflare.com/analytics/graphql-api/features/sorting/)).
Dimensions sort by bare name (`datetime_DESC`, `clientCountryName_ASC`);
aggregations sort by function-prefixed name (`count_DESC`,
`sum_edgeResponseBytes_DESC`). "Ordering within nested structures is not
supported." For aggregated data, "the default order […] is by the fields on
which the aggregated data is grouped. If you specify a different order, the
aggregation group is appended to your specified ordering."

### 5.4 Aggregation in `*Groups` datasets

A `*Groups` node returns one row per distinct combination of the fields inside
`dimensions`, with the aggregates computed over that group.

- `dimensions { … }` — the GROUP BY. Remove the time dimension to get a single
  total for the whole window
  ([zone-analytics migration](https://developers.cloudflare.com/analytics/graphql-api/migration-guides/zone-analytics/)).
- `count` — rows in the group. In adaptive datasets this is **already
  extrapolated** from the sample; do not multiply it again (§5.6).
- `sum { … }` — additive metrics. Maps sum element-wise:
  `sum { countryMap { clientCountryName requests } }` returns one entry per
  country ([Nested structures](https://developers.cloudflare.com/analytics/graphql-api/features/nested-structures/)).
- `avg { … }` — means. `avg { sampleInterval }` is the sampling tell (§5.6).
- `uniq { uniques }` — distinct count. **Not additive across rows.** `traffic.ts`
  gets this right and says so at length; keep saying so.
- `quantiles { … }` — percentiles, where the dataset offers them.
- `ratio { … }` — where offered.
- `confidence(level: …) { … }` — §5.6.

`limit` is required on most nodes and capped at `maxPageSize` (§4.2).

### 5.5 Worked examples for this site

All four are written to be pasted into `https://graphql.cloudflare.com/explorer`
after substituting the zone tag.

**A. Bot vs browser split over time — what `traffic.ts` does now, plus the parts
it skips.** Free plan, 180 days, unsampled.

```graphql
query BotSplit($zoneTag: string, $since: Date!, $until: Date!) {
  viewer {
    zones(filter: {zoneTag: $zoneTag}) {
      httpRequests1dGroups(limit: 200, filter: {date_geq: $since, date_leq: $until}, orderBy: [date_ASC]) {
        dimensions { date }
        uniq { uniques }
        sum {
          pageViews
          requests
          cachedRequests
          browserMap { uaBrowserFamily pageViews }
          ipClassMap { ipType requests }
          contentTypeMap { edgeResponseContentTypeName requests bytes }
          countryMap { clientCountryName requests }
        }
      }
    }
  }
}
```

`ipClassMap` and `contentTypeMap` are the additions. The first is a bot signal
Cloudflare computes itself; the second answers "what are the floods actually
fetching", which `traffic-anatomy.md` lists as loose end #1.

**B. Top paths and top user agents, 24 hours.** This is `loadAcquisition`
extended with the raw `userAgent` dimension — a strictly better bot split than
`browserMap`, because it shows the actual string rather than a family bucket.

```graphql
query DayDetail($zoneTag: string, $since: Time!, $until: Time!) {
  viewer {
    zones(filter: {zoneTag: $zoneTag}) {
      agents: httpRequestsAdaptiveGroups(
        limit: 50
        filter: {datetime_geq: $since, datetime_leq: $until, clientRequestHTTPHost: "grabient.com"}
        orderBy: [count_DESC]
      ) {
        count
        sum { edgeResponseBytes }
        avg { sampleInterval }
        dimensions { userAgent }
      }
      paths: httpRequestsAdaptiveGroups(
        limit: 60
        filter: {datetime_geq: $since, datetime_leq: $until, clientRequestHTTPHost: "grabient.com", edgeResponseStatus_geq: 200, edgeResponseStatus_lt: 400}
        orderBy: [count_DESC]
      ) {
        count
        sum { edgeResponseBytes }
        dimensions { clientRequestPath }
      }
    }
  }
}
```

**C. AI crawlers, 24 hours.** Adapted from Cloudflare's own example
([AI Crawl Control GraphQL API](https://developers.cloudflare.com/ai-crawl-control/reference/graphql-api/));
the `userAgent_like` route needs no Bot Management. This is how you reproduce the
~11k AI-crawler figure seen in the dashboard UI.

```graphql
query AiCrawlers($zoneTag: string, $since: Time!, $until: Time!) {
  viewer {
    zones(filter: {zoneTag: $zoneTag}) {
      httpRequestsAdaptiveGroups(
        limit: 200
        filter: {
          datetime_geq: $since
          datetime_leq: $until
          requestSource: "eyeball"
          OR: [
            {userAgent_like: "%GPTBot%"}
            {userAgent_like: "%ChatGPT-User%"}
            {userAgent_like: "%OAI-SearchBot%"}
            {userAgent_like: "%ClaudeBot%"}
            {userAgent_like: "%anthropic-ai%"}
            {userAgent_like: "%PerplexityBot%"}
            {userAgent_like: "%Google-Extended%"}
            {userAgent_like: "%Bytespider%"}
            {userAgent_like: "%Amazonbot%"}
            {userAgent_like: "%meta-externalagent%"}
          ]
        }
        orderBy: [count_DESC]
      ) {
        count
        sum { edgeResponseBytes }
        dimensions { userAgent clientRequestPath }
      }
    }
  }
}
```

**D. Firewall / rate-limit events, and what is firing.** Answers whether the one
free WAF rule is doing anything, and exposes the `source` values needed to settle
§1.5.

```graphql
query Firewall($zoneTag: string, $since: Time!, $until: Time!) {
  viewer {
    zones(filter: {zoneTag: $zoneTag}) {
      firewallEventsAdaptiveGroups(
        limit: 100
        filter: {datetime_geq: $since, datetime_leq: $until}
        orderBy: [count_DESC]
      ) {
        count
        dimensions { action source clientCountryName clientRequestPath }
      }
    }
  }
}
```

**E. Workers error rate and CPU, plus D1 and KV usage, in one account call.**
Account-scoped, so blocked on §4.3. Note the account limit is **1 account per
query**, but multiple nodes inside that one account selection are fine — this
costs 3 against the budget, not 1 (§5.7).

```graphql
query PlatformCost($accountTag: string!, $tStart: string, $tEnd: string, $dStart: Date, $dEnd: Date) {
  viewer {
    budget
    accounts(filter: {accountTag: $accountTag}) {
      workers: workersInvocationsAdaptive(
        limit: 1000
        filter: {datetime_geq: $tStart, datetime_leq: $tEnd}
      ) {
        sum { requests errors subrequests }
        quantiles { cpuTimeP50 cpuTimeP99 }
        dimensions { datetime scriptName status }
      }
      d1: d1AnalyticsAdaptiveGroups(
        limit: 10000
        filter: {date_geq: $dStart, date_leq: $dEnd}
        orderBy: [date_DESC]
      ) {
        sum { readQueries writeQueries rowsRead rowsWritten }
        quantiles { queryBatchTimeMsP90 }
        dimensions { date databaseId }
      }
      kv: kvOperationsAdaptiveGroups(
        limit: 10000
        filter: {date_geq: $dStart, date_leq: $dEnd}
        orderBy: [date_DESC]
      ) {
        sum { requests }
        dimensions { date actionType }
      }
    }
  }
}
```

Error rate is `sum.errors / sum.requests`, but the more diagnostic cut is
grouping by `status` and watching `exceededResources` — that is the Worker
hitting CPU or memory limits, which is the failure mode the resvg PNG renders
would produce under a flood. Watch the `Date` vs `string` split in the variables:
D1 and KV take `date_geq` (`YYYY-MM-DD`), Workers takes `datetime_geq`.

**F. Core Web Vitals.** See §3.4 — same account-scope caveat.



### 5.6 Sampling

> "Cloudflare GraphQL API exposes datasets that powered by adaptive sampling.
> These nodes have **Adaptive** in the name"
> — [Sampling](https://developers.cloudflare.com/analytics/graphql-api/sampling/)

So: `httpRequests1dGroups` is **not** sampled. Everything with `Adaptive` in the
name **is**, which includes every acquisition, RUM, Workers and D1 number.

How the sampling is chosen — this is why two identical queries can disagree:

> "ABR dynamically selects data resolution based on: query complexity and
> filters, time range requested, number of rows to retrieve, current system
> load. The system stores data at multiple resolution levels: 100% (full data),
> 10% sample, and 1% sample."
> — [GraphQL API inconsistent results](https://developers.cloudflare.com/analytics/faq/graphql-api-inconsistent-results/)

**Do not multiply `count` by `sampleInterval`.** Cloudflare extrapolates for you:
"Aggregated metrics (totals, averages, percentiles) are extrapolated based on the
sample size, so reported metrics accurately represent the entire dataset"
(same page). `sampleInterval` is a *diagnostic*: 1.0 means unsampled, 10 means
one row in ten was read. Always select `avg { sampleInterval }` alongside
anything you intend to present as a number.

The rigorous version is `confidence`, supported on "all `sum` and `count` fields"
in "Adaptive (sampled) datasets only"
([Confidence intervals](https://developers.cloudflare.com/analytics/graphql-api/features/confidence-intervals/)):

```graphql
query SingleDatasetWithConfidence($zoneTag: string, $start: Time, $end: Time) {
  viewer {
    zones(filter: {zoneTag: $zoneTag}) {
      firewallEventsAdaptiveGroups(
        filter: {datetime_gt: $start, datetime_lt: $end}
        limit: 1000
      ) {
        count
        avg {
          sampleInterval
        }
        confidence(level: 0.95) {
          count {
            estimate
            lower
            upper
            sampleSize
          }
        }
      }
    }
  }
}
```

```json
{
  "data": { "viewer": { "zones": [ { "firewallEventsAdaptiveGroups": [ {
    "avg": { "sampleInterval": 1.0720277625205972 },
    "confidence": { "count": {
      "estimate": 42939, "lower": 42673.44115335711,
      "sampleSize": 40054, "upper": 43204.55884664289 } },
    "count": 42939
  } ] } ] } },
  "errors": null
}
```

Cloudflare's own mitigations, verbatim from the FAQ: query shorter timeframes;
prefer `Groups` nodes over raw adaptive nodes; request confidence intervals;
always include `orderBy` for stable ordering. All four are cheap and all four
should be baked into the MCP tools rather than left to the caller.

### 5.7 Rate limits and quotas

Verbatim from [Limits](https://developers.cloudflare.com/analytics/graphql-api/limits/):

- **"300 GraphQL queries over 5-minute window"** — the default user quota. "Users
  may submit 300 queries then wait 5 minutes", and at minimum one query per
  second is allowed. These are "in addition to general Cloudflare API rate
  limits".
- Up to **10 zones** per query; **only 1 account** per query.
- "Total queries per request = (number of zone/account scopes) × (number of nodes
  applied)" — i.e. aliasing five sub-queries into one HTTP request still costs
  five against the quota. The three-alias `ACQ_QUERY` in `traffic.ts` counts as
  three, not one.
- Per-node: lookback window, max time period, max fields, max records — all
  readable via §4.2.

**Check the remaining allowance with `{ viewer { budget } }`.** One field, no
arguments, returns what is left. An agent driving this API can and will burn 300
queries in a minute; a tool that reports its own budget is a tool that can back
off instead of failing.

300 per 5 minutes is generous for a dashboard and tight for an agent in a loop.
The 5-minute memoization in `traffic.ts` is the right pattern; any MCP tool must
inherit it (§8.5).

---

## 6. Gotchas

**The 1-day adaptive cap — and the 7-day retention behind it.**
`httpRequestsAdaptiveGroups` rejects a range wider than 1d on this plan, and
retains only 7 days (§1 table). Those are two different limits and confusing them
produces two different bugs:

- **The window is 24 hours, so no trend comes out of a single query.**
  `traffic.ts` already says so; anything new must say so in the same breath as
  the number.
- **Retention is 7 days, so a 7-day picture IS reachable** — seven separate
  24-hour queries, stitched, for 7 of the 300-per-5-minutes budget. That is a
  legitimate answer to the cap, and it is what `loadAcquisition` should do
  instead of shipping a 24-hour snapshot with a caveat.
- **Do not extend that trick to 30 days.** Retention forbids it: days 8–30 do not
  exist in this dataset at any budget. Use `httpRequests1dGroups`, which gives
  the long series unsampled in one call (§5.5 example A).
- Check `httpRequestsOverviewAdaptiveGroups`'s `maxDuration` first (§1.3) — if it
  is wider, that is the free fix, though it is undocumented enough not to build
  on.
- **Firewall events are worse: 24-hour *retention*, not just window.** Unqueried,
  they are gone. If firewall data matters, it must be polled and persisted
  (§1.4), which is a different kind of design decision from everything else here.

**Sampling.** Adaptive datasets are sampled and extrapolated; `count` is already
corrected, `sampleInterval` tells you how hard. Two identical queries can return
different numbers and neither is wrong. Never present an adaptive number and an
unsampled number side by side without saying which is which — the dashboard
currently mixes 180-day `httpRequests1dGroups` totals with 1-day adaptive
breakdowns, and only the caveat text distinguishes them.

**The UA heuristic undercounts spoofers, and now there is a better option.**
`BOT_PATTERN` in `traffic.ts` classifies `browserMap`'s `uaBrowserFamily`, which
is a *parsed family* — a scraper sending a verbatim Chrome UA is parsed as
Chrome and counted as a person. The doc comment says this correctly. What is now
available: the **raw `userAgent` dimension on all plans** (§1.2). It does not
defeat a perfect spoof either, but it distinguishes `Chrome/119` from
`Chrome/91.0.4472.124` repeated 200,000 times from 12 ASNs, which the family
bucket cannot. Use it for forensics on a specific day; keep `browserMap` for the
long series. Also select `ipClassMap` (§1.1) — that is Cloudflare's own client
classification, free, and it is a second independent signal.

Real bot scoring stays unavailable: `botScore` / `botScoreSrcName` need Bot
Management, and `botDetectionIds_hasany` is gated the same way
([AI Crawl Control GraphQL API](https://developers.cloudflare.com/ai-crawl-control/reference/graphql-api/)).

**Timezone.** Everything is **UTC**. `Time` values are ISO 8601 with `Z`
("2018-01-01T10:00:00Z"); `Date` values are `YYYY-MM-DD`
([Filtering](https://developers.cloudflare.com/analytics/graphql-api/features/filtering/)).
The Cloudflare *dashboard* renders in the browser's local timezone, so dashboard
and API will disagree at the edges of a day — that is not a bug, and it is the
likely explanation for any "the API says 4,300 but the dashboard says 4,600"
report. `traffic.ts` uses `toISOString()` and `setUTCDate`, which is correct;
keep it. Any MCP tool that accepts a `days` integer must resolve it in UTC and
**echo the resolved window back in its response** so the model can cite it.

**Two `date` types.** `httpRequests1dGroups` filters on `date_geq` / `date_leq`
with `YYYY-MM-DD`; adaptive datasets filter on `datetime_geq` / `datetime_leq`
with full ISO timestamps. Mixing them produces a type error, not a wrong answer,
so it fails loudly — but it is the most common first mistake.

**Zone plan ≠ Workers plan.** The zone is Free; the account is Workers Paid.
Every zone dataset limit in §1 comes from the *zone* plan, and every account
dataset in §2 comes from the *Workers* plan. They are unrelated gates and it is
easy to quote one when you mean the other.

**Aliases cost quota.** See §5.7.

**`errors` in a 200.** See §5.1.

---

## 7. Bots and AI crawlers without Bot Management

### 7.1 What we do and do not get

| Signal | Available on Free? | Notes |
|---|---|---|
| `userAgent` (raw string) dimension on `httpRequestsAdaptiveGroups` | **Yes** | Used in Cloudflare's own all-plans examples. Our best lever. |
| `userAgent_like` filter | **Yes** | Same source. |
| `browserMap { uaBrowserFamily pageViews }` on `httpRequests1dGroups` | **Yes** (in production use) | Parsed family, 180 days, unsampled. Undocumented as a field; the only doc is the `httpRequests1mGroups` example. |
| `ipClassMap { ipType requests }` on `httpRequests1dGroups` | **Yes** | Cloudflare's own client classification. Not currently read. |
| `source: "botfight"` in `firewallEventsAdaptiveGroups` | **Yes**, if Bot Fight Mode is on | Bot Fight Mode is the Free bot product ([Bots on Free](https://developers.cloudflare.com/bots/plans/free/)). 24h retention. |
| `botScore` / `botScoreSrcName` | **No** | Bot Management. Already confirmed empirically — the API returns a permission error. |
| `botDetectionIds` | **No** | Marked "Bot Management" in the AI Crawl Control filter table. |
| `verifiedBotCategory` | **No, and not a GraphQL dimension at all** | It exists only as the ruleset field `cf.verified_bot_category` and `request.cf.verifiedBotCategory` in Workers, which is "Only set when using Cloudflare Bot Management" ([bot variables](https://developers.cloudflare.com/bots/reference/bot-management-variables/)). Do not design around it. |
| `bot` (0/1) dimension on RUM datasets | **Yes**, if RUM GraphQL is entitled | Account-scoped. See §3.2. |

The practical upshot: we have **four** independent free bot signals —
`uaBrowserFamily` (180 days), raw `userAgent` (24 h), `ipClassMap` (180 days),
and RUM's `bot` flag (browser-side) — and `traffic.ts` currently uses one. Any
two of them agreeing is a much stronger claim than the current heuristic, and
disagreement is itself diagnostic (a client that is `Chrome` by family, on a
residential-proxy `ipType`, at 200k requests/day, is a spoofer).

### 7.2 AI Crawl Control — the 11k figure is reproducible

There is **no dedicated AI GraphQL dataset** — no `aiCrawlControl`, `aiAudit` or
`aiBots` node exists. Cloudflare instead publishes an official page telling you
to query `httpRequestsAdaptiveGroups`:

> "AI Crawl Control analytics are available through Cloudflare's GraphQL
> Analytics API."
> — [AI Crawl Control GraphQL API](https://developers.cloudflare.com/ai-crawl-control/reference/graphql-api/)

The product itself is "Available on all plans"
([AI Crawl Control](https://developers.cloudflare.com/ai-crawl-control/)), and on
Free the dashboard Metrics tab shows only the past 24 hours
([Get started](https://developers.cloudflare.com/ai-crawl-control/get-started/))
— which matches the dataset's 24-hour window, and means the 11k figure seen in
the UI is a 24-hour number, not a total. §5.5 example C reproduces it.

Cloudflare publishes the crawler user-agent list to match against — 20 crawlers
with operator and category
([AI crawlers reference](https://developers.cloudflare.com/ai-crawl-control/reference/bots/)),
including `GPTBot`, `ChatGPT-User`, `OAI-SearchBot`, `ClaudeBot`,
`Claude-SearchBot`, `Claude-User`, `PerplexityBot`, `Perplexity-User`,
`Bytespider`, `CCBot`, `meta-externalagent`, `Applebot`, `Amazonbot`,
`DuckAssistBot`, `MistralAI-User`, `Google-CloudVertexBot`. **Read the list from
that page rather than hardcoding ours** — it is maintained, and a hardcoded copy
silently rots.

Two things Free does **not** get:

- **AI referral traffic.** `clientRefererHost_like` is Paid-only, so we cannot
  ask "how many visitors arrived from chatgpt.com" through the zone dataset.
  The RUM dataset's `refererHost` is the workaround (account-scoped, browser
  beacon, bot-filtered) — and this is the direct answer to the AI-visibility
  question in `seo-research/ai-visibility.md`. It is one of the strongest
  arguments for fixing the token scope in §4.3.
- **Verified detection.** UA matching is spoofable and Cloudflare says so in the
  filter table itself ("can be spoofed"). A crawler claiming to be GPTBot may not
  be; a scraper not claiming to be anything will not appear. Report these as
  "requests self-identifying as AI crawlers", never as "AI crawler traffic".

The AI Crawl Control **REST** API is not an alternative: it exposes only two
endpoints, both robots.txt parsing (`GET /zones/{zone_id}/ai-audit/robots`,
`POST /zones/{zone_id}/ai-audit/robots/bulk`). No metrics, no allow/block
actions.

### 7.3 A documentation claim that is wrong for us

Cloudflare's Prometheus-integration page carries a "Free tier zone limitations"
statement to the effect that Free-plan zones do not have access to the GraphQL
Analytics API. **That is false for us as stated** — `traffic.ts` has been
querying `httpRequests1dGroups` and `httpRequestsAdaptiveGroups` on this Free
zone in production. It presumably refers to a narrower product surface. Do not
let it talk you out of a query; the authority on entitlement is §4.2, not prose.

---

## 8. Proposed MCP tools

### 8.1 First, the option that costs nothing: use Cloudflare's server

Before writing anything, connect one of Cloudflare's own servers in a dev
session and spend an afternoon:

- `https://graphql.mcp.cloudflare.com/mcp` — `graphql_schema_search`,
  `graphql_schema_overview`, `graphql_type_details`, `graphql_complete_schema`,
  `graphql_query`, `graphql_api_explorer`
  ([apps/graphql](https://github.com/cloudflare/mcp-server-cloudflare/tree/main/apps/graphql)).
- `https://mcp.cloudflare.com/mcp` — the unified successor, three tools (`docs`,
  `search`, `execute`) in a Code Mode pattern that "automatically detects and
  handles Cloudflare's GraphQL Analytics API endpoints"
  ([cloudflare/mcp](https://github.com/cloudflare/mcp)).

This answers every UNVERIFIED item in this document in one sitting, and it tells
you which tools you actually reach for before you build any.

**But do not wire either into `admin.grabient.com`.** They authenticate as *you*
against the whole Cloudflare account with OAuth, which is far broader than our
read-only `CF_ANALYTICS_TOKEN` — the unified server covers ~2,500 API endpoints
including writes. `seo-research/mcp-design.md` records the owner decision that
the analytics server is internal-only and totally isolated; adopting an
account-wide write-capable server would quietly undo that. Exploration tool, not
production dependency.

### 8.2 The core argument: one passthrough or many narrow tools?

**Recommendation: both, with a clear division of labour — narrow tools carry the
interpretation, the passthrough carries the long tail.** The reasoning matters
more than the conclusion, because the usual security framing is the wrong one
here.

**The security objection to a passthrough is weak, and should be dropped.**

- The Cloudflare Analytics GraphQL schema has **no mutations**. There is no write
  to reach.
- The token is scoped Zone → Analytics → Read. Even a maximally hostile query
  cannot exceed it.
- The caller is already authenticated by Cloudflare Access and allow-listed by
  `ADMIN_EMAILS` before a tool runs. They could open
  `https://graphql.cloudflare.com/explorer` and run the same query by hand.
- Cloudflare shipped exactly this shape themselves (§8.1), then went *further* by
  consolidating to a general `execute`.

So "a passthrough is dangerous" is not true in the way it is usually meant. The
two objections that **are** real:

**(1) Misinterpretation, which is this project's documented failure mode.**
`seo-research/data/traffic-anatomy.md` exists because a number was read without
its denominator: 59,818 "browser pageviews/day" is in `brief-2026-08-16.json`,
and roughly 4–6K of them are people. The value in `traffic.ts` is not the query —
it is the 60 lines of comment explaining that `pageViews` includes bots, that
`uniques` must never be summed across days, and that the split is a floor rather
than a measurement. A bare passthrough returns the number and discards all of
that, and a model will confidently report the wrong figure. **Tool descriptions
are where caveats live, and a passthrough has one description for every possible
query.**

**(2) Third-party PII.** `firewallEventsAdaptive` returns `clientIP`.
`d1QueriesAdaptiveGroups` returns query strings. RUM returns `refererPath`, which
can carry query parameters. These identify *visitors*, not the admin — so
"the admin could see it anyway" does not fully answer it; piping it into a
third-party model context is a different disclosure, and `mcp-design.md` R4
already commits to "aggregate, not select".

**Neither objection is fixed by refusing the passthrough** — it is fixed by
guarding it, and the guards are cheap:

- **A field denylist**, checked by substring against the query text before
  sending: `clientIP`, `d1QueriesAdaptiveGroups`, `refererPath`. Crude, and
  crude is correct here — it is a belt on top of a caller who is already trusted,
  not the primary control.
- **A hard `limit` ceiling** and a rejection of queries with no `datetime`/`date`
  filter, so a stray query cannot cost the whole budget.
- **A mandatory `caveats` array in every response**, derived by matching the
  dataset names present in the query. If the query names `httpRequests1dGroups`,
  attach the pageViews/uniques caveats. If it names anything `Adaptive`, attach
  the sampling caveat. This is ~40 lines and it is the single highest-leverage
  thing in this whole design: it makes the passthrough carry interpretation
  the same way a narrow tool does.
- **`viewer { budget }` echoed back**, so the model can self-throttle.

The remaining case for narrow tools is that **the model has to know a question is
worth asking.** A passthrough answers questions; a named tool with a good
description *suggests* them. `web_vitals` in the tool list is a prompt to check
Core Web Vitals; a passthrough is not. So keep narrow tools where the question is
one we want asked routinely, and let the passthrough cover the rest.

### 8.3 The tools

Priority order. "Exists" means already registered in `apps/admin/src/mcp.ts`.

---

**P0-1 · `cloudflare_datasets` — NEW. Build this first.**

> **Description (agent-facing):** "What Cloudflare analytics data this site can
> actually query, right now: every dataset, whether it is enabled for our plan,
> how far back it retains data, the widest time range one query may ask for, and
> the row cap. Call this BEFORE `cloudflare_graphql` when you are unsure whether
> something is available — the answer changes with the plan and is not the same
> as what Cloudflare's public docs describe. Also reports the remaining GraphQL
> query budget."

```ts
inputSchema: {
  scope: z.enum(["zone", "account", "both"]).default("both").optional(),
}
```

Return shape:

```jsonc
{
  "budget": 287,
  "zone":    { "httpRequests1dGroups": { "enabled": true, "retentionDays": 365,
                                          "maxRangeHours": 8760, "maxRows": 10000,
                                          "availableFields": ["sum_pageViews", "..."] },
               "httpRequestsAdaptiveGroups": { "enabled": true, "retentionDays": 7,
                                          "maxRangeHours": 24, "...": "..." } },
  "account": { "...": "..." },
  "notes":   ["account scope unreachable: token lacks Account Analytics: Read"]
}
```

Implementation: §4.2 plus §4.3, converting `notOlderThan` / `maxDuration` from
seconds into days/hours so the model does not have to. Cache for an hour —
entitlements change on plan changes, not on the minute.

This is the tool that makes every other tool honest, and it is the reason to
prefer a self-describing server over a hardcoded list. It is also the cheapest
thing here: two queries and some arithmetic.

---

**P0-2 · `cloudflare_graphql` — NEW. The passthrough.**

> **Description (agent-facing):** "Run an arbitrary read-only query against
> Cloudflare's GraphQL Analytics API for grabient.com, for anything the other
> tools do not cover. Read-only; there are no mutations in this API. Use
> `cloudflare_datasets` first to check a dataset is enabled and what time range
> it allows, and `cloudflare_schema` to look up field names — guessing field
> names wastes the shared 300-queries-per-5-minutes budget. Zone datasets go
> under `viewer.zones`, account datasets under `viewer.accounts`. Every response
> includes a `caveats` array; read it before quoting any number."

```ts
inputSchema: {
  query: z.string().min(20).max(8000),
  variables: z.record(z.unknown()).optional(),
}
```

Server-side behaviour, in order:

1. Substring-denylist check (§8.2). Reject with an explanation, not a generic
   error.
2. Inject `$zoneTag` / `$accountTag` from env if the query declares them and the
   caller did not supply them — the model should never need to know the IDs, and
   they should not appear in a transcript.
3. Reject if no `date`/`datetime` filter is present.
4. Execute; surface `payload.errors` verbatim (they are specific and the model
   can act on them — "cannot request a time range wider than 1d" is a usable
   instruction).
5. Attach `caveats` derived from the dataset names in the query, plus `budget`.

Return: `{ data, errors, caveats: string[], budget: number }`.

---

**P0-3 · `cloudflare_schema` — NEW.**

> **Description (agent-facing):** "Look up the exact dimensions, metrics and
> filter operators of one Cloudflare analytics dataset. Cloudflare does not
> document most of these fields anywhere, so this is the authoritative source.
> Returns groupable dimensions, aggregate fields (sum/avg/quantiles/count) and
> every filter key including operator suffixes such as `_geq`, `_like`,
> `_hasany`."

```ts
inputSchema: { dataset: z.string().min(3).max(80) }
```

Implementation: §4.1 steps 2–3, resolving the element and filter type names from
`Zone`/`Account` rather than constructing them. Return a compact grouped
structure, not raw introspection JSON — the full `__schema` response is
megabytes and would blow the context window.

Cache aggressively; the schema changes on Cloudflare's release schedule.

---

**P1-4 · `web_vitals` — NEW. The highest-value narrow tool.**

> **Description (agent-facing):** "Field-measured Core Web Vitals for
> grabient.com from real browsers — LCP, INP and CLS at the 75th percentile, the
> ones Google ranks on — optionally broken out by page path and device, plus the
> Good/Needs-improvement/Poor split and the specific page elements responsible.
> This is FIELD data from actual visitors, not a Lighthouse lab score, and it is
> bot-filtered. Rows resting on very few samples are suppressed rather than shown
> as noise. Data begins 2026-08-15, when the beacon was enabled."

```ts
inputSchema: {
  days: z.number().int().min(1).max(180).default(7).optional(),
  breakdown: z.enum(["site", "path", "device", "path_device", "element"]).default("site").optional(),
  minSamples: z.number().int().min(1).max(1000).default(50).optional(),
}
```

Return: `{ window: {since, until, days}, rows: [{ path?, device?, samples,
lcpP75Ms, inpP75Ms, cls, fcpP75Ms, ttfbP75Ms, lcpGoodPct, inpGoodPct, clsGoodPct
}], suppressedRows, sampleInterval, caveats }`.

Implementation: §3.4, with the three corrections in the data layer —
microseconds→ms, drop negatives, never scale quantiles. Suppress rows below
`minSamples`; report how many were suppressed rather than silently dropping them.

Blocked on §4.3 (token scope) and on the RUM beta entitlement in §3.3.

---

**P1-5 · `platform_cost` — NEW.**

> **Description (agent-facing):** "What the traffic is costing on Cloudflare's
> platform: Worker invocations, errors by failure mode and CPU-time percentiles;
> D1 rows read and written; KV operations by type; R2 operations and stored
> bytes. Use this to tell an expensive traffic pattern from a harmless one.
> Vectorize and Workers AI usage are NOT included — Cloudflare exposes no
> GraphQL dataset for either, so their cost is invisible here."

```ts
inputSchema: { days: z.number().int().min(1).max(31).default(7).optional() }
```

Return: `{ window, workers: [{ date, scriptName, requests, errors, errorRatePct,
byStatus, cpuTimeP50Ms, cpuTimeP99Ms }], d1: [{ date, rowsRead, rowsWritten,
readQueries, writeQueries, p90Ms }], kv: [...], r2: [...], unavailable:
["vectorize", "workers_ai"], caveats }`.

Note the retention asymmetry: D1/KV/R2 are 31 days, Workers is three months but
in ≤1-week (or ≤1-month) increments. Cap `days` at 31 so one call is always
answerable, and say so rather than silently truncating.

Answers loose end #2 in `traffic-anatomy.md` — except for the Vectorize half,
which is why the `unavailable` key is in the return shape rather than omitted.

---

**P1-6 · `bot_forensics` — NEW.**

> **Description (agent-facing):** "Pull apart one 24-hour window of traffic to
> separate real visitors from automation: request counts and bytes by raw
> user-agent string, by Cloudflare's own IP classification, and by firewall
> action. Use this when a traffic number looks implausible. Cloudflare's real bot
> score needs the Bot Management add-on, which this plan does not have — these
> are independent heuristics, and they are strongest where they agree. A scraper
> sending a genuine-looking Chrome user agent will still be counted as a browser."

```ts
inputSchema: {
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),  // defaults to last 24h
  limit: z.number().int().min(5).max(200).default(40).optional(),
}
```

Return: `{ window, byUserAgent: [{ userAgent, requests, bytes, sharePct }],
byIpClass: [{ ipType, requests }], firewall: [{ action, source, requests }],
aiCrawlers: [{ userAgent, requests, topPaths }], sampleInterval, caveats }`.

Retention constrains `day` to the last 7 days for the HTTP half and the last
**24 hours** for the firewall half — return the firewall block as `null` with a
reason when the window is older, rather than an empty array that reads as "no
attacks".

---

**P2-7 · `ai_crawlers` — NEW, or fold into `bot_forensics`.**

> **Description (agent-facing):** "How much of grabient.com's traffic comes from
> AI crawlers, which ones, and what they are fetching, over the last 24 hours.
> Matches on self-declared user agent, which can be spoofed and which misses
> crawlers that do not identify themselves — report these as 'requests
> self-identifying as AI crawlers'. AI *referral* traffic (visitors arriving from
> chatgpt.com and similar) is not available on this plan through this dataset;
> use the referrer data from the browser beacon instead."

Only worth a separate tool if AI-crawler volume becomes a standing question for
`seo-research/ai-visibility.md`. Otherwise it is three lines inside
`bot_forensics`.

---

**P2-8 · Extend the existing `traffic` tool — NOT a new tool.**

`loadTraffic` already fetches `httpRequests1dGroups` over 180 days and reads
three fields from it. Adding `countryMap`, `contentTypeMap`, `ipClassMap`,
`cachedRequests` and `responseStatusMap` to the same query (§5.5 example A) costs
**zero extra API calls** and produces:

- a **180-day** country series, replacing the 24-hour snapshot the `acquisition`
  tool has to caveat;
- content-type mix, which is loose end #1 in `traffic-anatomy.md`;
- cache hit ratio and an error-rate series, neither of which exists today.

This is the best effort-to-value ratio in the document and it is an edit to one
existing query. Do it before building any new tool.

---

**Explicitly not proposed:** a `firewall_events` tool that returns `clientIP`
rows; anything wrapping `d1QueriesAdaptiveGroups` (query strings); a
`healthCheckEvents` tool (§1.6 — not available on Free at any price); a
`vectorize_usage` tool (§2.5 — no dataset exists).

### 8.4 Safety rules that apply to all of the above

Inherited from `seo-research/mcp-design.md` R4 and R10, restated because they
bind here specifically:

1. **Aggregate, never select.** No tool returns `clientIP`, a raw referer path
   with query parameters, or a D1 query string.
2. **Suppress small buckets.** A row of count 1 in a country breakdown is close
   to identifying. `web_vitals` already has `minSamples`; apply the same idea
   wherever a dimension is high-cardinality.
3. **Untrusted text in, structured JSON out.** `userAgent` is attacker-controlled
   and lands straight in a model's context. Return it as data inside a JSON
   field, never interpolated into prose.
4. **Never report a configuration failure as an empty result.** `mcp.ts` already
   has `unavailable()` for this, with the right wording. Every new tool uses it.
   This matters most for account-scoped tools, where "token lacks scope", "RUM
   not entitled" and "no data yet" are three different answers that all look like
   zero — and where getting it wrong is exactly what produced the ambiguous
   `"traffic_sources": null`.

### 8.5 Caching and budget

`traffic.ts` memoizes per isolate for 5 minutes. Keep that, and extend it:

- `cloudflare_datasets` and `cloudflare_schema`: cache for an hour or more.
- Narrow data tools: 5 minutes, as now.
- `cloudflare_graphql`: do not cache (arbitrary queries), but **do** count. If
  `viewer { budget }` falls below ~50, refuse further passthrough calls with a
  message telling the model to wait — an agent that discovers the budget by
  exhausting it will also break the dashboard for a human.

Remember aliasing does not save budget (§5.7): the three-alias `ACQ_QUERY` costs
three. Batching into one HTTP request saves latency, not quota.

---

---

## 9. UNVERIFIED — and how to settle each one

I do not have `CF_ANALYTICS_TOKEN` (deployed secret) and did not attempt to read
it. The repo contains no general Cloudflare API token: `packages/data-ops/.env`
holds only `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID` and
`CLOUDFLARE_D1_TOKEN`, and the last is D1-scoped (it returns HTTP 400 against the
zones endpoint). So **nothing below was tested empirically.**

Ordered by how much they block.

1. **Does `CF_ANALYTICS_TOKEN` have account scope?** Blocks §2 and §3 entirely —
   Workers, D1, KV, R2, RUM and Core Web Vitals. There is live evidence it does
   not: `"traffic_sources": null` in `brief-2026-08-16.json`.
   *Settle by:* §4.3, one curl. If it fails, add **Account → Account Analytics →
   Read** to the token in the dashboard and redeploy nothing — it is a token
   edit, not a code change.

2. **Real `maxDuration` / `notOlderThan` / `enabled` / `availableFields` for our
   zone.** Everything in §0.5's "unverified" column.
   *Settle by:* §4.2, one curl. **Do this before writing any tool.**

3. **Are the RUM GraphQL nodes entitled on this plan?** All four are marked
   `Beta.`, and Cloudflare warns beta nodes are "typically available to customers
   on extensive plans". Blocks `web_vitals`, the highest-value SEO tool here.
   *Settle by:* the account `settings` query in §4.2 — `enabled` is definitive
   and distinguishes "not entitled" from "no data yet".

4. **Does `availableFields` exist on the settings node?** It is described in
   Cloudflare's own settings material but is absent from the documented example
   response I could retrieve. It is the cheapest answer to items 5 and 6.
   *Settle by:* include it in the §4.2 query; if rejected, fall back to §4.1.

5. **Is `cacheStatus` available to us on `httpRequestsAdaptiveGroups`?** The
   dashboard's Cache Analytics is Pro+, but the dataset is all-plans, so the
   answer is genuinely uncertain and the payoff (cache hit ratio by path) is
   high. *Settle by:* item 4, or just run the query.

6. **Are `clientRequestPath`, `clientRequestHTTPHost` and `datetime` groupable
   `dimensions` on `firewallEventsAdaptiveGroups`?** They are documented as raw
   fields on `firewallEventsAdaptive`; nothing confirms them under `dimensions`.
   *Settle by:* item 4, or §4.1 step 3.

7. **Retention of `httpRequests1dGroups`.** Secondary sources say 365 days;
   `traffic.ts` assumes ~200 and asks for 180, which works. Matters if anyone
   wants a two-year chart. *Settle by:* `notOlderThan` in §4.2.

8. **Whether `firewallEventsAdaptiveGroups` inherits the raw node's 24-hour
   retention.** The published table names only `firewallEventsAdaptive`. If the
   Groups variant retains longer, the "poll or lose it" conclusion in §1.4
   softens considerably. *Settle by:* §4.2.

9. **Does `httpRequestsOverviewAdaptiveGroups` exist for us, and does it have a
   wider `maxDuration`?** If yes, it is the free fix for the 24-hour cap. It is
   undocumented, so even a yes should not be built on. *Settle by:* §4.2.

10. **Every RUM field name in §3.** Cloudflare publishes no per-field RUM
    documentation; those lists come from a third-party introspection mirror.
    *Settle by:* §4.1 step 3 against `AccountRumWebVitalsEventsAdaptiveGroups`
    (name itself unverified — read it out of step 2).

11. **Undocumented `workersInvocationsAdaptive` fields** — `duration`,
    `wallTime`, `responseBodySize`, memory quantiles. The dashboard shows them,
    so they probably exist. *Settle by:* §4.1 step 3.

12. **What `requestSource: "eyeball"` excludes for us.** Cloudflare uses it in
    every published example; none of our queries do. It may change the top-paths
    list materially. *Settle by:* run §5.5 example B with and without it and
    diff the totals.

13. **Whether Bot Fight Mode is enabled on this zone.** Determines whether
    `source: "botfight"` is a usable free bot signal. *Settle by:* the dashboard,
    or run §5.5 example D and look for the value.

14. **Zaraz dataset availability.** Would let us verify the GA4 beacon is firing
    without going to Google — relevant to the analytics-visibility gotcha already
    in the project memory. *Settle by:* §4.2 with the four `zaraz*` nodes named.

15. **Whether an account-scoped `settings` node exists.** The documented example
    is zone-only. If it does not, account entitlements must be probed by running
    real queries and reading the errors. *Settle by:* the query at the end of
    §4.2.

16. **`d1QueriesAdaptiveGroups` contents.** Documented as capturing query strings
    with bound parameters excluded. If the strings themselves can carry
    user-supplied text, it belongs on the §8.4 denylist permanently rather than
    provisionally. *Settle by:* running it once and looking.

