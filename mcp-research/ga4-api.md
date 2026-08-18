# GA4 API surface, and what the grabient analytics MCP should expose

Research doc. Written 2026-08-16. Every claim marked **[probed]** was verified by
calling the live API against grabient's own property with our own service
account on that date; everything else carries a docs URL.

Companion docs: `seo-research/mcp-design.md` (the MCP server design), the
existing implementation in `apps/admin/src/ga4.ts` and `apps/admin/src/mcp.ts`.

---

## 0. What we actually have — verified, not assumed

| Thing | Status | Evidence |
|---|---|---|
| Service account | `grabient-gsc-reader@grabient.iam.gserviceaccount.com` | mints tokens fine **[probed]** |
| Property | `properties/371413172`, timezone `America/Los_Angeles`, currency `USD` | `metadata` in every response **[probed]** |
| Role | Viewer — enough for all Data API reads | every report returned 200 **[probed]** |
| Scope in use | `https://www.googleapis.com/auth/analytics.readonly` | `apps/admin/src/google-auth.ts` |
| **Analytics Data API** | **ENABLED** | `runReport`, `runPivotReport`, `batchRunReports`, `runRealtimeReport`, `getMetadata`, `checkCompatibility`, `audienceExports.list`, and v1alpha `getPropertyQuotasSnapshot` + `runFunnelReport` all answered **[probed]** |
| **Analytics Admin API** | **DISABLED** | `403 SERVICE_DISABLED` on `analyticsadmin.googleapis.com` for project `453530220316` **[probed]** — see §7 |
| **Search Console link** | **NOT ACTIVE for the API** | `400 "Search Console fields require an active link to be used."` **[probed]** — see §8. The owner clicked "Link Search Console"; the API disagrees. |
| Property schema | **377 dimensions, 89 metrics** **[probed]** | `getMetadata` on `properties/371413172` |
| Custom dimensions registered | `customEvent:event_category`, `customEvent:event_label` — **both 100% `(not set)`** **[probed]** | nothing sends those params; two slots wasted |
| Custom metrics registered | none **[probed]** | |
| Key events | every custom event is one: `paginate`, `search_query`, `copy_colors`, `change_modifier`, `view_gradient`, `copy_css`, `change_style`, `download_png`, … **[probed]** | `keyEvents == eventCount` for all of them |

Reference numbers pulled live for the 28 days ending 2026-08-15 **[probed]**, so
future readers can tell drift from bug:

```
sessions 13,429 · activeUsers 9,819 · screenPageViews 143,800 · 37 distinct eventNames
sessionDefaultChannelGroup: Direct 7,156 · Organic Search 5,382 · Referral 738 · AI Assistant 204
sessionSourceMedium (97 rows): (direct)/(none) 7,156 · google/organic 5,045 · bing/organic 237
                               cssgradient.io/referral 219 · chatgpt.com/ai-assistant 163
deviceCategory: desktop 12,563 · mobile 922 · tablet 33
pagePath: 15,715 distinct · pagePathPlusQueryString: 26,086 distinct · no (other) row
top pages by views: / 56,286 · /newest 3,628 · /palettes/blue 2,088 · /palettes/teal%2C-azure%2C-navy 1,376
```

---

## 1. Data API method table

Base: `https://analyticsdata.googleapis.com`. Reference index:
<https://developers.google.com/analytics/devguides/reporting/data/v1/rest>

v1beta has **exactly seven** `properties` methods plus `audienceExports`.
v1alpha has **exactly four** `properties` methods plus `audienceLists`,
`recurringAudienceLists`, `reportTasks`.

| Method | Ver | What it is for | Prefer it over `runReport` when… | Quirks that bite |
|---|---|---|---|---|
| `properties:runReport` | v1beta | The workhorse. Flat rows × columns report. | — (baseline) | ≤9 dimensions, ≤10 metrics, ≤4 date ranges. `limit` defaults to **10,000**, caps at **250,000**. A cohort request must omit `dateRanges`. `metricFilter` is `HAVING` (post-aggregation), `dimensionFilter` is `WHERE`. |
| `properties:runPivotReport` | v1beta | Cross-tab: pivot dimensions into column groups. | You want a genuine grid *and* the cardinality of the pivot dimension without paging (`pivotHeaders[].rowCount`). | **Different response envelope**: `aggregates` replaces `totals`/`maximums`/`minimums`, adds `pivotHeaders`, and there is **no top-level `rowCount`**. `limit` is **required per pivot**; the product of all pivot limits must be ≤250,000. Two pivots may not share a dimension. **[probed]** shape confirmed. |
| `properties:batchRunReports` | v1beta | Up to **5** independent reports in one round trip, same property. | An agent needs several unrelated cuts at once (totals + channels + top pages + trend) — one auth, one HTTP, one latency. | Max 5. Nested `property` must be unspecified or match. Response key is `reports[]`. Per-report limits still apply per element. **[probed]** shape confirmed. |
| `properties:batchRunPivotReports` | v1beta | Batch form of the above. | Rarely. | Response key is **`pivotReports[]`**, not `reports[]`. Trips generic batch clients. |
| `properties:runRealtimeReport` | v1beta | Last 30 minutes (60 on 360). | The question is literally "right now". | **Separate quota bucket.** Tiny schema (15 dims / 4 metrics, §6). **No `metadata` field at all** in the response — code that reads `res.metadata.timeZone` generically will throw. No `offset`, no `dateRanges`. **[probed]** confirmed: `pagePath` is rejected, `unifiedScreenName` works. |
| `properties/*/metadata:get` | v1beta | The property's dimension + metric catalogue, **including its custom definitions**. | Always, once, cached — see §2. | `properties/0/metadata` returns the universal schema **without** custom definitions and needs no property permission. `DimensionMetadata` has **no `type` field**; only `MetricMetadata` does. |
| `properties:checkCompatibility` | v1beta | Which fields can be combined. | Pre-flight a generated report body, or ask "what else could I add". | **It 400s if the request you hand it is itself incompatible** — it is not a diagnostic for a broken report, it is a suggester for a working one. **[probed]** It returns a verdict for the *entire property schema* filtered by `compatibilityFilter`, not just the fields you sent (this resolves an ambiguity in the docs). Core reports only — no realtime/funnel equivalent. |
| `properties/*/audienceExports` `create`/`get`/`list`/`query` | v1beta | Snapshot the **individual users** in an Audience. | Never, for us. | `create` returns a long-running `Operation`; the export becomes `ACTIVE` asynchronously (docs say ~15 min). Only 4 dimensions exist: `deviceId`, `userId`, `isAdsPersonalizationAllowed`, `isLimitedAdTracking`. **[probed]** `list` returns `{}` — we have none, and no Audiences worth exporting. |
| `properties:runFunnelReport` | **v1alpha** | Funnel/step reports. | You want step completion + abandonment without hand-rolling it from event counts. | Alpha: "expect breaking changes". Own quota bucket. Breakdown defaults to only the first 5 values. **[probed]** the method exists and our scope reaches it (rejected only our field name, not our credentials). |
| `properties/*/reportTasks` | **v1alpha** | Async large/unsampled exports. | You need >250k rows or `samplingLevel: UNSAMPLED`. | `UNSAMPLED` is 360-only. Results retained **72 hours**. Irrelevant at our volume. |
| `properties/*/propertyQuotasSnapshot:get` | **v1alpha** | Remaining quota in all three buckets, **without spending a token**. | Cheap health check. | **[probed]** works with our scope. Returns `corePropertyQuota`, `realtimePropertyQuota`, `funnelPropertyQuota`. |

