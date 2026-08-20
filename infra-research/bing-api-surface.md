# Bing Webmaster Tools API — complete read/write surface

**Compiled 2026-08-20.** Purpose: define the allow-list for an MCP server that
calls `GET https://ssl.bing.com/webmaster/api.svc/json/{Method}` and reads
`payload.d`.

Every method below was taken from a Microsoft Learn page that was actually
fetched while writing this document. The authoritative enumeration is the
`IWebmasterApi` interface reference:

> https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi?view=bing-webmaster-dotnet

That page lists **62 methods: 36 read (`Get*`) and 26 mutating.** Nothing in
this document is inferred from a client library, a blog post, or from the shape
of a name. Items that could not be confirmed from a Microsoft page are isolated
in [§9 Unverified](#9-unverified--do-not-ship-without-checking) and are not
mixed into the tables.

---

## 1. Transport, auth, and the 2026-08-31 retirement

### The `/json/` endpoint is the survivor — confirmed

Microsoft's banner appears on both the API landing page and the protocols page,
worded identically:

> Legacy SOAP and POX APIs will be retired on August 31, 2026. Migrate to our
> REST APIs to avoid service disruption.

— https://learn.microsoft.com/en-us/bingwebmaster/ and
https://learn.microsoft.com/en-us/bingwebmaster/api-protocols

**The banner names SOAP and POX only. It does not name JSON.** The protocols
page enumerates three protocols — SOAP, POX/HTTP, JSON/HTTP — and documents the
URL format for the latter two:

| Protocol | Format |
| --- | --- |
| POX GET | `https://ssl.bing.com/webmaster/api.svc/pox/METHOD_NAME?apikey=API_KEY&param1=VALUE&...` |
| POX POST | `https://ssl.bing.com/webmaster/api.svc/pox/METHOD_NAME?apikey=API_KEY` |
| JSON GET | `https://ssl.bing.com/webmaster/api.svc/json/METHOD_NAME?apikey=API_KEY&param1=VALUE&...` |
| JSON POST | `https://ssl.bing.com/webmaster/api.svc/json/METHOD_NAME?apikey=API_KEY` |

So JSON/HTTP is the "REST" form being migrated *to*, and the current client is
already on the surviving endpoint. **No transport change is required.**

One caveat worth recording: Microsoft's own linked explainer
(`bing.com/webmasters/help/soap-pox-api-retirement-s0appox01`) is a JavaScript
shell that returns no body to a fetcher, so the retirement page's *own* wording
could not be read directly. The conclusion above rests on the learn.microsoft.com
banner plus the protocols table, both of which were fetched successfully. Trade
press reporting agrees but is secondary — see §9.

### Auth: the API key is unscoped; OAuth has a read-only scope

From https://learn.microsoft.com/en-us/bingwebmaster/getting-access:

> Please note that the API key is generated for a user and not a site and hence
> a user can use the same API key for all their verified sites on Bing Webmaster
> Tools.

> Only one API key can be generated per user.

The key carries the user's full authority across every verified site, with no
read/write distinction. That is exactly why §5's exclusion list matters.

**However — OAuth 2.0 does offer a read-only scope.** From
https://learn.microsoft.com/en-us/bingwebmaster/oauth2:

> 1. Webmaster.read:
>    - Description: Read access to the user's Bing webmaster tool data
> 2. Webmaster.manage:
>    - Description: Read and write access to the user's Bing webmaster tool data

**Recommendation:** if the MCP server can hold an OAuth client, authenticate with
`Webmaster.read` rather than an API key. That makes the write-exclusion list a
defence-in-depth measure enforced by Bing rather than the only thing standing
between a prompt injection and `RemoveSite`. Token endpoints are
`https://www.bing.com/webmasters/oauth/authorize` and
`https://www.bing.com/webmasters/oauth/token`; access tokens expire in ~3599s
and are sent as `Authorization: Bearer <token>`.

Note the OAuth page's own example calls `api.svc` on host **`www.bing.com`**, not
`ssl.bing.com`. Both hosts appear in Microsoft samples; `ssl.bing.com` is used
throughout the method reference pages and is what the current client uses.

### Errors

Failures return **HTTP 400** with a flat body (not wrapped in `d`):

```json
{"ErrorCode":3,"Message":"InvalidApiKey"}
```

`ApiErrorCode` values ([doc](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.apierrorcode?view=bing-webmaster-dotnet)):

| 0 None | 1 InternalError | 2 UnknownError | 3 InvalidApiKey | 4 ThrottleUser | 5 ThrottleHost |
| 6 UserBlocked | 7 InvalidUrl | 8 InvalidParameter | 9 TooManySites | 10 UserNotFound | 11 NotFound |
| 12 AlreadyExists | 13 NotAllowed | 14 NotAuthorized | 15 UnexpectedState | 16 Deprecated | |

`ThrottleUser` (4) and `ThrottleHost` (5) are the throttling signals. A client
should treat both as retry-with-backoff, and `Deprecated` (16) as permanent.

### The JSON string-quoting gotcha

This is the single most likely thing to get wrong. In the `/json/` samples,
**string arguments other than `siteUrl` are wrapped in literal double quotes and
have their slashes backslash-escaped**, then percent-encoded. Compare the two
forms Microsoft shows for the same argument:

```
POX : ...GetUrlLinks?siteUrl=http://example.com&link=http://example.com%2furl1.html&page=0
JSON: ...GetUrlLinks?siteUrl=http://example.com&link=%22http%3a%5c%2f%5c%2fexample.com%5c%2furl1.html%22&page=0
```

`%22` is `"`, `%5c%2f` is `\/`. So the JSON wire value is the *JSON literal*
`"http:\/\/example.com\/url1.html"`, URL-encoded. This pattern is consistent
across `link`, `url`, `query`, `page` (the URL-valued one) and `feedUrl` samples.
`siteUrl` is shown unquoted in most samples — and percent-encoded-but-unquoted on
the `GetQueryParameters` page. The docs give no rule for the inconsistency; a
client should be prepared to try both.

---

## 2. READ methods — group A: `siteUrl` only

These take exactly one parameter plus `apikey`. Safe, simple, and the natural
core of an allow-list. All are `WebGet` (HTTP GET).

| Method | Returns | Doc-confirmed JSON GET sample? | Doc URL |
| --- | --- | --- | --- |
| `GetRankAndTrafficStats` | `List<RankAndTrafficStats>` | yes | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getrankandtrafficstats?view=bing-webmaster-dotnet) |
| `GetQueryStats` | `List<QueryStats>` | yes | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getquerystats?view=bing-webmaster-dotnet) |
| `GetPageStats` | `List<QueryStats>` | yes | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getpagestats?view=bing-webmaster-dotnet) |
| `GetCrawlStats` | `List<CrawlStats>` | yes | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getcrawlstats?view=bing-webmaster-dotnet) |
| `GetCrawlIssues` | `List<UrlWithCrawlIssues>` | yes | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getcrawlissues?view=bing-webmaster-dotnet) |
| `GetUrlSubmissionQuota` | `UrlSubmissionQuota` | yes | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.geturlsubmissionquota?view=bing-webmaster-dotnet) |
| `GetContentSubmissionQuota` | `ContentSubmissionQuota` | yes | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getcontentsubmissionquota?view=bing-webmaster-dotnet) |
| `GetFeeds` | `List<Feed>` | yes | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getfeeds?view=bing-webmaster-dotnet) |
| `GetQueryParameters` | `List<QueryParameter>` | yes | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getqueryparameters?view=bing-webmaster-dotnet) |
| `GetCrawlSettings` | `CrawlSettings` | yes | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getcrawlsettings?view=bing-webmaster-dotnet) |
| `GetBlockedUrls` | `List<BlockedUrl>` | **no** — see §10 | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getblockedurls?view=bing-webmaster-dotnet) |
| `GetCountryRegionSettings` | `List<CountryRegionSettings>` | no sample on page | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getcountryregionsettings?view=bing-webmaster-dotnet) |
| `GetFetchedUrls` | `List<FetchedUrl>` | no sample on page | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getfetchedurls?view=bing-webmaster-dotnet) |
| `GetSiteMoves` | `List<SiteMoveSettings>` | no sample on page | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getsitemoves?view=bing-webmaster-dotnet) |
| `GetActivePagePreviewBlocks` | `List<Shared.DataContracts.PagePreview>` | no sample on page | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getactivepagepreviewblocks?view=bing-webmaster-dotnet) |
| `GetConnectedPages` | `List<Shared.DataContracts.ConnectedSite>` | no sample on page | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getconnectedpages?view=bing-webmaster-dotnet) |
| `GetDeepLinkBlocks` | `List<Shared.DataContracts.DeepLinkBlock>` | no sample on page | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getdeeplinkblocks?view=bing-webmaster-dotnet) |
| `GetDeepLinkAlgoUrls` | `List<DeepLinkAlgoUrl>` | yes — but **`[Obsolete("no longer in use", true)]`** | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getdeeplinkalgourls?view=bing-webmaster-dotnet) |