Not in v1alpha despite occasional claims: `runRealtimeReport`, `batchRunReports`,
`batchRunPivotReports`, `runPivotReport`, `checkCompatibility`.

### Response envelope (`runReport`)

`dimensionHeaders[]`, `metricHeaders[]` (each `{name, type}`), `rows[]` (every
value is a **string**), `totals[]`/`maximums[]`/`minimums[]` (only when
`metricAggregations` asked), `rowCount`, `metadata`, `propertyQuota` (only with
`returnPropertyQuota: true`), `kind`.

`metadata` is `ResponseMetaData`
(<https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/ResponseMetaData>)
and is the part an agent must not ignore:

| Field | Why it matters |
|---|---|
| `dataLossFromOtherRow` | true ⇒ some rows were rolled into `(other)`. Totals stay right, the breakdown is lossy. |
| `samplingMetadatas[]` | present **only when sampled**, one entry per date range, `{samplesReadCount, samplingSpaceSize}`. Absent array ≠ empty array — check existence. |
| `subjectToThresholding` | true ⇒ rows may have been silently withheld. **[probed]** we can trigger this (§5). |
| `emptyReason` | free-form **string**, not an enum. Log it, do not switch on it. |
| `timeZone` | `date`/`dateHour` values are property-local, not UTC. Ours is `America/Los_Angeles` — a Cloudflare Worker computing "yesterday" in UTC will be off for 7-8 hours a day. |
| `currencyCode`, `schemaRestrictionResponse` | irrelevant to us (no revenue). |

`rowCount` is the total matching rows, independent of `limit`/`offset` — it is
both the pagination terminator and the honest answer to "how many pages are
there really?". **The existing `queryGa4` throws it away**; see §9.

---

## 2. `getMetadata` and a curated field reference

### Use `getMetadata`, do not ship a hand-written allow-list

`GET /v1beta/properties/371413172/metadata` returns every field this property can
report on — **377 dimensions and 89 metrics [probed]** — each with `apiName`,
`uiName`, `description`, `category`, `customDefinition`, `deprecatedApiNames`,
and for metrics also `type` (`TYPE_INTEGER`, `TYPE_FLOAT`, `TYPE_SECONDS`,
`TYPE_CURRENCY`, …), `expression` and `blockedReasons`.

Two reasons this beats a static list:

1. It is the **only** way to learn our custom fields. It surfaced
   `customEvent:event_category` and `customEvent:event_label` — which no static
   list would have, and which turn out to be dead **[probed]**.
2. It carries `deprecatedApiNames`, so an agent can be told `conversions` is now
   `keyEvents` rather than discovering it through a 400.

`getMetadata` is billed on the Core token bucket but is cheap; cache it for a day.

`properties/0/metadata` is the universal schema minus custom definitions and
needs no property permission — a safe cold-start catalogue.

### The scope prefix that trips everyone up: `firstUser…` vs `session…` vs bare

GA4 stores the same acquisition fact three times, under three attribution scopes.
They are different questions and they give different answers.

| Prefix | Question it answers | Attributed at | Use for |
|---|---|---|---|
| `firstUserDefaultChannelGroup`, `firstUserSource`, `firstUserMedium`, `firstUserCampaignName` | "Where did this **person** originally come from?" — fixed forever at the user's first-ever session | user acquisition | Cohorts, LTV, "which channel *recruits* users" |
| `sessionDefaultChannelGroup`, `sessionSource`, `sessionMedium`, `sessionSourceMedium`, `sessionCampaignName` | "Where did **this visit** come from?" — re-evaluated every session | traffic acquisition | Almost every SEO/content question. **This is the default choice.** |
| bare `defaultChannelGroup`, `source`, `medium`, `campaignName`, `sourceMedium` | "Which touchpoint got **credit for this key event**?" — event-scoped, attribution-model driven | key events only | Conversion attribution. Their own docs say *"Present only for key events."* |

Live proof of the difference **[probed]**, same 28 days:

```
sessionDefaultChannelGroup     Direct 7,156 sessions   Organic Search 5,382   AI Assistant 204
firstUserDefaultChannelGroup   Direct 6,900 sessions   Organic Search 5,546   AI Assistant 204
                               (5,296 users)           (3,729 users)          (140 users)
```

Read that carefully: session-scoped says Organic Search drove 5,382 visits;
first-user-scoped says users *recruited* by Organic Search made 5,546 visits.
Neither is wrong. Reporting one as the other is the single most common GA4 error.

The bare forms are the real trap. **[probed]**: `[pagePath] × [screenPageViews]`
marks `source`, `medium`, `defaultChannelGroup`, `campaignName`,
`primaryChannelGroup` **INCOMPATIBLE** — because event-scoped attribution
dimensions only combine with key-event and revenue metrics. An agent that
reaches for `source` instead of `sessionSource` gets a 400 with no explanation of
why the obvious-looking name failed.

### Curated dimensions (~40) for a content/SEO site

**Traffic source — session scope (use these by default)**
`sessionDefaultChannelGroup` · `sessionSource` · `sessionMedium` ·
`sessionSourceMedium` · `sessionCampaignName` · `sessionPrimaryChannelGroup` ·
`sessionManualTerm`

**Traffic source — user scope (cohort questions only)**
`firstUserDefaultChannelGroup` · `firstUserSource` · `firstUserMedium` ·
`firstUserSourceMedium` · `firstUserCampaignName`

**Page / content**
`pagePath` (path only — 15,715 distinct here) · `pagePathPlusQueryString`
(26,086 distinct; needed for `/?page=2`, which is a *real* content surface for us)
· `pageTitle` · `pageLocation` (full URL) · `fullPageUrl` · `hostName` ·
`landingPage` (session-scoped: the entry path) · `landingPagePlusQueryString` ·
`pageReferrer` · `contentGroup` · `unifiedPagePathScreen`

**Geo / device / platform**
`country` · `countryId` · `region` · `city` · `continent` · `deviceCategory` ·
`browser` · `operatingSystem` · `operatingSystemWithVersion` ·
`platformDeviceCategory` · `screenResolution` · `language` · `languageCode`

**Time**
`date` (`YYYYMMDD`, property-local) · `dateHour` · `hour` · `dayOfWeekName` ·
`week` · `isoWeek` · `yearWeek` · `month` · `yearMonth` · `nthDay`

**Behaviour / segmentation**
`eventName` · `isKeyEvent` · `newVsReturning` · `linkUrl` · `linkDomain` ·
`outbound` · `percentScrolled` · `audienceName` (⚠ thresholded) ·
`searchTerm` (⚠ **dead for us** — 100% empty **[probed]**. Its own metadata says
*"Automatically populated if Enhanced Measurement is enabled. Populated by the
event parameter `search_term`."* We fire a `search_query` event with no
`search_term` parameter, so nothing lands)

**Ours**
`customEvent:event_category` · `customEvent:event_label` — registered, both
100% `(not set)` **[probed]**. Either wire them up or reclaim the slots.

**Avoid**: `userAgeBracket`, `userGender`, `brandingInterest`, `audienceId` —
thresholded and, with Google Signals off, empty anyway (§5).

### Curated metrics (~30)

| Metric | Type | Note |
|---|---|---|
| `sessions` | int | visits |
| `activeUsers` | int | GA4's headline "users": *"distinct users who visited your site or app"* |
| `totalUsers` | int | *"distinct users who have logged at least one event, regardless of whether the site or app was in use"* — a superset; the two differ and reporting one as the other is a quiet error |
| `newUsers` | int | first-ever session in range |
| `screenPageViews` | int | pageviews — 143,800 for us **[probed]** |
| `screenPageViewsPerSession` | float | depth-of-visit; the number that says whether palette browsing is working |
| `screenPageViewsPerUser` | float | |
| `engagedSessions` | int | >10s, or ≥2 pageviews, or a key event |
| `engagementRate` | float | `engagedSessions / sessions`, **0–1 not 0–100** — `ga4.ts` multiplies by 100 for display, correctly |
| `bounceRate` | float | `1 - engagementRate`. Nothing like UA's bounce rate |
| `averageSessionDuration` | **TYPE_SECONDS** | seconds, float |
| `userEngagementDuration` | **TYPE_SECONDS** | total engaged seconds — the honest "time on page" input |
| `eventCount` | int | |
| `eventCountPerUser`, `eventsPerSession` | float | |
| `keyEvents` | **float** | the renamed `conversions`. Float, not int |
| `sessionKeyEventRate`, `userKeyEventRate` | float | ⚠ near-meaningless for us: *every* custom event is a key event **[probed]**, so these approximate "did anything happen" |
| `keyEvents:<eventName>` | float | per-event, e.g. `keyEvents:purchase`. Discover the valid suffixes from `getMetadata` |
| `sessionsPerUser` | float | |
| `active1DayUsers`, `active7DayUsers`, `active28DayUsers` | int | DAU/WAU/MAU |
| `dauPerMau`, `dauPerWau`, `wauPerMau` | float | stickiness |
| `scrolledUsers` | int | users who hit 90% scroll |
| `organicGoogleSearchClicks` / `…Impressions` / `…ClickThroughRate` / `…AveragePosition` | — | **blocked** — §8 |
| `crashFreeUsersRate`, ecommerce, ad-cost, item-scoped | — | not applicable; ignore |

### Incompatibility, measured rather than assumed

Folklore says page-scoped dimensions can't be used with session metrics. **That
is false.** All of these are COMPATIBLE **[probed]** via `checkCompatibility`:

```
pagePath × sessions                          landingPage × screenPageViews
pagePath × bounceRate, engagementRate        landingPage × screenPageViewsPerSession
pagePath × averageSessionDuration            eventName × sessions, keyEvents
pageTitle + pagePath × screenPageViews, userEngagementDuration
firstUserDefaultChannelGroup + sessionDefaultChannelGroup × sessions, activeUsers
```

(They may be *semantically* odd — `landingPage × screenPageViews` counts all views
in sessions that entered there — but the API will run them.)

The real incompatibility families, enumerated from live `checkCompatibility`
responses **[probed]**:

1. **Cohort** — `cohortNthDay/Week/Month`, `cohortActiveUsers`, `cohortTotalUsers`
   only work inside a `cohortSpec` request (which must omit `dateRanges`).
   Incompatible with everything else, always.
2. **Search Console** — the four `organicGoogleSearch*` metrics combine **only**
   with `country`, `deviceCategory`, `streamId`, `landingPagePlusQueryString`,
   the date family (`date`, `week`, `month`, `yearMonth`, `nthDay`, …) and
   `comparison`. Not `landingPage`, not `pagePath`, and never a query dimension.
   All four are additionally gated on an active link we do not have. See §8.
3. **Ad cost** — `advertiserAd*`, `returnOnAdSpend` need a linked ads platform.
4. **Event-scoped attribution** — bare `source` / `medium` / `campaignName` /
   `defaultChannelGroup` / `primaryChannelGroup` and all the `cm360*`, `dv360*`,
   `googleAds*`, `sa360*`, `manual*` families become incompatible the moment you
   ask for a non-key-event metric like `screenPageViews` or `activeUsers`.
5. **Item-scoped ecommerce** — `item*` dimensions vs non-item metrics.

Everything outside those five families combines freely. That is a small enough
rule set to put in a tool description.

**How to use `checkCompatibility` properly.** It answers "given this working
request, what else may I add?" — send a *valid* subset plus
`compatibilityFilter: "COMPATIBLE"` and it returns the whole schema filtered to
additions that keep working. Hand it something already broken and it returns
`400 "The dimensions and metrics are incompatible."` with no detail **[probed]** —
which is *less* informative than what `runReport` itself gives you:

```
400 "Please remove organicGoogleSearchClicks to make the request compatible for
     example. The request's dimensions & metrics are incompatible."
```

`runReport`'s own error names the offending field. That shapes the tool design in
§9: repair from the `runReport` error, use `checkCompatibility` for discovery.

---

## 3. Filters, ordering, paging, date ranges

### `FilterExpression`

Exactly one of four keys per node
(<https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/FilterExpression>):

```jsonc
{ "andGroup":      { "expressions": [ /* FilterExpression */ ] } }
{ "orGroup":       { "expressions": [ /* FilterExpression */ ] } }
{ "notExpression": { /* FilterExpression */ } }
{ "filter":        { "fieldName": "...", /* one matcher */ } }
```

Within a single `filter`, all field names must be **all dimensions or all
metrics** — never mixed.

| Matcher | Shape |
|---|---|
| `stringFilter` | `{ "matchType": …, "value": "…", "caseSensitive": false }`. `matchType` ∈ `EXACT`, `BEGINS_WITH`, `ENDS_WITH`, `CONTAINS`, `FULL_REGEXP`, `PARTIAL_REGEXP` |
| `inListFilter` | `{ "values": ["a","b"], "caseSensitive": false }` |
| `numericFilter` | `{ "operation": …, "value": {"int64Value": "10"} }`. `operation` ∈ `EQUAL`, `LESS_THAN`, `LESS_THAN_OR_EQUAL`, `GREATER_THAN`, `GREATER_THAN_OR_EQUAL`. **There is no `NOT_EQUAL`** — wrap in `notExpression`. `int64Value` is a **string** in JSON; `doubleValue` is a number |
| `betweenFilter` | `{ "fromValue": {...}, "toValue": {...} }` |
| `emptyFilter` | `{}` — matches `(not set)` and empty strings. **[probed]** works: it isolates our 2,982 `(not set)` landing-page sessions |

`dimensionFilter` is `WHERE` (pre-aggregation, dimensions only). `metricFilter`
is `HAVING` (post-aggregation, metrics only). Neither can see inside the
`(other)` row.

### `orderBys`

```jsonc
[ { "metric":    { "metricName": "sessions" }, "desc": true } ]
[ { "dimension": { "dimensionName": "date", "orderType": "ALPHANUMERIC" }, "desc": true } ]
```

`orderType` ∈ `ALPHANUMERIC`, `CASE_INSENSITIVE_ALPHANUMERIC`, `NUMERIC`. Note
`"2" < "A" < "b"` under `ALPHANUMERIC`, so numeric-looking dimensions sort wrong
unless you say `NUMERIC`. There is also a `pivot` order-by for pivot reports.

### Paging

`limit` defaults to **10,000** and caps at **250,000**; `offset` is 0-based.
**[probed]** the API silently accepted `limit: 250001` rather than erroring, so
do not rely on it to police you. Page while
`offset + rows.length < rowCount`.

### Date ranges

Up to **4** per request — **[probed]** a 5th returns
`400 "Requests are limited to 4 dateRanges."`. `startDate`/`endDate` are
inclusive, either `YYYY-MM-DD` or `NdaysAgo` / `yesterday` / `today`, resolved in
**property-local time**. Give a range a `name` or it is auto-named
`date_range_0`, `date_range_1`, … A second range **auto-injects a `dateRange`
dimension column** into every row — your response parser must expect a column it
did not ask for **[probed]**.