Query string for all of these: `?siteUrl={site}&apikey={key}`.

Four methods (`GetActivePagePreviewBlocks`, `GetConnectedPages`,
`GetDeepLinkBlocks`, `GetSiteMoves`) have **no Examples section at all** on
Microsoft Learn — no request URL, no response body. Their signatures are
confirmed, their wire format is not. Three of them return types in the
`Microsoft.Bing.Webmaster.Shared.DataContracts` namespace which has no published
reference page. Treat their response parsing as exploratory.

---

## 3. READ methods — group B: `siteUrl` plus extra parameters

| Method | Extra params (exact names / types) | Returns | Doc URL |
| --- | --- | --- | --- |
| `GetPageQueryStats` | `page` : String — a **page URL** | `List<QueryStats>` | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getpagequerystats?view=bing-webmaster-dotnet) |
| `GetQueryPageStats` | `query` : String | `List<QueryStats>` | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getquerypagestats?view=bing-webmaster-dotnet) |
| `GetQueryPageDetailStats` | `query` : String, `page` : String | `List<DetailedQueryStats>` | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getquerypagedetailstats?view=bing-webmaster-dotnet) |
| `GetQueryTrafficStats` | `query` : String | `List<RankAndTrafficStats>` | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getquerytrafficstats?view=bing-webmaster-dotnet) |
| **`GetLinkCounts`** | `page` : **Int16** — a **page *number***, 0-based | `LinkCounts` | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getlinkcounts?view=bing-webmaster-dotnet) |
| **`GetUrlLinks`** | `link` : String, `page` : **Int16** (page number) | `LinkDetails` | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.geturllinks?view=bing-webmaster-dotnet) |
| `GetUrlInfo` | `url` : String | `UrlInfo` | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.geturlinfo?view=bing-webmaster-dotnet) |
| `GetUrlTrafficInfo` | `url` : String | `UrlTrafficInfo` | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.geturltrafficinfo?view=bing-webmaster-dotnet) |
| `GetChildrenUrlTrafficInfo` | `url` : String, `page` : **UInt16** (page number) | `List<UrlTrafficInfo>` | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getchildrenurltrafficinfo?view=bing-webmaster-dotnet) |
| `GetChildrenUrlInfo` ⚠️ **POST** | `url` : String, `page` : UInt16, `filterProperties` : FilterProperties | `List<UrlInfo>` | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getchildrenurlinfo?view=bing-webmaster-dotnet) |
| `GetFeedDetails` | `feedUrl` : String | `List<Feed>` | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getfeeddetails?view=bing-webmaster-dotnet) |
| `GetFetchedUrlDetails` | `url` : String | `FetchedUrlDetails` | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getfetchedurldetails?view=bing-webmaster-dotnet) |
| `GetSiteRoles` | `includeAllSubdomains` : Boolean | `List<SiteRoles>` | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getsiteroles?view=bing-webmaster-dotnet) |
| `GetDeepLink` | `url` : String | `List<DeepLink>` — **`[Obsolete("use GetDeepLinkBlocks", true)]`** | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getdeeplink?view=bing-webmaster-dotnet) |