`metricAggregations: ["TOTAL"]` adds a `totals[]` block whose dimension values
are `RESERVED_TOTAL` **[probed]**. `keepEmptyRows: true` retains all-zero rows.
`comparisons[]` exists in v1beta (saved comparisons or inline dimension filters)
but is redundant for us — two date ranges is simpler.

### Worked example 1 — period-over-period by channel

The comparison an agent asks for constantly, in one request. **[probed]** — the
output below is real.

```json
{
  "dateRanges": [
    { "startDate": "28daysAgo", "endDate": "yesterday" },
    { "startDate": "56daysAgo", "endDate": "29daysAgo", "name": "prior" }
  ],
  "dimensions": [{ "name": "sessionDefaultChannelGroup" }],
  "metrics": [
    { "name": "sessions" },
    { "name": "engagedSessions" },
    { "name": "averageSessionDuration" }
  ],
  "dimensionFilter": {
    "filter": {
      "fieldName": "sessionDefaultChannelGroup",
      "inListFilter": { "values": ["Organic Search", "Referral", "AI Assistant"] }
    }
  },
  "metricAggregations": ["TOTAL"],
  "limit": 20,
  "returnPropertyQuota": true
}
```

Returned: Organic Search **5,382 → prior 2,455 (+119%)**, engaged 3,078 vs 1,780,
avg duration **291s vs 390s**; Referral 738 vs 738; AI Assistant 204 vs 157. The
`dateRange` column appears automatically, and `totals[]` carries
`RESERVED_TOTAL` rows for each range.

### Worked example 2 — organic landing pages, excluding the homepage, min 10 sessions

Shows `andGroup` + `notExpression` + a `HAVING`-style metric filter. **[probed]**

```json
{
  "dateRanges": [{ "startDate": "28daysAgo", "endDate": "yesterday" }],
  "dimensions": [{ "name": "landingPage" }, { "name": "sessionDefaultChannelGroup" }],
  "metrics": [
    { "name": "sessions" },
    { "name": "engagementRate" },
    { "name": "screenPageViewsPerSession" }
  ],
  "dimensionFilter": {
    "andGroup": {
      "expressions": [
        { "filter": { "fieldName": "sessionDefaultChannelGroup",
                      "stringFilter": { "matchType": "EXACT", "value": "Organic Search" } } },
        { "notExpression": { "filter": { "fieldName": "landingPage",
                      "stringFilter": { "matchType": "EXACT", "value": "/" } } } }
      ]
    }
  },
  "metricFilter": {
    "filter": { "fieldName": "sessions",
                "numericFilter": { "operation": "GREATER_THAN", "value": { "int64Value": "10" } } }
  },
  "orderBys": [{ "metric": { "metricName": "sessions" }, "desc": true }],
  "limit": 25
}
```

The top row it returns is `(not set)` with 1,393 organic sessions and
`screenPageViewsPerSession` **0** — see the gotcha in §10.

### Worked example 3 — content pages only, excluding seed URLs, via regex

grabient's palette permalinks are `/_gJDgH1gIagIj…`. Editorial pages are
everything else. **[probed]**

```json
{
  "dateRanges": [{ "startDate": "28daysAgo", "endDate": "yesterday" }],
  "dimensions": [{ "name": "pagePath" }],
  "metrics": [{ "name": "screenPageViews" }, { "name": "activeUsers" }],
  "dimensionFilter": {
    "notExpression": {
      "filter": { "fieldName": "pagePath",
                  "stringFilter": { "matchType": "FULL_REGEXP", "value": "^/_.*" } }
    }
  },
  "orderBys": [{ "metric": { "metricName": "screenPageViews" }, "desc": true }],
  "limit": 25
}
```

`rowCount` drops from 15,715 to **1,659** — i.e. 14,056 of our distinct paths are
individual palette permalinks. That single number is the kind of thing an agent
should be able to get, and today's tool hides it.

### Worked example 4 — several cuts in one round trip

```json
{
  "requests": [
    { "dateRanges": [{ "startDate": "28daysAgo", "endDate": "yesterday" }],
      "metrics": [{ "name": "sessions" }, { "name": "activeUsers" },
                  { "name": "newUsers" }, { "name": "screenPageViews" }] },
    { "dateRanges": [{ "startDate": "28daysAgo", "endDate": "yesterday" }],
      "dimensions": [{ "name": "sessionDefaultChannelGroup" }],
      "metrics": [{ "name": "sessions" }, { "name": "engagementRate" }], "limit": 12 },
    { "dateRanges": [{ "startDate": "28daysAgo", "endDate": "yesterday" }],
      "dimensions": [{ "name": "date" }],
      "metrics": [{ "name": "sessions" }],
      "orderBys": [{ "dimension": { "dimensionName": "date" } }], "limit": 400 }
  ]
}
```

POST to `…/properties/371413172:batchRunReports`. Max 5 requests; response is
`{ "reports": [...] }` index-aligned with `requests`. This is exactly what
`loadGa4()` does today with four parallel `fetch`es — it could be one.

---

## 4. Quotas