### Two traps in this table

**`page` means two different things.** On `GetPageQueryStats` and
`GetQueryPageDetailStats`, `page` is a **URL string**. On `GetLinkCounts`,
`GetUrlLinks`, `GetChildrenUrlInfo` and `GetChildrenUrlTrafficInfo`, `page` is a
**0-based page index** (`Int16`/`UInt16`). Same parameter name, incompatible
types. A generic parameter-passing layer will silently produce garbage here.

**`GetChildrenUrlInfo` is the one read method that is not a GET.** Its attribute
is `WebInvoke(..., Method="POST")`, not `WebGet`. Microsoft's sample:

```
POST /webmaster/api.svc/json/GetChildrenUrlInfo?apikey=sampleapikeyedecc1ea4ae341cc8b6 HTTP/1.1
Content-Type: application/json; charset=utf-8
Host: ssl.bing.com

{
"siteUrl":"http://example.com",
"url":"example.com",
"page":0,
"filterProperties":
{
"__type":"FilterProperties:#Microsoft.Bing.Webmaster.Api",
"CrawlDateFilter":1,
"DiscoveredDateFilter":0,
"DocFlagsFilters":0,
"HttpCodeFilters":0
}
}
```

If the allow-list is implemented as "GET-only", this method is excluded by
construction — which is fine, but should be a deliberate decision rather than a
surprise. Note also that a naive "POST implies mutation" heuristic would
misclassify it; and conversely, `SubmitUrl` is *also* a POST. Method identity,
not HTTP verb, must drive the allow-list.

`GetUrlInfo`, `GetUrlTrafficInfo` and `GetChildrenUrlInfo` all carry the remark:

> "domain:" prefix can be used to get information for domain. For example: domain:bing.com

---

## 4. READ methods — group C: no `siteUrl` at all

These four are account-level or site-independent. Worth calling out because a
client that unconditionally appends `&siteUrl=` will break them.

| Method | Params | Returns | Doc URL |
| --- | --- | --- | --- |
| `GetUserSites` | *(none)* | `List<Site>` | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getusersites?view=bing-webmaster-dotnet) |
| `GetKeyword` | `q`, `country`, `language` : String; `startDate`, `endDate` : DateTime | `Keyword` | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getkeyword?view=bing-webmaster-dotnet) |
| `GetKeywordStats` | `q`, `country`, `language` : String | `List<KeywordStats>` | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getkeywordstats?view=bing-webmaster-dotnet) |
| `GetRelatedKeywords` | `q`, `country`, `language` : String; `startDate`, `endDate` : DateTime | `List<Keyword>` | [link](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getrelatedkeywords?view=bing-webmaster-dotnet) |

`GetUserSites` is the account-listing method requested — confirmed, zero
parameters, returns every site with its verification state. Endpoint:
`GET /webmaster/api.svc/json/GetUserSites?apikey={key}`.

**The three keyword-research methods are true keyword research** — they take a
query and a market, not a site, so they return Bing's own impression volumes
rather than your site's. That makes them the closest thing Bing offers to a
keyword-volume API, and Google Search Console has no equivalent.

**But none of the three has a JSON request or response sample on Microsoft
Learn.** The signatures are confirmed; the wire format is not. Specifically
undocumented: how `startDate`/`endDate` are serialised in a query string
(`.NET DateTime` has no canonical query-string form), and what `country` /
`language` expect (ISO codes? Bing market strings like `en-US`?). See §9.

---

## 5. WRITE / MUTATING METHODS — EXCLUDE ALL 26

**None of these may be reachable from the MCP server.** The API key is per-user
and unscoped: any of these called with a valid key will take effect on any
verified site in the account, with no confirmation step and no undo for most.
`RemoveSite` and `RemoveSiteRole` in particular are destructive to the account
itself, not just to data.

All 26 are named on the `IWebmasterApi` interface page cited at the top.

### Destructive — removes or revokes