Three **independent** buckets — Core, Realtime, Funnel — each with the same
limits (<https://developers.google.com/analytics/devguides/reporting/data/v1/quotas>).
**[probed]** via v1alpha `getPropertyQuotasSnapshot`, which returns
`corePropertyQuota`, `realtimePropertyQuota`, `funnelPropertyQuota` separately.

| Quota | Standard (us) | 360 |
|---|---|---|
| `tokensPerDay` | **200,000** | 2,000,000 |
| `tokensPerHour` | **40,000** | 400,000 |
| `tokensPerProjectPerHour` (35% of hourly) | **14,000** | 140,000 |
| `concurrentRequests` | **10** | 50 |
| `serverErrorsPerProjectPerHour` | **10** | 50 |
| `potentiallyThresholdedRequestsPerHour` | **120** | 120 |

Measured cost **[probed]**:

- A typical small Core report — a few dimensions, 28 days, `limit` 5-25 — costs
  **1 token**. Even `pagePathPlusQueryString` over 26,086 distinct values cost 1.
- A **Realtime** report cost **39-42 tokens** — ~40× a Core report, from the
  separate Realtime bucket.

At 1 token per report we have room for ~200,000 reports/day. **Token quota is not
a design constraint for us.** The binding limits are `concurrentRequests: 10`
(so cap in-flight fan-out) and `serverErrorsPerProjectPerHour: 10` (10 × 5xx
from the same project blocks *all* requests to the property for the hour — a
retry loop is genuinely dangerous). Daily quotas reset at midnight Pacific.

Set `returnPropertyQuota: true` on every call: it costs nothing and gives
`{consumed, remaining}` per bucket.

---

## 5. Sampling, `(other)`, thresholding, freshness

**Sampling — will not happen to us.** The Data API samples above **10 million
events per query** on a standard property
(<https://support.google.com/analytics/answer/13331292>). We run ~225k events per
28 days **[probed]** — over 40× under the limit even across a year. Detect it via
`metadata.samplingMetadatas[]`; it is absent when unsampled. No sampling was seen
in any probe.

**`(other)` — not currently biting, but watch it.** GA4 rolls low-frequency
values into `(other)` when a dimension has high cardinality, "more common with
more than 500 unique values per day"
(<https://developers.google.com/analytics/devguides/reporting/data/v1/reporting-data-expectations>).
We are close: **15,715 distinct `pagePath`s and 26,086 distinct
`pagePathPlusQueryString`s in 28 days [probed]** — because every palette
permalink is its own URL. No `(other)` row and no `dataLossFromOtherRow` appeared
in any probe, but the margin is thin and grows with the corpus. Filters cannot
recover values swallowed into `(other)`, so any tool that reports page data must
surface `dataLossFromOtherRow` rather than silently under-reporting.

**Thresholding — yes, it bites, but only where you'd expect.** The potentially
thresholded dimensions are `userAgeBracket`, `userGender`, `brandingInterest`,
`audienceId`, `audienceName` (quotas page). **[probed]**: asking for
`userGender × userAgeBracket × activeUsers` over 28 days returned **zero rows**
with `"subjectToThresholding": true` and consumed 1 of the 120/hour thresholded
budget. So demographics are effectively unavailable on this property — which is
expected with Google Signals off — and an agent must read
`subjectToThresholding` or it will report "no data" when the truth is "withheld".
Ordinary dimensions (`pagePath`, `sessionSource`, `eventName`, `date`) never
triggered it. Google does not publish the numeric threshold.

**Freshness — the reason "yesterday" is a lie for several hours.** Standard
properties get intraday refresh every **2-6 hours**, daily processing completes
around **12 hours** after midnight property-time, and "data processing can take
24-48 hours; during that time, data in your reports may change"
(<https://support.google.com/analytics/answer/11198161>). Late events are ignored
after ~2 calendar days plus today.

**[probed]** daily sessions, with day-of-week attached so the dip is
interpretable:

```
2026-08-16 Sun  146   <- today, partial by construction
2026-08-15 Sat  210   <- "yesterday": low, but Saturdays run low anyway
2026-08-14 Fri  310        (prior Saturdays: 308, 241)
2026-08-13 Thu  428
2026-08-12 Wed  431
2026-08-11 Tue  406
```

The honest reading: you **cannot** eyeball freshness on a site with this much
day-of-week seasonality, which is exactly why the rule has to be procedural, not
judgemental. Two consequences for tool design:

- `today` **is** queryable and returns partial data. Useful as a liveness signal,
  never as a total.
- A daily job should re-fetch a **trailing 3-day window and overwrite**, not
  append yesterday once. Anything comparing "yesterday vs the day before" will
  manufacture a fake decline.

---

## 6. Realtime API

`POST /v1beta/properties/371413172:runRealtimeReport` — **[probed]**, works.

Covers the last **30 minutes** (60 on 360). Request fields are a strict subset of
`runReport`: `dimensions`, `metrics`, `dimensionFilter`, `metricFilter`, `limit`,
`metricAggregations`, `orderBys`, `returnPropertyQuota`, `minuteRanges`. **No
`dateRanges`, no `offset`, no `keepEmptyRows`, no pivots.** The response has **no
`metadata` field at all** — generic response parsers break here.

Exhaustive schema
(<https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-api-schema>):

- **15 dimensions**: `appVersion`, `audienceId`, `audienceName`,
  `audienceResourceName`, `city`, `cityId`, `country`, `countryId`,
  `deviceCategory`, `eventName`, `minutesAgo`, `platform`, `streamId`,
  `streamName`, `unifiedScreenName`; plus `customUser:*` (user-scoped only).
- **4 metrics**: `activeUsers`, `eventCount`, `keyEvents`, `screenPageViews`.

`minuteRanges` allows up to 2 ranges; `startMinutesAgo` (default 29, max 29 for
standard) is the **larger** number, `endMinutesAgo` (default 0) the smaller;
both inclusive.

**[probed]** the gap that matters: **`pagePath` is not a realtime dimension** —
`400 "Field pagePath is not a valid dimension"`. The only page identifier is
`unifiedScreenName`, which is the page **title**. For grabient those titles are
things like `#1446d2 → #0060ae → #0181c3 → #26a7e3 Gradient Palette | Grabient` —
technically identifying, practically unusable as a key.

**Is it worth an MCP tool?** Yes, but a small, honestly-scoped one, and low
priority. It answers exactly one class of question — "is anything happening right
now / did the deploy break tracking" — which is real but rare, and it cannot
answer it by URL. It is on its own quota bucket, so it cannot starve the reports.
It must be a **separate tool**, not a mode flag on the report tool: two-thirds of
the report tool's parameters are invalid here, and a schema that lies about what
it accepts is worse than a second tool.

---

## 7. Admin API

**Currently DISABLED. [probed]:**

```
403 PERMISSION_DENIED  SERVICE_DISABLED
"Google Analytics Admin API has not been used in project 453530220316 before or
 it is disabled. Enable it by visiting
 https://console.developers.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=453530220316"
```

Enabling it is a **one-click, no-new-credential** change: visit that URL (or
`gcloud services enable analyticsadmin.googleapis.com`) and wait a few minutes to
propagate. **No new scope is required** — every read method in v1beta declares
both `analytics.readonly` and `analytics.edit`, so the scope we already request
covers all of them, and our service account already holds Viewer on the property.
Nothing in `google-auth.ts` changes.

The one exception: the `accessBindings` family (who has what role) needs
`analytics.manage.users.readonly`, is v1alpha-only, and we do not want it.

What it would give us, read-only:

| Method (v1beta unless noted) | Returns | Worth it? |
|---|---|---|
| `properties.get` | `displayName`, **`timeZone`**, `currencyCode`, `industryCategory`, `createTime`, **`serviceLevel`** (STANDARD vs 360) | Yes — pins down timezone and quota tier instead of inferring them |
| `properties.dataStreams.list` | streams with `webStreamData.measurementId` and `defaultUri` | Yes — confirms which stream Zaraz feeds |
| `properties.customDimensions.list` | `parameterName`, `scope`, `displayName`, `disallowAdsPersonalization` | **Yes — highest value.** `getMetadata` shows `customEvent:event_category` exists but not which event parameter it is bound to. That is exactly the gap that left us with two dead custom dimensions |
| `properties.customMetrics.list` | `parameterName`, `scope`, `measurementUnit` | Yes |
| `properties.keyEvents.list` | `eventName`, `countingMethod`, `custom`, `createTime` | **Yes.** We *inferred* "everything is a key event" from `keyEvents == eventCount` **[probed]**; this states it. Note the rename: `conversionEvents` still exists but is deprecated in favour of `keyEvents` (changelog 2024-05-06) |
| `properties.getDataRetentionSettings` | `eventDataRetention` (2 or 14 months), `userDataRetention`, `resetUserDataOnNewActivity` | Yes — how far back user-scoped queries can honestly go |
| `properties.channelGroups.list` (v1alpha) | `groupingRule`, `systemDefined` | **Yes** — the literal definition of "Organic Search" and "AI Assistant" for this property. We report those channels constantly and have never seen their rules |
| `properties.getAttributionSettings` (v1alpha) | lookback windows, `reportingAttributionModel` | Marginal, but explains attribution discrepancies |
| `properties.bigQueryLinks.list` (v1alpha) | whether raw event export exists | Marginal — would be the escape hatch from every Data API limit |
| `accountSummaries.list` | every property the account can see | **Use this, not `properties.list`** — the latter *requires* a `filter` parameter |
| ~~`properties.searchConsoleLinks`~~ | — | **Does not exist, in any version. [probed]** `/v1alpha/…/searchConsoleLinks` and the v1beta equivalent both return a plain HTML **404 (path not routed)**, while `/v1alpha/properties/371413172` returns a proper JSON `403 SERVICE_DISABLED` — a disabled API 403s on real paths and 404s on imaginary ones. Confirmed against the live discovery docs: zero matches for "searchconsole". Do not confuse it with `searchAds360Links`, which is paid search. **Enabling the Admin API will not let us diagnose §8** |
| `properties.dataStreams.measurementProtocolSecrets.list` | `secretValue` — **a live write credential** | ⚠️ Readable with `analytics.readonly` (contrary to the obvious assumption). Deliberately do **not** expose this through any tool |
| `properties.runAccessReport` | who accessed the data | No — and note it charges **Data API Core tokens**, not Admin quota |

Admin API quotas are request-count based and entirely separate from the Data API
token buckets: **1,200 requests/minute** (600 per user), plus a project-wide
**50,000 requests/day** shared across all non-Data-API Analytics calls. Reads
consume no write quota. Irrelevant at our volume.

**Verdict: worth enabling — but it is a nice-to-have, not a blocker.** Nothing in
it is needed for reporting. Its value is being the only machine-readable answer
to *"is this property configured the way we think it is?"*, and this
investigation found three places where it isn't (two dead custom dimensions,
everything-is-a-key-event, a Search Console link that doesn't work). Note the
Admin API can diagnose the first two and **not** the third — it does not expose
Search Console links at all. The cost is one click and zero new credentials, so
enable it; just do not expect it to unblock §8. It is a **configuration audit**
capability, not a reporting one, and should be exposed as one tool returning a
config snapshot rather than as five tools nobody calls twice.

Its quota is separate from the Data API token buckets and generous; irrelevant at
our call volume.

---

## 8. The Search Console link

**The headline: it does not work today, and even when it does it will not give
us queries.**

**[probed]**, every attempt to read the four `organicGoogleSearch*` metrics
returns:

```
400 INVALID_ARGUMENT  "Search Console fields require an active link to be used."
```

The metrics *are* in the property's `getMetadata` output
(`organicGoogleSearchClicks`, `organicGoogleSearchImpressions`,
`organicGoogleSearchClickThroughRate`, `organicGoogleSearchAveragePosition`)
**[probed]** — the universal schema lists them regardless of link state, and
their descriptions even say *"This metric requires an active Search Console
link."* Presence in the catalogue proves nothing; only a query that returns 200
proves the link.

So the owner's "Link Search Console" click did not produce an API-active link.
Likely causes, in rough order: the link was created against a different Search
Console property than the one holding the verified `grabient.com` data (domain
property vs URL-prefix property is the classic mismatch); the web data stream was
never selected during linking; or the Search Console report collection was never
published in the GA4 UI.

**There is no API that will tell us which.** The Admin API does not expose
Search Console links at all **[probed]**, so diagnosis is a manual check in the
GA4 UI under Admin → Property → Product links → Search Console links, and the
only automated verification available is to re-run the probe below and look for a
200:

```bash
POST /v1beta/properties/371413172:runReport
{ "dateRanges":[{"startDate":"28daysAgo","endDate":"yesterday"}],
  "dimensions":[{"name":"date"}],
  "metrics":[{"name":"organicGoogleSearchClicks"}] }
```

### What the link would actually buy — measured by error message

GA4 returns **two different 400s**, and the difference is a free discovery
mechanism **[probed]**:

- `"Search Console fields require an active link to be used."` → the dimension
  **is** compatible; only the dead link is stopping it.
- `"…The request's dimensions & metrics are incompatible."` → it will never work,
  link or no link.

Running every candidate dimension through that test:

| Dimension | Verdict **[probed]** |
|---|---|
| `landingPagePlusQueryString` | **BLOCKED BY LINK — compatible** |
| `country`, `deviceCategory`, `date` + the whole date family, `streamId`, `comparison` | **BLOCKED BY LINK — compatible** |
| `landingPage` (no query string) | **INCOMPATIBLE — never** |
| `pagePath`, `hostName`, `sessionDefaultChannelGroup`, `browser`, `region`, `city` | **INCOMPATIBLE — never** |

So fixing the link is worth more than `checkCompatibility` suggested: it would
give Google-organic **clicks, impressions, CTR and average position at
landing-page granularity**, plus by date, country and device — and because
`sessions`, `engagedSessions`, `bounceRate` and `keyEvents` are all compatible
too, impressions and on-site engagement can appear **in the same row**. That
join is the one thing neither GA4-without-the-link nor the Search Console API can
do alone.

Note the trap: it is `landingPagePlusQueryString`, **not** `landingPage`. The
plain form is permanently incompatible. This matches GA4's own "Google organic
search traffic" report, which uses *Landing page + query string*.

⚠️ **`checkCompatibility` lies while the link is down.** It omitted
`landingPagePlusQueryString` from its COMPATIBLE list **[probed]**, even though
`runReport` reports that dimension as merely link-blocked. Its answer is
computed against current link state, so it under-reports what will work after a
fix. Trust the `runReport` error string over the checker here.

**Still no query dimension — ever.** There is no `organicGoogleSearchQuery` or
equivalent in the Data API schema in any form; the "Organic Google search query"
dimension exists only inside the GA4 UI's Queries report. And GA4 cannot cross
query × landing page even in the UI — they are two separate reports.

**It does not replace the Search Console API.** Queries, and query × page in one
request, remain available only through `searchconsole.googleapis.com`
`searchAnalytics.query` (dimensions `DATE`, `QUERY`, `PAGE`, `COUNTRY`,
`DEVICE`, `SEARCH_APPEARANCE`, `HOUR`) — a different scope family
(`webmasters.readonly`), already wired up in `apps/admin/src/search-console.ts`
and exposed as the `search_console` MCP tool. **Nothing about the GA4 link makes
that tool redundant**; for SEO work it remains the better source.

### What it takes to make the link active

From <https://support.google.com/analytics/answer/10737381>:

- **Editor** on the GA4 property **and verified owner** of the Search Console
  property. Both, in the same Google account.
- The link attaches to **one specific web data stream**, chosen in the wizard.
  One SC property ↔ one web data stream, and a GA4 property may have only one
  linked stream.
- **Links cannot be edited** — to change one you delete and recreate it.
- **Backfill rule**: if the data stream existed before site verification, data
  starts at verification; if verification came first, data starts at stream
  creation. A correctly-linked property can still look empty for this reason.
- Search Console data reaches GA4 **48 hours** after collection; retention is 16
  months.
- The **Search Console report collection is unpublished by default** (Library →
  publish). That is a UI-navigation concern only — it does not gate API access.
- The real status surface is **Search Console → Settings → Associations**, which
  shows active vs pending. GA4's own UI does not expose a link state, and no API
  does either.

Two claims to *not* repeat: that the SC property must be domain-level (that
requirement is documented for Merchant Center, not GA4), and that a UI-visible
link implies an API-active one — undocumented either way.

Recommended action: chase the link because it is cheap, but do not build a tool
against it until a probe returns 200.

---

## 9. Proposed MCP tools

### What already exists

`apps/admin/src/mcp.ts` registers eight tools on the private, Cloudflare
Access-gated server `grabient-analytics`: `brief`, `search_console`, **`ga4`**,
`traffic`, `acquisition`, `url_inspection`, `sitemaps`, `funnel`.

The relevant one is **`ga4`**, backed by `queryGa4()` in `apps/admin/src/ga4.ts`:

```ts
{ dimensions?: string[] (max 6), metrics?: string[] (max 8),
  days?: 1..365, limit?: 1..500 }
→ { property, rows: Array<Record<string, string|number>> }
```

It already made the right core call — pass field names straight through to Google
rather than maintaining a stale allow-list, and let Google's descriptive error be
the validation. **Keep that.** What it is missing, in the order an agent hits it:

1. **No filters.** "Organic traffic to /palettes/*" is not expressible, so the
   agent pulls 500 rows and filters in its head — burning context and truncating.
2. **No `orderBys`.** Results come back in GA4's default order, so "top pages" is
   only accidentally top. *(This is the highest-severity gap: the tool's output
   currently misleads.)*
3. **No comparison window.** `days` only. Every "is this up or down" question
   needs two calls and manual arithmetic.
4. **`endDate` hardcoded to `yesterday`.** `today` is unreachable.
5. **`rowCount` discarded.** An agent asking for 25 of 15,715 pages has no idea
   it saw 0.16% of them.
6. **All response metadata discarded** — `subjectToThresholding`,
   `dataLossFromOtherRow`, `samplingMetadatas`, `timeZone`. The agent cannot tell
   "no data" from "withheld".
7. **No discovery.** The description hardcodes six dimensions and six metrics out
   of 377/89, and cannot mention custom fields, so the agent either sticks to the
   listed six or guesses.

### The design argument: one flexible tool, or many narrow ones?

**Many narrow tools** (`ga4_top_pages`, `ga4_channels`, `ga4_trend`,
`ga4_landing_pages`, …) are tempting: each has an obvious name, a tiny schema, no
invalid states, and needs no GA4 knowledge from the model. But:

- They encode *our* current questions. The first genuinely new question — "which
  referrers send engaged mobile sessions to palette pages" — has no tool, and the
  agent has no way to build one.
- Each tool is permanent context cost in every session, whether or not it is used.
- They fan out combinatorially: dimension × metric × filter × window is the
  actual space, and it does not factor into a tidy dozen names.
- We already have `brief`, which is the correct *fixed* shape. A second fixed
  layer would compete with it.

**One flexible tool** matches the upstream API: GA4 itself is one method with a
big body. Its risk is entirely about **field-name hallucination and opaque
errors** — the model invents `pageviews` or reaches for `source` instead of
`sessionSource`, and gets a 400 it cannot act on.

That risk is fixable, and cheaply:

- a **discovery tool** (`ga4_fields`) that searches the property's real
  catalogue, so names are looked up rather than recalled;
- **auto-repair on 400** — GA4's own error already names the offending field
  (*"Please remove organicGoogleSearchClicks…"*, *"Did you mean googleAdsQuery?"*
  **[probed]**); return it verbatim instead of collapsing it;
- **recipes in the description** — three or four canonical request bodies inline
  cost far less context than three or four extra tools, and teach composition
  instead of substituting for it.

**Recommendation: one flexible report tool + one discovery tool + one realtime
tool + one config tool.** Four tools, of which one already exists in embryo. Keep
`brief` as the opinionated entry point. Do **not** add per-question tools.

The one place a narrow tool *is* justified is realtime (§6): its schema genuinely
differs, and folding it into the report tool would mean advertising parameters
that silently do nothing.

---

### P0 — `ga4` (EXTEND the existing tool; keep the name)

The name is already in use by clients; extending beats renaming. All new fields
optional, so today's calls keep working unchanged.

**Description** (agent-facing):

> Run a Google Analytics 4 report for grabient.com. GA4 is the only BOT-FILTERED
> view of the site — Cloudflare's numbers include automation and have been
> dominated by it.
>
> Use `sessionDefaultChannelGroup` / `sessionSource` / `sessionSourceMedium` for
> "where did this VISIT come from", and `firstUser…` variants only for "where was
> this PERSON originally acquired". Bare `source`/`medium`/`defaultChannelGroup`
> are key-event attribution fields and will fail against pageview metrics.
>
> Call `ga4_fields` first if you are unsure a name exists — there are 377
> dimensions and 89 metrics, including custom ones. Invalid names return Google's
> own error naming the field.
>
> Set `compareDays` to get the previous equal-length period in the same response.
> `engagementRate` and `bounceRate` are 0-1, not percentages. Always read the
> returned `meta` block: it says whether rows were withheld, rolled into
> `(other)`, or sampled, and how many rows matched in total.

**Input schema:**

```ts
{
  dimensions?:  string[]  // max 9 (API limit)
  metrics?:     string[]  // max 10 (API limit), default ["sessions"]
  days?:        number    // 1..365, default 28. Window ends `endDate`.
  endDate?:     "yesterday" | "today" | "YYYY-MM-DD"   // default "yesterday"
  compareDays?: boolean | number  // adds an immediately-preceding range named "prior"
  filter?:      FilterExpression  // raw GA4 shape, passed through
  metricFilter?: FilterExpression
  orderBy?:     { field: string; desc?: boolean }[]  // sugar over orderBys
  limit?:       number    // 1..1000, default 25
  offset?:      number
  keepEmptyRows?: boolean
}
```

`filter` takes the **raw** `FilterExpression` rather than a bespoke mini-DSL: the
model already knows this shape from the public docs, a custom DSL would have to
be re-taught in the description, and passing it through means Google validates it.
`orderBy` is the one place sugar pays — `{field, desc}` is far less error-prone
than remembering the `metric` vs `dimension` wrapper, and mapping it is trivial
because we know from the request which names are metrics.

**Return shape** — keep today's flat rows, add the metadata that makes them
interpretable:

```jsonc
{
  "property": "properties/371413172",
  "dateRange": { "startDate": "2026-07-19", "endDate": "2026-08-15", "timeZone": "America/Los_Angeles" },
  "rows": [ { "sessionDefaultChannelGroup": "Organic Search", "sessions": 5382 } ],
  "totals": { "sessions": 13429 },
  "meta": {
    "rowCount": 97,          // total matching rows, not rows returned
    "returned": 25,
    "truncated": true,
    "thresholded": false,    // metadata.subjectToThresholding
    "otherRow": false,       // metadata.dataLossFromOtherRow
    "sampled": false,
    "quota": { "coreTokensRemaining": 199920, "concurrentRemaining": 10 }
  }
}
```

On a 400, return Google's message verbatim plus a one-line hint mapping the five
incompatibility families (§2) to a fix. Do not swallow it.

### P0 — `ga4_fields` (NEW)

The tool that makes the flexible tool safe. Without it, `ga4` is a guessing game.

**Description:** *"Search the dimensions and metrics this GA4 property actually
supports, including custom ones. Use before `ga4` when unsure whether a field
exists or what it is called. Returns apiName, uiName, description, category and
(for metrics) unit type."*

**Input:** `{ search?: string, kind?: "dimension" | "metric" | "both", category?: string, customOnly?: boolean, limit?: number }`

**Return:**

```jsonc
{ "matched": 6, "dimensions": [ { "apiName": "sessionSourceMedium", "uiName": "Session source / medium",
    "description": "...", "category": "Traffic Source", "custom": false } ],
  "metrics": [ { "apiName": "engagementRate", "uiName": "Engagement rate",
    "description": "...", "type": "TYPE_FLOAT", "custom": false } ] }
```

Backed by `getMetadata` on `properties/371413172`, cached ~24h (it changes only
when someone edits the property). Substring-match `apiName`, `uiName` and
`description` so "bounce", "landing page" and "time on page" all resolve. With no
`search`, return the curated shortlist from §2 rather than all 466 fields.

### P1 — `ga4_realtime` (NEW)

**Description:** *"What is happening on grabient.com in the last 30 minutes.
Answers 'is the site live / did tracking break', not 'which page is popular' —
the realtime schema has no URL dimension, only page TITLE (`unifiedScreenName`).
Dimensions: `unifiedScreenName`, `country`, `city`, `deviceCategory`,
`eventName`, `platform`, `minutesAgo`. Metrics: `activeUsers`, `eventCount`,
`keyEvents`, `screenPageViews`. Separate quota from `ga4`."*

**Input:** `{ dimensions?: string[], metrics?: string[], minutesAgo?: 1..29, limit?: number }`
**Return:** same flat rows + a `meta` with `quota`, minus the fields realtime does
not provide (no `timeZone`, no thresholding flags — the response has no
`metadata` at all).

Separate tool, not a flag on `ga4`, for the reason in §6.

### P2 — `ga4_config` (NEW — blocked on enabling the Admin API)

**Description:** *"How this GA4 property is configured: data streams, registered
custom dimensions and metrics and the event parameters they read, which events
are key events, how channel groups like 'Organic Search' and 'AI Assistant' are
actually defined, and data retention. Use to explain why a field is empty or a
metric looks wrong."*

**Input:** `{}` — one snapshot, no knobs.
**Return:** `{ property: {...}, dataStreams: [...], customDimensions: [...], customMetrics: [...], keyEvents: [...], channelGroups: [...], dataRetention: {...} }`

Deliberately **excluding** two things: Search Console link state (the Admin API
does not expose it **[probed]**) and `measurementProtocolSecrets` (readable with
our scope, but `secretValue` is a live write credential and has no business
crossing an MCP boundary).

One tool rather than five, because these are read together when diagnosing and
essentially never alone. Requires the one-click enablement in §7 and no new
scope. This investigation would have been materially faster with it.

### P2 — fold `batchRunReports` into `loadGa4()` (implementation, not a tool)

`loadGa4()` fires four parallel `runReport`s per dashboard load. One
`batchRunReports` is one round trip against the 10-concurrent limit. Invisible to
agents; strictly better. Not an MCP tool.

### Explicitly NOT proposed

| Not building | Why |
|---|---|
| `ga4_pivot` | An agent can request both dimensions and pivot mentally. The different response envelope (no `rowCount`, `aggregates` instead of `totals`) is real cost for a presentation-layer win. |
| `ga4_compatibility` | `checkCompatibility` 400s on exactly the broken input you would want to debug **[probed]**, and `runReport`'s own error is more specific. Its useful mode (discovery) is better served by `ga4_fields`. |
| `ga4_quota` | Folded into `meta.quota` on every response. A standalone tool would be called never or obsessively. |
| `ga4_audiences` / audience exports | We have no audiences, and it returns user-level identifiers — precisely what `mcp.ts`'s "aggregate-only" rule forbids. |
| `ga4_funnel` | v1alpha, breaking changes expected, and every custom event is already a key event so the funnel would be noise. Revisit if key events get curated. |
| A GA4-Search-Console tool | Blocked (§8). Once the link is fixed it needs **no new tool** — the four `organicGoogleSearch*` metrics are just metrics, reachable through `ga4` with `landingPagePlusQueryString`, `country`, `deviceCategory` or a date dimension. The existing `search_console` tool remains the only route to queries. |

### Priority summary

| # | Tool | Status | Effort | Why now |
|---|---|---|---|---|
| 1 | `ga4` — add `orderBy`, `filter`, `compareDays`, `meta` | **exists, extend** | M | Unordered "top pages" is actively misleading |
| 2 | `ga4_fields` | new | S | Prerequisite for trusting a flexible `ga4` |
| 3 | `ga4_realtime` | new | S | Small, self-contained, own quota |
| 4 | `ga4_config` | new | S | Blocked on one click; would have caught two of the three misconfigurations found here |
| — | `batchRunReports` in `loadGa4` | refactor | S | Latency only |

---

## 10. Gotchas

1. **The Search Console link is not active.** `400 "Search Console fields require
   an active link to be used."` **[probed]** — despite the metrics appearing in
   `getMetadata`, and despite the owner clicking Link. Catalogue presence is not
   link state; only a 200 is. Fixing it *is* worth doing — it unlocks organic
   clicks/impressions/CTR/position at **`landingPagePlusQueryString`**
   granularity, joinable with `sessions` and `engagedSessions` in one row — but
   it never yields a **query** dimension. GSC's own API stays the only source for
   queries, and for query × page together.

2. **`endDate: "yesterday"` is not a settled day.** Standard properties refresh
   intraday every 2-6h and processing can move numbers for **24-48h**. Combined
   with strong weekend seasonality **[probed]**, "yesterday vs the day before"
   will manufacture declines. Re-fetch a trailing 3-day window and overwrite.

3. **The property timezone is `America/Los_Angeles`, not UTC** **[probed]**. A
   Worker computing `28daysAgo` from UTC disagrees with GA4 for 7-8 hours a day,
   and `date` dimension values are property-local. Use the relative strings and
   let Google resolve them — as `ga4.ts` already does.

4. **`source` is not `sessionSource`.** Bare attribution dimensions are
   key-event-scoped and go INCOMPATIBLE against `screenPageViews` or
   `activeUsers` **[probed]**. The error does not explain the scope rule.

5. **`activeUsers` ≠ `totalUsers`, `engagementRate` is 0-1, `keyEvents` is a
   float.** `ga4.ts` handles the rate correctly today; anything new must too.

6. **`landingPage` has a large `(not set)` bucket** — 2,982 sessions, 1,393 of
   them Organic Search, with `screenPageViewsPerSession` of **0** **[probed]**.
   These are sessions GA4 could not attribute an entry page to. It is the top row
   of any landing-page report sorted by sessions, and it is not a page. Filter it
   with `emptyFilter` or explain it; never let it rank.

7. **Everything is a key event.** All eight custom events have
   `keyEvents == eventCount` **[probed]**, so `sessionKeyEventRate` and
   `userKeyEventRate` measure roughly "did the user do anything". Any
   conversion-shaped claim built on them is meaningless until key events are
   curated.

8. **Two registered custom dimensions are dead.**
   `customEvent:event_category` and `customEvent:event_label` are 100%
   `(not set)` **[probed]** — nothing sends those parameters. Meanwhile
   `searchTerm` is also 100% empty because we fire `search_query` rather than
   GA4's expected `view_search_results` + `search_term`. We are running 5,242
   site searches a month **[probed]** and capturing none of the terms — the
   single highest-value fix in this document, and it is a tagging change, not an
   API one.

9. **Page cardinality is 15,715 paths / 26,086 with query strings** **[probed]**,
   against a documented `(other)` risk around 500 unique values/day. Nothing has
   been lost yet, but any page-level tool must surface `dataLossFromOtherRow`,
   because when it starts the failure is silent and the totals still look right.

10. **10 concurrent requests, and 10 server errors per hour blocks the
    property.** Token quota is a non-issue at 1 token/report **[probed]**, but an
    unbounded retry loop against 5xx can lock every request to the property for
    the rest of the hour. Cap fan-out; do not retry blindly.

11. **`checkCompatibility` is the weakest of the three signals.** It **400s on
    the exact broken input you want to debug** **[probed]**; `runReport`'s own
    400 names the offending field; and its COMPATIBLE list is computed against
    current integration state, so it **omitted `landingPagePlusQueryString`**
    from the Search Console metrics' compatible set purely because the link is
    down **[probed]** — under-reporting what would work after a fix. Repair from
    the `runReport` error, discover from `getMetadata`, and treat the checker as
    a hint.

12. **Realtime is a different API wearing the same coat.** No `metadata` in the
    response, no `pagePath`, no `dateRanges`, and ~40× the token cost from a
    separate bucket **[probed]**. Generic response-parsing code will throw on it.