| Method | Signature | What it does |
| --- | --- | --- |
| `RemoveSite` | `(String siteUrl)` | **Removes a site from the account entirely** |
| `RemoveSiteRole` | `(String siteUrl, SiteRoles siteRoles)` | Revokes a user's access to a site |
| `RemoveFeed` | `(String siteUrl, String feedUrl)` | Deletes a submitted sitemap/feed |
| `RemoveBlockedUrl` | `(String siteUrl, BlockedUrl blockedUrl)` | Unblocks a page/directory |
| `RemoveQueryParameter` | `(String siteUrl, String queryParameter)` | Deletes a URL-normalisation rule |
| `RemoveCountryRegionSettings` | `(String siteUrl, CountryRegionSettings settings)` | Deletes geo-targeting config |
| `RemoveDeepLinkBlock` | `(String siteUrl, String, String, String)` | Removes a deep-link block |
| `RemovePagePreviewBlock` | `(String siteUrl, String url)` | Removes a page-preview block |

### Blocks and suppresses content from search

| Method | Signature | What it does |
| --- | --- | --- |
| `AddBlockedUrl` | `(String siteUrl, BlockedUrl blockedUrl)` | **Blocks a page/directory from Bing** |
| `AddPagePreviewBlock` | `(String siteUrl, String url, BlockReason reason)` | Suppresses page preview |
| `AddDeepLinkBlock` | `(String siteUrl, String, String, String)` | Blocks a deep link |

### Submits content to Bing

| Method | Signature | What it does |
| --- | --- | --- |
| `SubmitUrl` | `(String siteUrl, String url)` | Submits one URL for indexing — consumes quota |
| `SubmitUrlBatch` | `(String siteUrl, List<String> urlList)` | Batch submit — consumes quota fast |
| `SubmitContent` | `(String siteUrl, String url, String httpMessage, String structuredData, Int32 dynamicServing)` | Submits page content directly |
| `SubmitFeed` | `(String siteUrl, String feedUrl)` | Submits a sitemap |
| `SubmitSiteMove` | `(String siteUrl, SiteMoveSettings settings)` | **Declares a site migration** — affects ranking |
| `FetchUrl` | `(String siteUrl, String url)` | Triggers a live fetch (action, not a read) |

### Changes account, access, or crawl configuration

| Method | Signature | What it does |
| --- | --- | --- |
| `AddSite` | `(String siteUrl)` | Adds a site to the account |
| `VerifySite` | `(String siteUrl)` | Attempts verification |
| `AddSiteRoles` | `(String siteUrl, String, String, String, Boolean, Boolean)` | **Delegates site access to another user** |
| `SaveCrawlSettings` | `(String siteUrl, CrawlSettings crawlSettings)` | **Changes crawl rate** — can throttle Bingbot to near-zero |
| `AddQueryParameter` | `(String siteUrl, String queryParameter)` | Adds URL-normalisation rule |
| `EnableDisableQueryParameter` | `(String siteUrl, String queryParameter, Boolean isEnabled)` | Toggles a normalisation rule |
| `AddCountryRegionSettings` | `(String siteUrl, CountryRegionSettings settings)` | Sets geo-targeting |
| `AddConnectedPage` | `(String siteUrl, String url)` | Registers a connected page |
| `UpdateDeepLink` | `(String siteUrl, String, String, DeepLink.DeepLinkWeight)` | Changes deep-link weight — `[Obsolete]` |

### Highest-blast-radius subset

If only a short denylist is practical, these five are the ones that cause damage
that cannot be undone by re-running an API call: `RemoveSite`, `AddSiteRoles`,
`RemoveSiteRole`, `SaveCrawlSettings`, `SubmitSiteMove`.

---

## 6. Pagination and limits

### What pages

Only four methods paginate, and all use a **0-based `page` integer**:

| Method | Type | Total-pages field |
| --- | --- | --- |
| `GetLinkCounts` | `Int16` | `d.TotalPages` |
| `GetUrlLinks` | `Int16` | `d.TotalPages` |
| `GetChildrenUrlInfo` | `UInt16` | *(none — response is a bare array)* |
| `GetChildrenUrlTrafficInfo` | `UInt16` | *(none — response is a bare array)* |

Microsoft's own loop idiom, from the `GetLinkCounts` page:

```csharp
LinkCounts linkCounts;
short page = 0;
do
{
    linkCounts = api.GetLinkCounts("http://example.com/", page);
    foreach (var link in linkCounts.Links)
    {
        Console.WriteLine("{0} {1}", link.Url, link.Count);
    }
} while (++page < linkCounts.TotalPages);
```

The two `GetChildren*` methods expose no total-page count, so the only
termination signal is an empty array. Loop with a hard cap.

**Every other read method is unpaginated** and returns whatever Bing considers
the top slice. `GetQueryStats`, `GetPageStats` and `GetCrawlIssues` all return a
single unbounded list with no offset parameter — you get what you get.

### Page size — NOT DOCUMENTED

**No Microsoft page states the page size for any paginating method.** Neither
the method pages nor the `TotalPages` property pages give a number. Do not
hardcode one; derive counts from the returned array length. See §9.

### Rate limits — NOT DOCUMENTED numerically

There is no published requests-per-second figure. What *is* confirmed is that
throttling exists and is signalled: `ApiErrorCode.ThrottleUser` (4) and
`ThrottleHost` (5). Implement exponential backoff on both. The commonly cited
"5 calls/second" figure is a third-party client's default, not Microsoft
guidance — see §9.

### Quotas that ARE documented

These are *submission* quotas, readable via the two quota methods, and they cap
the write methods you are excluding anyway:

- `GetUrlSubmissionQuota` → `{DailyQuota, MonthlyQuota}` (sample: 5 / 24)
- `GetContentSubmissionQuota` → `{DailyQuota, MonthlyQuota}` (sample: 100 / 3000)

Sample values are illustrative; real quotas vary per site.

### Data freshness (from Remarks sections)

| Method | Documented refresh |
| --- | --- |
| `GetRankAndTrafficStats` | "The data will be updated every day." |
| `GetQueryTrafficStats` | "updated every day. Only top-queries will be saved and returned" |
| `GetCrawlStats` | "The data will be updated every day." — returns last 6 months |
| `GetQueryStats`, `GetPageStats`, `GetPageQueryStats`, `GetQueryPageStats`, `GetQueryPageDetailStats` | "The data will be updated every week." |
| `GetCrawlIssues` | "It may take a few days before fixed issue will disappear from this list." |

`GetRankAndTrafficStats` additionally notes:

> The traffic data includes Impressions and Clicks from all verticals i.e. Web,
> Chat, News, Images, Videos and Knowledge Panel from March 24th, 2023 onwards.

That is significant for interpretation: Bing's impression counts are **not**
web-search-only and are not comparable to GSC's like-for-like.

---

## 7. Response shapes

All successful responses wrap the payload in `d`. `d` is an **array** for
`List<T>` returns and a **single object** for scalar returns — the tables in §2–§4
say which. Every object carries a `__type` discriminator
(e.g. `"__type":"QueryStats:#Microsoft.Bing.Webmaster.Api"`), which a parser
should ignore.

**Dates are WCF format**: `/Date(1316156400000-0700)/` — milliseconds since Unix
epoch, followed by a signed four-digit offset. Some values omit the offset
entirely (`/Date(1314031258933)/` appears in the `GetQueryParameters` sample), so
the offset must be treated as optional. Parse with
`/^\/Date\((-?\d+)([+-]\d{4})?\)\/$/`.

### Backlinks — the highest-value shapes

`GetLinkCounts` → **object**:

```json
{"d":{
  "__type":"LinkCounts:#Microsoft.Bing.Webmaster.Api",
  "Links":[
    {"__type":"LinkCount:#Microsoft.Bing.Webmaster.Api",
     "Count":14,
     "Url":"http://example.com/page1.html"}],
  "TotalPages":3
}}
```

`Links[]` is *your* pages, with how many inbound links each has. `Url` is the
**target** page on your site; `Count` is the number of links pointing at it.

`GetUrlLinks` → **object**:

```json
{"d":{
  "__type":"LinkDetails:#Microsoft.Bing.Webmaster.Api",
  "Details":[
    {"__type":"LinkDetail:#Microsoft.Bing.Webmaster.Api",
     "AnchorText":"link",
     "Url":"http://example.com/page1.html"}],
  "TotalPages":3
}}
```

Here `Url` is the **source** page linking *to* you, and `AnchorText` is the
anchor. This is the actual backlink list — referring URL plus anchor text.
Google Search Console exposes no equivalent through any API, so this is the
single largest capability gain available. Note the field is `Details`, not
`Links`; the two link methods do not share a wrapper shape.

⚠️ There is a **credible unresolved report that both methods return empty
results for a verified site** (July 2026) — see §9 before promising this data.

### Traffic and query stats

`QueryStats` — returned by `GetQueryStats`, `GetPageStats`, `GetPageQueryStats`,
`GetQueryPageStats`. Array in `d`:

```json
{"d":[{
  "__type":"QueryStats:#Microsoft.Bing.Webmaster.Api",
  "AvgClickPosition":18,
  "AvgImpressionPosition":17,
  "Clicks":15,
  "Date":"/Date(1316156400000-0700)/",
  "Impressions":100,
  "Query":"query"
}]}
```

⚠️ **For `GetPageStats`, the `Query` field holds a page URL, not a query.**
Microsoft's XML sample for that method literally shows `<Query>PageURL</Query>`
while its JSON sample (inconsistently) still shows `"Query":"query"`. Same
struct, overloaded field. Rename it on the way out or the tool output will be
misleading.

`RankAndTrafficStats` — `GetRankAndTrafficStats`, `GetQueryTrafficStats`. Array:

```json
{"d":[{
  "__type":"RankAndTrafficStats:#Microsoft.Bing.Webmaster.Api",
  "Clicks":15,
  "Date":"/Date(1316156400000-0700)/",
  "Impressions":100
}]}
```

No position fields — clicks and impressions only.

`DetailedQueryStats` — `GetQueryPageDetailStats`. Array. This is the one that
carries a single concrete `Position`:

```json
{"d":[{
  "__type":"DetailedQueryStats:#Microsoft.Bing.Webmaster.Api",
  "Clicks":15,
  "Date":"/Date(1316156400000-0700)/",
  "Impressions":100,
  "Position":5
}]}
```

### Crawl

`CrawlStats` — array, one entry per day, last 6 months:

```json
{"d":[{
  "__type":"CrawlStats:#Microsoft.Bing.Webmaster.Api",
  "AllOtherCodes":0,
  "BlockedByRobotsTxt":0,
  "Code2xx":9998,
  "Code301":0,
  "Code302":0,
  "Code4xx":1,
  "Code5xx":1,
  "ContainsMalware":5,
  "CrawlErrors":0,
  "CrawledPages":0,
  "Date":"/Date(1316156400000-0700)/",
  "InIndex":1000,
  "InLinks":2048
}]}
```

`InIndex` and `InLinks` are the index-coverage and total-backlink counters —
useful as a cheap daily time series without paginating the link methods.

`UrlWithCrawlIssues` — array:

```json
{"d":[{
  "__type":"UrlWithCrawlIssues:#Microsoft.Bing.Webmaster.Api",
  "HttpCode":200,
  "Issues":32,
  "Url":"http://example.com/url1.htm",
  "InLinks":10
}]}
```

⚠️ **`Issues` is a bitmask integer in JSON, not a string.** The XML sample shows
`ContainsMalware`; the JSON sample shows `32`. Decode with the flags table in §8.

### Index / URL info

`UrlInfo` — **object** for `GetUrlInfo`, **array** for `GetChildrenUrlInfo`:

```json
{"d":{
  "__type":"UrlInfo:#Microsoft.Bing.Webmaster.Api",
  "AnchorCount":50,
  "DiscoveryDate":"/Date(1315349995266-0700)/",
  "DocumentSize":0,
  "HttpStatus":0,
  "IsPage":false,
  "LastCrawledDate":"/Date(1316213995266-0700)/",
  "TotalChildUrlCount":100,
  "Url":"example.com"
}}
```

`UrlTrafficInfo` — object for `GetUrlTrafficInfo`, array for
`GetChildrenUrlTrafficInfo`:

```json
{"d":{
  "__type":"UrlTrafficInfo:#Microsoft.Bing.Webmaster.Api",
  "Clicks":10,
  "Impressions":100,
  "IsPage":false,
  "Url":"example.com"
}}
```

### Account and config

`Site` — `GetUserSites`. Array:

```json
{"d":[{
  "__type":"Site:#Microsoft.Bing.Webmaster.Api",
  "AuthenticationCode":"258CAD36B9EEE22F1CFDEB4C239D26BB",
  "DnsVerificationCode":"258cad36b9eee22f1cfdeb4c239d26bb.example.com",
  "IsVerified":false,
  "Url":"http://example.com"
}]}
```

⚠️ This response contains **verification secrets**. `AuthenticationCode` and
`DnsVerificationCode` are the tokens that prove site ownership. An MCP tool that
returns raw `GetUserSites` output pipes them into a model context and any
transcript store. **Strip both fields** and return only `Url` and `IsVerified`.

`SiteRoles` — `GetSiteRoles`. Array. Also sensitive (email addresses):

```json
{"d":[{
  "__type":"SiteRoles:#Microsoft.Bing.Webmaster.Api",
  "Date":"/Date(1316645995221-0700)/",
  "DelegatedCode":"258CAD36B9EEE22F1CFDEB4C239D26BB",
  "DelegatedCodeOwnerEmail":"webmaster@example.com",
  "DelegatorEmail":"webmaster@example.com",
  "Email":"webmaster@example.com",
  "Expired":false,
  "Role":2,
  "Site":"http://host1.example.com",
  "VerificationSite":"http://example.com"
}]}
```

`Role` is numeric in JSON (`2`), the enum name in XML (`ReadWrite`).

`Feed` — `GetFeeds` / `GetFeedDetails`. Array:

```json
{"d":[{
  "__type":"Feed:#Microsoft.Bing.Webmaster.Api",
  "Compressed":false,
  "FileSize":1024,
  "LastCrawled":"/Date(1315781995040-0700)/",
  "Status":"Success",
  "Submitted":"/Date(1316213995040-0700)/",
  "Type":"Sitemap",
  "Url":"http://example.com/sitemap.xml",
  "UrlCount":1023
}]}
```

`QueryParameter` — `GetQueryParameters`. Array:

```json
{"d":[{
  "__type":"QueryParameter:#Microsoft.Bing.Webmaster.Api",
  "Date":"/Date(1314031258933)/",
  "IsEnabled":false,
  "Parameter":"cart",
  "Source":1
}]}
```

`CrawlSettings` — `GetCrawlSettings`. Object. `CrawlRate` is a 24-element array,
one slot per hour:

```json
{"d":{
  "__type":"CrawlSettings:#Microsoft.Bing.Webmaster.Api",
  "AjaxEnabled":true,
  "CrawlRate":[5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5]
}}
```

Quota objects — both `GetUrlSubmissionQuota` and `GetContentSubmissionQuota`
return an object with exactly `DailyQuota` and `MonthlyQuota`.

### Field names known only from the class reference (no JSON sample)

These come from the Properties tables on the class pages, which give names but
not JSON samples. Names are reliable; JSON serialisation is by WCF convention:

- **`FetchedUrl`** (`GetFetchedUrls`): `Date`, `Expired`, `Fetched`, `Url`
- **`FetchedUrlDetails`** (`GetFetchedUrlDetails`): `Date`, `Document`, `Headers`, `Status`, `Url`
- **`CountryRegionSettings`**: `Date`, `TwoLetterIsoCountryCode`, `Type`, `Url`
- **`BlockedUrl`** (`GetBlockedUrls`): `Date`, `DaysToExpire`, `EntityType`, `RequestType`, `Url`
- **`Keyword`** (`GetKeyword`, `GetRelatedKeywords`): `BroadImpressions`, `Impressions`, `Query`
- **`KeywordStats`** (`GetKeywordStats`): `BroadImpressions`, `Date`, `Impressions`, `Query`

---

## 8. Enum decode tables

`UrlWithCrawlIssues.CrawlIssues` — **`[Flags]`**, combine bitwise.
[doc](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.urlwithcrawlissues.crawlissues?view=bing-webmaster-dotnet)

| Value | Name |
| --- | --- |
| 0 | None |
| 1 | Code301 |
| 2 | Code302 |
| 4 | Code4xx |
| 8 | Code5xx |
| 16 | BlockedByRobotsTxt |
| 32 | ContainsMalware |
| 64 | ImportantUrlBlockedByRobotsTxt |
| 128 | DnsErrors |
| 256 | TimeOutErrors |

`SiteRoles.UserRole`: `0 Administrator`, `1 ReadOnly`, `2 ReadWrite`.
[doc](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.siteroles.userrole?view=bing-webmaster-dotnet)

`FilterProperties` (for `GetChildrenUrlInfo`) has four fields, all sent as
integers in JSON:

- `CrawlDateFilter`: `0 Any`, `1 LastWeek`, `2 LastTwoWeeks`, `4 LastThreeWeeks` — [doc](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.crawldatefilter?view=bing-webmaster-dotnet)
- `DiscoveredDateFilter`: `0 Any`, `1 LastWeek`, `2 LastMonth` — [doc](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.discovereddatefilter?view=bing-webmaster-dotnet)
- `DocFlagsFilters` `[Flags]`: `0 Any`, `1 IsBlockedByRobotsTxt`, `2 IsMalware` — [doc](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.docflagsfilters?view=bing-webmaster-dotnet)
- `HttpCodeFilters` `[Flags]`: `0 Any`, `1 Code2xx`, `2 Code3xx`, `4 Code301`, `8 Code302`, `16 Code4xx`, `32 Code5xx`, `64 AllOthers` — [doc](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.httpcodefilters?view=bing-webmaster-dotnet)

---

## 9. Known gaps — visible in the UI, NO API equivalent

The point of this section is so a tool can say **"cannot be checked
programmatically"** rather than reporting an API silence as a zero.

### AI Performance report — CONFIRMED no API

Previously established 2026-08-17; re-confirmed here by two independent means:

1. **The `IWebmasterApi` interface enumerates all 62 methods and contains
   nothing AI-related.** No `GetAiPerformance`, no citation method, nothing in
   the namespace's 30 classes resembling AI citation data. Since that page is
   the complete contract, absence there is dispositive.
2. A Microsoft Q&A thread asking exactly this
   ([link](https://learn.microsoft.com/en-us/answers/questions/5780844/bing-webmaster-tools-ai-performance-report-is-ther),
   asked 2026-02-19) concludes no API exists. **Caveat on provenance:** the
   answer is from an Independent Advisor, not Microsoft staff — it is
   corroboration, not an official statement. Point 1 is the real evidence.

The report launched as public preview in February 2026 and covers Copilot and
Bing AI-answer citations. Reporting is UI-only at
`bing.com/webmasters/aiperformance`. **A tool asked about AI citations must say
the data is not retrievable, never report zero.**

### Other UI features with no method on the interface

Checked against the full 62-method list — no corresponding method exists for any
of these:

- **Search Performance date-range and dimension filtering.** The API returns
  fixed windows only. There is no `startDate`/`endDate` on `GetQueryStats`,
  `GetPageStats` or `GetRankAndTrafficStats` (only the three site-independent
  keyword methods take dates). No country, device, or search-type dimension is
  exposed. The UI offers all of these.
- **Robots.txt tester** — no method.
- **URL Inspection** in the GSC sense (live render, indexability verdict,
  structured-data validation). `GetUrlInfo` returns index metadata only;
  `FetchUrl` is a write-side action.
- **Site Explorer** tree browsing — partially covered by `GetChildrenUrlInfo`,
  but that is the POST method and its filter semantics are thinly documented.
- **Markup / structured-data validator** — no method.
- **Backlinks "similar sites" comparison** — `GetLinkCounts` / `GetUrlLinks`
  return your own backlinks only; the UI's competitor comparison has no method.
- **IndexNow submission stats.** IndexNow is a separate protocol
  (`bing.com/webmasters/url-submission-api`) and its reporting is not on this
  interface.

### A real gap that is *not* a gap

Backlinks. Worth stating plainly since it drove this research: **Bing does
expose backlink data via API** — `GetLinkCounts` and `GetUrlLinks`, both
confirmed with full signatures and response shapes in §3 and §7 — and Google
Search Console does not. Subject to the empty-results caveat below.

---

## 10. Documentation defects found (Microsoft's, not ours)

Four of the pages consulted contain copy-paste errors. Recording them so nobody
"corrects" this document back toward the broken source:

1. **`GetBlockedUrls`** — its "JSON request sample" is actually a `POST` to
   **`AddBlockedUrl`** with a request body. There is no `GET .../GetBlockedUrls`
   sample anywhere on the page. Its JSON response sample is the degenerate
   `{"d":null}`, exposing no field names. Anyone copying that sample would call
   a *write* method by accident — directly relevant to this exercise.
2. **`GetRelatedKeywords`** — the entire Examples section shows **`GetSiteRoles`**
   samples. (Usefully, this gave a second independent copy of the `GetSiteRoles`
   JSON, which matched the one on the `GetSiteRoles` page itself.)
3. **`GetRankAndTrafficStats`** — the XML request sample shows
   `GetQueryTrafficStats`. The JSON sample on that page is correct.
4. **`GetPageStats`** — XML sample shows `<Query>PageURL</Query>`, JSON sample
   shows `"Query":"query"`. The XML one reflects reality; see §7.

Also inconsistent: `siteUrl` is percent-encoded on the `GetQueryParameters`
sample and raw on others, with no stated rule.

---

## 11. UNVERIFIED — do not ship without checking

Everything here is either absent from Microsoft docs or sourced from
non-Microsoft material. **None of it belongs in the allow-list on this evidence
alone.**

### Method names that do NOT appear on the interface

- **`GetLinksToSite`** — mentioned by a user in a Microsoft Q&A thread. **It is
  not on the `IWebmasterApi` interface page.** Treat as nonexistent or
  long-removed. Flagged specifically because it is the kind of plausible name
  that gets invented.
- No method named `GetLinkDetails`, `GetBacklinks`, `GetTopLinks`, or similar
  exists. The only two link methods are `GetLinkCounts` and `GetUrlLinks`.

### Unknown wire formats (signature confirmed, serialisation not)

- **`GetKeyword` / `GetKeywordStats` / `GetRelatedKeywords`** — no JSON sample on
  any of the three pages. Unknown: query-string serialisation of the
  `startDate` / `endDate` `DateTime` params, and the expected form of `country`
  and `language`. Must be determined empirically before exposing as tools.
- **`GetActivePagePreviewBlocks`, `GetConnectedPages`, `GetDeepLinkBlocks`,
  `GetSiteMoves`, `GetFetchedUrls`, `GetFetchedUrlDetails`,
  `GetCountryRegionSettings`** — no Examples section on their pages. Signatures
  confirmed; response field names for the first three come from a namespace
  (`Microsoft.Bing.Webmaster.Shared.DataContracts`) with no published reference.
- **`GetBlockedUrls`** — response field names are inferred from the `BlockedUrl`
  class page, since the method page's own sample is broken (§10).

### Numbers with no Microsoft source

- **Page size for `GetLinkCounts` / `GetUrlLinks`.** Not documented anywhere,
  including on the `TotalPages` property pages. Do not hardcode.
- **"5 calls per second" rate limit.** This is the *default setting of a
  third-party Python client* (`merj/bing-webmaster-tools`), which itself defers
  to Microsoft docs for specifics. It is **not** a published Microsoft limit and
  should not be quoted as one. Only `ThrottleUser` / `ThrottleHost` error codes
  are confirmed.

### Behavioural caveat on the backlink methods — important

An unresolved Microsoft Q&A thread from **2026-07-06**
([link](https://learn.microsoft.com/en-us/answers/questions/5939109/bing-webmaster-tools-api-getlinkcounts-and-geturll))
reports that for a verified site:

> GetLinkCounts returns HTTP 200, but the response contains `<Links/>` and
> `TotalPages=0`. GetUrlLinks returns HTTP 200, but the response contains
> `<Details/>` and `TotalPages=0`.

The responder is Microsoft External Staff acting as a community moderator and
explicitly states they cannot verify service-side behaviour; the thread was not
resolved and the user was directed to open a support ticket. **Status: one
unconfirmed report, not a known-broken finding.** But since backlinks are the
headline reason to add this API, verify against the real key and site *before*
building anything on top — and make the tool distinguish "Bing returned zero
links" from "Bing returned no data", because on this evidence they may not be
the same thing.

### Retirement page not directly read

`bing.com/webmasters/help/soap-pox-api-retirement-s0appox01` is client-rendered
and returned no body. The SOAP/POX-only scope of the retirement is established
from the learn.microsoft.com banner plus the protocols table (§1), which is
sufficient — but the primary notice itself was not read. Trade coverage
(Search Engine Roundtable and others) reports that the JSON/HTTP REST API is the
migration target, that API keys carry over unchanged, and that there is no grace
period. That is consistent with the Microsoft pages but is **secondary
sourcing**, recorded here rather than in §1.

---

## 12. Recommended allow-list

Starting from the current five, the defensible additions — full signature,
confirmed JSON GET sample, and a parseable response shape:

**Add (high value, fully documented):**
`GetUserSites` (strip `AuthenticationCode` / `DnsVerificationCode`),
`GetLinkCounts`, `GetUrlLinks`, `GetPageQueryStats`, `GetQueryPageStats`,
`GetQueryPageDetailStats`, `GetQueryTrafficStats`, `GetCrawlIssues`,
`GetUrlInfo`, `GetUrlTrafficInfo`, `GetFeeds`, `GetContentSubmissionQuota`.

**Add if useful, lower value:** `GetChildrenUrlTrafficInfo`, `GetFeedDetails`,
`GetQueryParameters`, `GetCrawlSettings`, `GetSiteRoles` (contains email
addresses — redact).

**Hold pending empirical checks (§9):** the three keyword methods,
`GetChildrenUrlInfo` (POST), and the seven sample-less methods.

**Never:** all 26 in §5.

Implementation notes that follow from the above: allow-list by **method name**,
not HTTP verb (`GetChildrenUrlInfo` is a POST read; `SubmitUrl` is a POST write).
Prefer OAuth `Webmaster.read` over the unscoped API key. Handle the JSON
quote-and-escape convention for string arguments. Parse `/Date(...)/ ` with the
offset optional. Decode `Issues` as a bitmask. Rename `QueryStats.Query` when it
comes from `GetPageStats`.
