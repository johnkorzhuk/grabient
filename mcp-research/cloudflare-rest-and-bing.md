# Cloudflare REST (non-GraphQL) + Bing Webmaster Tools — MCP surface map

Research date: **2026-08-16**. Target: extending the private analytics MCP server
in `apps/admin/src/mcp.ts` (already serving `brief`, `search_console`, `ga4`,
`traffic`, `acquisition`, `url_inspection`, `sitemaps`, `funnel`).

**Scope note.** The Cloudflare **GraphQL** Analytics API is covered by a separate
document and is deliberately *not* duplicated here. Everything below is REST or a
non-Cloudflare API. Where the honest answer to "can I read X?" is "only via
GraphQL", this doc says so and stops.

## How the endpoint facts here were established

Rather than trusting prose docs, the endpoint tables were generated from
Cloudflare's own machine-readable source of truth:

```
https://raw.githubusercontent.com/cloudflare/api-schemas/main/openapi.json   (~23 MB, 2077 paths)
```

Every operation in that spec carries an `x-api-token-group` extension listing the
**exact** API-token permission names that satisfy it. The "required token scope"
column is copied from that field, not inferred. This matters because several
scopes are counter-intuitive (Web Analytics is gated on *Account Settings*, not
*Analytics*; the observability query endpoint has no read-only scope at all).

Anything not derivable from the spec is marked **UNVERIFIED** with the exact curl
to settle it.

---

## 0. Our credentials today, and the one assumption worth testing

The admin worker holds `CF_ANALYTICS_TOKEN`, `CF_ZONE_ID`, `CF_ACCOUNT_ID`. The
token is believed to be scoped **Zone → Analytics → Read**.

**Caveat worth resolving before planning around it:** `apps/admin/src/traffic.ts`
(`loadReferrers`, line ~370) already issues an **account-level** GraphQL query
(`rumPageloadEventsAdaptiveGroups` under `viewer.accounts`). Account-scoped
analytics require **`Account Analytics Read`**, which is a different permission
from Zone Analytics Read. Either the token already carries both, or that function
has been silently returning `null` and the `acquisition` tool's referrer block is
empty. The code swallows the failure (`return null`), so a green dashboard does
not prove it works.

Settle it in one call:

```bash
curl -s https://api.cloudflare.com/client/v4/user/tokens/verify \
  -H "Authorization: Bearer $CF_ANALYTICS_TOKEN" | jq
```

That returns the token's status but **not** its permission list. To see actual
reach, probe two endpoints that differ only in scope:

```bash
# Needs Zone Analytics Read — expect 200
curl -s "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID" \
  -H "Authorization: Bearer $CF_ANALYTICS_TOKEN" | jq '.success, .result.plan.name'

# Needs Zone Settings Read — expect 403 if the token is Analytics-only
curl -s "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/settings" \
  -H "Authorization: Bearer $CF_ANALYTICS_TOKEN" | jq '.success, .errors'
```

The tables below assume the conservative reading: **Zone Analytics Read only**.

---

## 1. AI Crawl Control (formerly AI Audit)

### The headline answer

**The per-crawler request counts you see in the dashboard are NOT available over
REST.** There is no REST endpoint that returns "Microsoft/BingBot 4.38k,
PetalBot 2.43k, Baidu 1.78k…". That data is exclusively in the **GraphQL**
Analytics API — see the companion GraphQL document, which owns this topic.

This was confirmed two independent ways: the OpenAPI spec contains no such path,
and the **AI Crawl Control changelog** (16 entries, 2024-09-23 through
2026-06-16) announces a **GraphQL API on 2026-02-04** and never announces a REST
one. The only other API in that changelog is a "Discovery API" for *crawler
operators* (2025-12-10) — i.e. for bots discovering Pay-Per-Crawl sites, not for
publishers reading their own data.

The entire REST surface for AI Crawl Control in the OpenAPI spec is **two
endpoints**, and both are about robots.txt, not traffic:

| Path | Method | Required scope | Plan gate | Current token? |
|---|---|---|---|---|
| `/zones/{zone_id}/ai-audit/robots` | GET | `Zone Settings Read` (or Write) | none found | **No** — needs Zone Settings Read |
| `/zones/{zone_id}/ai-audit/robots/bulk` | POST | `Zone Settings Read` (or Write) | none found | **No** — needs Zone Settings Read |

`GET /zones/{zone_id}/ai-audit/robots` — spec description verbatim:

> "Fetches and parses the robots.txt file for a zone or a specific subdomain
> within the zone. Returns parsed **user-agent rules, content signals, and
> sitemaps**."

Optional query param: `subdomain`. The `/bulk` variant takes a JSON array of
hostnames (max **25 per request**, each must end with the zone name) and returns
results keyed by hostname.

Note the `POST` on `/bulk` is a *read* despite the verb — it is POST only because
it takes a body. It mutates nothing.

### Why this endpoint is less exciting than it sounds

It fetches and parses the **public** `robots.txt`. Anyone can get ~90% of the
same information with an unauthenticated `curl https://grabient.com/robots.txt`
plus a parser. What Cloudflare adds is *its own canonical parse*, including
Content Signals interpretation (`search` / `ai-input` / `ai-train`) — which is
worth something given the owner deliberately turned the managed robots.txt
AI-training block **off**, and a drift check ("does the served file still say
what I think it says?") has real value. But it does not justify a token widening
on its own.

### What the live file actually shows (verified 2026-08-16)

`curl https://grabient.com/robots.txt` → `200`, and the served file is the
project's own, opening with:

```
# Grabient - all crawlers welcome, including AI crawlers.
# Note: crawler access is also governed by Cloudflare AI Crawl Control;
# both must allow a bot for it to get through.

User-agent: *
Disallow:
```

followed by an explicit allow-list block for `GPTBot`, `OAI-SearchBot`,
`ChatGPT-User`, `ClaudeBot`, `Claude-User`, `Claude-SearchBot`, `PerplexityBot`,
`Perplexity-User`, `Google-Extended`, `Applebot-Extended`, `meta-externalagent`
and `CCBot`, plus `Sitemap: https://grabient.com/sitemap.xml`.

**This is a state change worth recording.** `SEO-STRATEGY.md` line 68 documents,
"curl-verified twice", that Cloudflare's managed robots.txt was injecting
`Disallow` rules for `GPTBot` / `ClaudeBot` / `CCBot` / `Google-Extended`
**above** the site's welcome rules — "policy inverted in production". Today's
fetch shows **no injected Disallow block at all**. Turning the managed
AI-training block off fixed it, and the site is now serving the intended
permissive policy. That regression is exactly what a standing drift-check tool
would catch next time.

Two things this confirms:

1. **No Content Signals policy is being injected.** There are no
   `Content-Signal:` directives in the served file, consistent with the managed
   robots.txt AI-training block being off. So `cf_robots_variant` should read
   `off` — which makes the bot-management read (§1) a *confirmation* of a known
   state rather than a discovery, and lowers its priority further.
2. **The file itself documents the trap the API cannot see.** Its own comment
   says crawler access "is also governed by Cloudflare AI Crawl Control; both
   must allow a bot for it to get through." That second gate is precisely the
   dashboard-only state described below. An agent reading only robots.txt would
   conclude every AI crawler is welcome, and could be wrong.

### Crawler allow/block management: dashboard only

There is **no** REST endpoint to list or change the per-crawler allow/block
state. The docs page for managing AI crawlers documents only the dashboard
Actions column, and the OpenAPI spec contains no matching path. Confirmed by
inspecting the generated SDK: `cloudflare-typescript`'s `AIAudit` resource
contains a single `robots` sub-resource that is an **empty class with zero
methods** — the namespace is reserved in the spec but carries no operations.

```
src/resources/ai-audit/robots.ts →
  export class BaseRobots extends APIResource {
    static override readonly _key = ['aiAudit','robots'];
  }          // no methods at all
```

### Managed robots.txt / Content Signals state — readable via Bot Management

The *state* of the managed robots.txt toggle (the one the owner turned off) is
exposed on the bot management config, not on AI Crawl Control:

| Path | Method | Required scope | Current token? |
|---|---|---|---|
| `/zones/{zone_id}/bot_management` | GET | `Bot Management Read` (or Write) | **No** |
| `/zones/{zone_id}/bot_management` | PUT | `Bot Management Write` | **No** — and do not expose |

Relevant response fields: `fight_mode` (Bot Fight Mode on/off),
`ai_bots_protection` (`block` / `disabled` / `only_on_ad_pages`),
`crawler_protection`, `content_bots_protection`, `enable_js`,
**`cf_robots_variant`** (`off` / `policy_only`) and **`is_robots_txt_managed`**.
The last two are the machine-readable answer to "is Cloudflare injecting the
Content Signals policy into my robots.txt?".

**UNVERIFIED (plan gate):** the docs do not state whether GET works on a **Free**
zone. Bot Fight Mode itself is a Free-plan feature so a read is likely permitted,
but the response shape is tier-dependent (Free/Pro return the `fight_mode` shape;
`sbfm_*` fields are Super Bot Fight Mode; `auto_update_model` etc. are
Enterprise). Test:

```bash
curl -s "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/bot_management" \
  -H "Authorization: Bearer $NEW_TOKEN" | jq
```

### Adjacent surfaces worth knowing about

- **Pay Per Crawl** REST exists (`/zones/{zone_id}/pay-per-crawl/configuration`,
  `/accounts/{account_id}/pay-per-crawl/*`). Private beta, monetization, not
  analytics. Out of scope.
- **Dashboard CSV export** exists (changelog 2025-10-14, "Enhanced metrics & CSV
  exports"). If the GraphQL route is ever blocked, a manual CSV pull is the
  fallback for the per-crawler counts — but it is a human action, not something
  an MCP tool can automate.
- **Radar** (`/radar/bots/crawlers/summary/{dimension}`,
  `/radar/bots/crawlers/timeseries_groups/{dimension}`,
  `/radar/robots_txt/top/user_agents/directive`) is **global internet** data, not
  your zone. Useful as *industry context* ("is PetalBot hammering everyone or
  just us?") and it needs no zone permission, but it will never answer a question
  about grabient.com specifically. Low priority, genuinely free.

---

## 2. Web Analytics (RUM) — REST

Everything readable over REST here is **configuration**, not measurements. The
actual pageload/referrer numbers are GraphQL (`rumPageloadEventsAdaptiveGroups`),
already used by `traffic.ts`.

| Path | Method | Required scope | Current token? |
|---|---|---|---|
| `/accounts/{account_id}/rum/site_info/list` | GET | **`Account Settings Read`** | **No** |
| `/accounts/{account_id}/rum/site_info/{site_id}` | GET | `Account Settings Read` | **No** |
| `/accounts/{account_id}/rum/site_info/site_tag/list` | GET | `Account Settings Read` | **No** |
| `/accounts/{account_id}/rum/site_info/zone_tag/list` | GET | `Account Settings Read` | **No** |
| `/accounts/{account_id}/rum/site_info/validate/{hostname}` | GET | `Account Settings Read` | **No** |
| `/accounts/{account_id}/rum/v2/{ruleset_id}/rules` | GET | *(spec lists none)* | UNVERIFIED |
| `/accounts/{account_id}/rum/site_info` | POST | `Account Settings Write` | **No** — do not expose |
| `/accounts/{account_id}/rum/site_info/{site_id}` | PUT / DELETE | `Account Settings Write` | **No** — do not expose |
| `/accounts/{account_id}/rum/v2/{ruleset_id}/rule[s]` | POST/PUT/DELETE | `Account Settings Write` | **No** — do not expose |
| `/zones/{zone_id}/settings/rum` | GET | `Zone Settings Read` | **No** |
| `/zones/{zone_id}/settings/rum` | PATCH | `Zone Settings Write` | **No** — do not expose |

**Gotcha, and it is a real one:** Web Analytics is gated on **`Account Settings
Read`**, *not* on any Analytics permission. Granting "Account → Analytics → Read"
will not open these endpoints. `Account Settings Read` is a fairly broad
permission — it reads account configuration generally — which is a meaningful
argument against widening the token merely to list a site tag you could copy out
of the dashboard once and hardcode.

**Verdict: not worth an MCP tool.** The site tag is a constant. The rules list
changes maybe once a year. Neither is a question an agent will ask.

---

## 3. Workers observability, deployments and versions

### 3a. The observability query API — verified, but with a nasty scope problem

The endpoint you suspected exists and is real:

| Path | Method | Required scope | Current token? |
|---|---|---|---|
| `/accounts/{account_id}/workers/observability/telemetry/query` | POST | **`Workers Observability Write`** | **No** |
| `/accounts/{account_id}/workers/observability/telemetry/keys` | POST | **`Workers Observability Write`** | **No** |
| `/accounts/{account_id}/workers/observability/telemetry/values` | POST | **`Workers Observability Write`** | **No** |
| `/accounts/{account_id}/workers/observability/usage` | GET | `Workers Observability Read` (or Write) | **No** |
| `/accounts/{account_id}/workers/observability/queries` | GET | `Workers Observability Read` (or Write) | **No** |
| `/accounts/{account_id}/workers/observability/queries/{queryId}` | GET | `Workers Observability Read` (or Write) | **No** |
| `/accounts/{account_id}/workers/observability/destinations` | GET | `Workers Observability Read` (or Write) | **No** |
| `/accounts/{account_id}/workers/observability/metricsexport` | GET | `Workers Observability Read`/Write | **No** |
| `/accounts/{account_id}/workers/observability/telemetry/live-tail` | POST | `Workers Observability Write` | **No** — do not expose |
| `/accounts/{account_id}/workers/observability/queries` | POST | `Workers Observability Write` | **No** — do not expose |
| `/accounts/{account_id}/workers/observability/shared/query` | POST | `Workers Observability Write` | **No** — do not expose |

> **THE GOTCHA.** `telemetry/query` — the one endpoint that actually reads your
> logs — is tagged **`Workers Observability Write` only**. There is no read-only
> scope that reaches it. `Workers Observability Read` gets you the *usage
> counter* and the *list of saved queries*, but **not the ability to run one**.
>
> So "let the agent search production logs" cannot be done with a read-only
> token. It requires granting Write, which also grants: creating/deleting saved
> queries, creating/deleting log destinations, creating/deleting metrics exports,
> and starting live tails. That is a genuinely privileged scope.
>
> This is almost certainly a Cloudflare tagging oversight rather than intent (the
> operation is a pure read that persists a query record), but the enforcement is
> what it is.

Request body for `telemetry/query` (from the spec): required `queryId` (string —
either a saved query id or an ad-hoc one) and `timeframe` `{from, to}` as Unix
**milliseconds**. Optional: `parameters` (the actual query: `calculations`,
`datasets`, `filters`, `groupBys`, `havings`, `needle`, `orderBy`), `view`
(`traces` | `events` | `calculations` | `invocations` | `requests` | `agents`),
`limit`, `offset`/`offsetBy`/`offsetDirection`, `chart`, `chartType`
(`timeseries_and_aggregate` | `timeseries` | `aggregate` | `distribution`),
`granularity`, `compare`, `dry`, `ignoreSeries`.

**Plan gate — Workers Paid ($5/mo) is enough, and you are already configured.**

| | Free | Paid (ours) |
|---|---|---|
| Log events | 200,000/day | 20M/month included, then $0.60/M |
| Retention | 3 days | **7 days** |
| Per-log size cap | 256 KB | 256 KB |
| Account daily limit | 5 billion | 5 billion |

Requires `"observability": { "enabled": true }` in the Wrangler config. Verified
present in **both** `apps/admin/wrangler.jsonc` and `apps/web/wrangler.jsonc`
(line 48), each with `head_sampling_rate: 1`. So logs are being collected for
production — the data exists; the only obstacle is the token scope.

**7-day retention is the fact that should drive the decision.** A log search tool
can only ever answer "what happened this week". It cannot support any trend,
month-over-month, or SEO-timeline question. That is a debugging tool, not an
analytics tool, and it sits awkwardly in a server whose other tools answer
"how is the site doing".

### 3b. Deployments and versions — cheap, safe, and genuinely useful

| Path | Method | Required scope | Current token? |
|---|---|---|---|
| `/accounts/{account_id}/workers/scripts` | GET | `Workers Scripts Read` (or Write, or Tail Read) | **No** |
| `/accounts/{account_id}/workers/scripts/{script_name}/deployments` | GET | `Workers Scripts Read` | **No** |
| `/accounts/{account_id}/workers/scripts/{script_name}/versions` | GET | `Workers Scripts Read` | **No** |
| `/accounts/{account_id}/workers/scripts/{script_name}/versions/{version_id}` | GET | `Workers Scripts Read` | **No** |
| `/accounts/{account_id}/workers/scripts/{script_name}/settings` | GET | `Workers Scripts Read` | **No** |
| `/accounts/{account_id}/workers/scripts/{script_name}/schedules` | GET | `Workers Scripts Read` | **No** |
| `/accounts/{account_id}/workers/scripts/{script_name}/subdomain` | GET | `Workers Scripts Read` | **No** |
| `/accounts/{account_id}/workers/scripts/{script_name}` | GET (download source) | `Workers Scripts Read` | **No** |
| `/accounts/{account_id}/workers/scripts/{script_name}` | PUT / DELETE | `Workers Scripts Write` | **No** — never expose |
| `/accounts/{account_id}/workers/scripts/{script_name}/deployments` | POST | `Workers Scripts Write` | **No** — never expose |
| `/accounts/{account_id}/workers/scripts/{script_name}/tails` | GET/POST | `Workers Tail Read` | **No** |

Version metadata returns `created_on`, `modified_on`, `author_email`,
`author_id`, `source` (`api` / `wrangler` / `terraform` / `dash` / `cf_cli`),
`hasPreview`. There is **no** commit-message or annotation field.

**Why this is the best value in section 3:** a deploy timeline is the single most
useful correlate for every other metric in the server. "Traffic dropped on the
14th" and "there was a deploy on the 14th" is the join an agent cannot currently
make. `Workers Scripts Read` is a narrow, low-risk permission.

**One caution:** `Workers Scripts Read` also permits **downloading Worker source
code**. That is your own code, so the confidentiality risk is low, but it means
the token is not purely "metadata" — if it leaks, the attacker gets your bundles
(and any secret accidentally inlined in one). Note also that `GET
/accounts/{id}/workers/scripts` is additionally satisfied by `Workers Tail Read`,
so do not treat Tail Read as harmless either.

---

## 4. Per-binding usage and configuration

### 4a. D1 — reachable-in-principle, but read the warning

| Path | Method | Required scope | Current token? |
|---|---|---|---|
| `/accounts/{account_id}/d1/database` | GET (list) | `D1 Read` (or Write) | **No** |
| `/accounts/{account_id}/d1/database/{database_id}` | GET | `D1 Read` (or Write) | **No** |
| `/accounts/{account_id}/d1/database/{database_id}/query` | POST | **`D1 Read`** (or Write) | **No** |
| `/accounts/{account_id}/d1/database/{database_id}/raw` | POST | **`D1 Read`** (or Write) | **No** |
| `/accounts/{account_id}/d1/database/{database_id}/time_travel/bookmark` | GET | `D1 Read` | **No** |
| `/accounts/{account_id}/d1/database/{database_id}/export` | POST | *(spec lists none)* | UNVERIFIED |
| `/accounts/{account_id}/d1/database/{database_id}/import` | POST | *(none listed)* | **Never expose** |
| `/accounts/{account_id}/d1/database/{database_id}/time_travel/restore` | POST | *(none listed)* | **Never expose** |
| `/accounts/{account_id}/d1/database/{database_id}` | PUT/PATCH/DELETE | `D1 Write` | **Never expose** |

> **THE SAFETY IMPLICATION, stated plainly.** `POST .../d1/database/{id}/query`
> is satisfied by **`D1 Read`** — but the permission check happens on the
> *endpoint*, not on the *SQL*. Cloudflare does not parse your statement and
> reject `DELETE`/`DROP`/`UPDATE`. A token holding only "D1 Read" can therefore
> **destroy the production database** through this endpoint.
>
> "D1 Read" is not a read-only database. It is read-only *access to the D1
> control plane*, which includes an arbitrary-SQL execution endpoint.
>
> **UNVERIFIED** — I could not find a doc statement either confirming or denying
> SQL-level enforcement, and the spec's `x-api-token-group` is the only evidence.
> The owner can settle it safely against a throwaway database (**never** against
> `grabient-prod`):
> ```bash
> # against a scratch D1 database, with a D1-Read-only token
> curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/d1/database/$SCRATCH_DB/query" \
>   -H "Authorization: Bearer $D1_READ_ONLY_TOKEN" -H "Content-Type: application/json" \
>   --data '{"sql":"CREATE TABLE probe_delete_me (x INTEGER)"}' | jq '.success, .errors'
> ```
> If that returns `success: true`, the warning above is confirmed and a D1 token
> must be treated as a production-write credential.

**Recommendation: do not add a D1 REST tool at all.** The admin worker already
has a **D1 binding** (`env.DB`, `"remote": true`) and `queries.ts` already runs
curated, aggregate-only SELECTs through it. That path is strictly safer than a
REST token: no credential exists that could leak, and the queries are code the
owner reviewed rather than SQL an agent composed. The existing `funnel` tool is
the right shape. Adding a generic `d1_query` tool would hand an LLM arbitrary SQL
against production for no capability the server does not already have.

If a *specific* new metric is wanted, add a named SELECT to `queries.ts` and
expose it as its own tool. That is the pattern the codebase already established.

### 4b. KV, R2, Vectorize, Workers AI, Durable Objects

| Product | Path | Method | Required scope | Verdict |
|---|---|---|---|---|
| KV | `/accounts/{account_id}/storage/kv/namespaces` | GET | `Workers KV Storage Read` | Marginal |
| KV | `/accounts/{account_id}/storage/kv/namespaces/{id}` | GET | `Workers KV Storage Read` | Marginal |
| KV | `.../namespaces/{id}/keys` | GET | `Workers KV Storage Read` | **No** — key names can be data |
| KV | `.../namespaces/{id}/values/{key}` | GET | `Workers KV Storage Read` | **No** — reads cached content |
| KV | `.../values/{key}`, `.../bulk` | PUT/DELETE/POST | `Workers KV Storage Write` | **Never expose** |
| R2 | `/accounts/{account_id}/r2/buckets` | GET (list) | `Workers R2 Storage Read` | Marginal |
| R2 | `/accounts/{account_id}/r2/buckets/{name}` | GET | *(spec lists none)* | UNVERIFIED |
| R2 | `/accounts/{account_id}/r2/buckets` | POST / DELETE | `Workers R2 Storage Write` | **Never expose** |
| Vectorize | `/accounts/{account_id}/vectorize/v2/indexes` | GET | `Vectorize Read` | Marginal |
| Vectorize | `/accounts/{account_id}/vectorize/v2/indexes/{name}` | GET | `Vectorize Read` | Marginal |
| Vectorize | `/accounts/{account_id}/vectorize/v2/indexes/{name}/info` | GET | `Vectorize Read` | **Yes — the useful one** |
| Vectorize | `.../indexes/{name}/query`, `/get_by_ids` | POST | `Vectorize Read` | Situational |
| Vectorize | `.../insert`, `/upsert`, `/delete_by_ids`, index create/delete | POST/DELETE | `Vectorize Write` | **Never expose** |
| Workers AI | `/accounts/{account_id}/ai/models/search` | GET | `Workers AI Read` | Low |
| Workers AI | `/accounts/{account_id}/ai/run/{model}` | POST | `Workers AI Read`(!) | **Never expose — it spends money** |
| Durable Objects | `/accounts/{account_id}/workers/durable_objects/namespaces` | GET | `Workers Scripts Read` | Low |
| Durable Objects | `.../namespaces/{id}/objects` | GET | `Workers Scripts Read` | Low |

Notes that matter:

- **Vectorize `/info` is the one genuinely valuable item in this section.** It
  returns `dimensions`, `vectorCount`, `processedUpToDatetime`,
  `processedUpToMutation`. Given the palette search work, "how many vectors are
  actually in the index, and how far behind is it?" is a real operational
  question that is currently unanswerable without the dashboard. `Vectorize Read`
  is a narrow permission.
- **The `/vectorize/indexes` (v1) paths are deprecated** — use `/vectorize/v2/`.
- **`POST /accounts/{id}/ai/run/{model}` is satisfied by `Workers AI Read`.**
  Another case of a "Read" scope that performs a billable, side-effecting action.
  Do not grant Workers AI to this token; the MCP has no reason to run inference.
- **There is no Workers AI *usage* REST endpoint.** Neuron spend and request
  counts are GraphQL only. Same for KV/R2/D1 operation counts and R2 storage
  bytes — all GraphQL (`*AdaptiveGroups` datasets). The REST surface for storage
  products is configuration, not metering.
- **KV value reads are a data-exfiltration path**, not a metric. The two KV
  namespaces back site behaviour, and `GET /values/{key}` returns whatever is
  stored. This is exactly the kind of tool that looks harmless in a design doc
  and turns the MCP into a production data browser. Excluded.

---

## 5. Zone configuration reads for SEO/ops

| Path | Method | Required scope | Current token? |
|---|---|---|---|
| `/zones/{zone_id}` (zone details, incl. plan) | GET | **`Analytics Read`** ✓ (among many) | **YES — reachable today** |
| `/zones/{zone_id}/settings` (all settings, bulk) | GET | `Zone Settings Read` | **No** |
| `/zones/{zone_id}/settings/{setting_id}` | GET | `Zone Settings Read` | **No** |
| `/zones/{zone_id}/rulesets` | GET | `Zone WAF Read` (or many others) | **No** |
| `/zones/{zone_id}/rulesets/{ruleset_id}` | GET | `Zone WAF Read` | **No** |
| `/zones/{zone_id}/rulesets/phases/{phase}/entrypoint` | GET | `Zone WAF Read` | **No** |
| `/zones/{zone_id}/rulesets/{id}/versions` | GET | `Zone WAF Read` | **No** |
| `/zones/{zone_id}/bot_management` | GET | `Bot Management Read` | **No** |
| `/zones/{zone_id}/settings/zaraz/config` | GET | **`Zaraz Read`** | **No** |
| `/zones/{zone_id}/settings/zaraz/default` | GET | `Zaraz Read` | **No** |
| `/zones/{zone_id}/settings/zaraz/history` | GET | `Zaraz Read` | **No** |
| `/zones/{zone_id}/settings/zaraz/workflow` | GET | `Zaraz Read` | **No** |
| `/zones/{zone_id}/settings/zaraz/export` | GET | `Zaraz Read` | **No — see warning** |
| `/zones/{zone_id}/analytics/dashboard` | GET | **`Analytics Read`** ✓ | **YES — but deprecated** |
| `/zones/{zone_id}/rate_limit_analytics` | GET | **`Analytics Read`** ✓ | **YES — but see warning** |
| `/zones/{zone_id}/speed_api/pages` | GET | `Zone Settings Read` | **No** |
| `/zones/{zone_id}/speed_api/pages/{url}/trend` | GET | `Zone Settings Read` | **No** |
| `/zones/{zone_id}/speed_api/availabilities` | GET | `Zone Settings Read` | **No** |
| any `PATCH /zones/{zone_id}/settings/*` | PATCH | `Zone Settings Write` | **Never expose** |
| `PUT /zones/{zone_id}/rulesets/...` | PUT/POST/DELETE | `Zone WAF Write` | **Never expose** |
| `PUT /zones/{zone_id}/settings/zaraz/config`, `POST .../publish` | PUT/POST | `Zaraz Edit` / `Zaraz Admin` | **Never expose** |

### Ruleset phase names (for finding the owner's new rules)

- **WAF custom rules** → phase `http_request_firewall_custom`
- **Rate limiting rules** → phase `http_ratelimit`

```
GET /zones/{zone_id}/rulesets/phases/http_request_firewall_custom/entrypoint
GET /zones/{zone_id}/rulesets/phases/http_ratelimit/entrypoint
```

Each returns the entrypoint ruleset with its `rules[]`, each carrying
`expression`, `action`, `description`, `enabled`, `last_updated`, and for rate
limiting a `ratelimit` block (`characteristics`, `period`, `requests_per_period`,
`mitigation_timeout`). This is exactly the owner's 300 req/10s rule on
`/api/*`, `*.png`, `*.json` and the three custom rules, in machine-readable form.

### Crawler Hints — NOT readable over REST

**`crawlhints` does not appear anywhere in Cloudflare's OpenAPI spec** — not as a
path, not as a `setting_id`, not in any schema (verified: zero occurrences across
23 MB). There is no documented REST read for Crawler Hints status. It is a
dashboard toggle under Cache → Configuration.

The undocumented internal endpoint historically used by the dashboard is
`/zones/{zone_id}/flags/products/fl/settings/crawlhints`. **UNVERIFIED** and
unsupported. The realistic approach is the bulk settings endpoint, which returns
whatever the zone actually has rather than only what the spec documents:

```bash
curl -s "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/settings" \
  -H "Authorization: Bearer $NEW_TOKEN" | jq '.result[] | select(.id|test("crawl"))'
```

If that comes back empty, Crawler Hints status is genuinely dashboard-only and
should simply be recorded as a known-true constant in the MCP's static context
rather than fetched.

### Zaraz — yes, you can read which tools are configured

`GET /zones/{zone_id}/settings/zaraz/config` returns the live config: **tools**
(every third-party integration, its settings, enabled flag and actions),
**triggers**, **variables**, and **settings**. Since the owner's GA4 runs through
Zaraz, this is the authoritative answer to "is GA4 still wired up, with which
measurement ID, on which triggers?" — a question that has bitten this project
before (the analytics-visibility gotcha where Zaraz bot-filters GA4).

> **Do not expose `/zaraz/export`.** Per the docs, the standard `/config` read
> omits secret variable values, but **`/export` includes them in full**. Both are
> satisfied by the same `Zaraz Read` scope, so the *scope* does not protect you —
> only your choice of endpoint does. Wire the tool to `/config`, never `/export`,
> and say so in a comment at the call site.

### `/zones/{zone_id}` — free win, reachable today

Satisfied by `Analytics Read`, which the token already has. Returns `name`,
`status`, `paused`, `type`, `name_servers`, `original_name_servers`,
`created_on`, `modified_on`, `activated_on`, and **`plan`** (id/name — confirms
"Free Website"). Small, but it is the only zone-configuration read available
without widening anything, and it lets the agent state the plan tier as fact
rather than assumption when explaining why a dataset is limited.

### Deprecated REST analytics — reachable today, but do not build on them

Both are satisfied by `Analytics Read` and both are marked **`deprecated: true`**
in the spec:

- **`GET /zones/{zone_identifier}/analytics/dashboard`** — totals + timeseries
  across the network. Params: `since` (default `-10080` minutes = 7 days),
  `until`, `continuous`. Superseded by GraphQL, which `traffic.ts` already uses.
  Adding it would duplicate the `traffic` tool with worse, deprecated data.
- **`GET /zones/{zone_id}/rate_limit_analytics`** — required params `since`,
  `until`, `time_delta` (one of `60`, `3600`, `86400`, `2592000`). **Trap:** this
  serves the *legacy* rate limiting product (`/zones/{id}/rate_limits`), not the
  ruleset-engine rate limiting rules the owner just configured in the
  `http_ratelimit` phase. It will very likely return zeroes or an empty series,
  which an agent would misreport as "the rate limit is never triggering". Rate
  limiting rule counters live in GraphQL. **Recommend excluding it entirely.**

### Cache settings

The cache knobs that matter for this site are plain zone settings and come back
in the bulk `GET /zones/{id}/settings` call: `cache_level`, `browser_cache_ttl`,
`edge_cache_ttl`, `always_online`, `development_mode` (with `time_remaining`),
`early_hints`, `brotli`, `polish`, `min_tls_version`, `security_level`,
`always_use_https`, `automatic_https_rewrites`. One bulk read covers all of them,
so the `zone_config` tool needs no per-setting calls.

There are also dedicated cache endpoints — `GET /zones/{id}/cache/variants`,
`/cache/cache_reserve`, `/cache/regional_tiered_cache` — all satisfied by
`Zone Settings Read`. Cache Reserve and Tiered Cache are paid features and will
report disabled on a Free zone, so they add little here.

> **`POST /zones/{zone_id}/purge_cache` requires the `Cache Purge` permission and
> must never be exposed.** It is the single most tempting write endpoint in this
> document — purging looks harmless and reversible. It is not: `CLAUDE.md` records
> `cross_version_cache: false` being pinned deliberately so each deploy starts
> cold, and `apps/web/README.md` records two production incidents caused by cache
> policy mistakes. An agent that can purge can produce an origin load spike on a
> Free plan at will. Do not grant `Cache Purge` to any token this server holds.

### Analytics Engine SQL — the one REST analytics surface worth knowing about

| Path | Method | Required scope | Current token? |
|---|---|---|---|
| `/accounts/{account_id}/analytics_engine/sql` | GET (query param) | **`Account Analytics Read`** | Maybe — see §0 |
| `/accounts/{account_id}/analytics_engine/sql` | POST (body) | `Account Analytics Read` | Maybe — see §0 |

Verified: no Analytics Engine binding or `writeDataPoint` call exists anywhere in
`apps/` today, so **there is nothing to query right now**. Recording it because it
is the only *non-GraphQL* way to get real analytics out of Cloudflare over REST,
and it is gated on `Account Analytics Read` — a permission the token may already
hold (§0).

Strategically: if a custom metric is ever wanted that GraphQL's fixed datasets do
not expose (say, per-palette-seed render counts, or semantic-search query
outcomes), adding an Analytics Engine binding and writing datapoints from
`apps/web` makes it queryable with SQL over REST, with no new permission. That is
a meaningfully better shape than bolting more D1 aggregation onto the read path.
Not a recommendation to act now — just the option that exists, so it is not
rediscovered later.

### Speed / Observatory

`/zones/{zone_id}/speed_api/pages/{url}/trend` returns Core Web Vitals trends,
and `/pages` lists tested URLs. Relevant given the recorded PageSpeed baseline
(perf 64 / TBT 870 ms / INP 367 ms). Needs `Zone Settings Read`. The write
endpoints (`POST .../tests`, `POST .../schedule/{url}`) trigger real tests
against a Free-plan quota — **do not expose**; check
`/speed_api/availabilities` for the quota if you ever reconsider.

---

## 6. Cloudflare Access / Zero Trust

| Path | Method | Required scope | Current token? |
|---|---|---|---|
| `/accounts/{account_id}/access/service_tokens` | GET | `Access: Service Tokens Read` | **No** |
| `/accounts/{account_id}/access/service_tokens/{id}` | GET | `Access: Service Tokens Read` | **No** |
| `/zones/{zone_id}/access/service_tokens` | GET | `Access: Service Tokens Read` | **No** |
| `/accounts/{account_id}/access/apps` | GET | `Access: Apps and Policies Read` | **No** |
| `/accounts/{account_id}/access/logs/access_requests` | GET | `Access: Audit Logs Read` | **No** |
| `/accounts/{account_id}/access/service_tokens` | POST | `Access: Service Tokens Write` | **Never expose** |
| `.../service_tokens/{id}/refresh`, `/rotate` | POST | `Access: Service Tokens Write` | **Never expose** |
| `.../service_tokens/{id}` | PUT / DELETE | `Access: Service Tokens Write` | **Never expose** |

**The reassuring part:** the client **secret is returned only once, at creation**.
List and get responses expose `id`, `client_id`, `name`, `duration`,
`created_at`, `updated_at`, `expires_at`, and last-seen info — never the secret.
So a service-token *listing* tool cannot leak a usable credential.

**The argument against it anyway.** The admin worker's own auth already depends
on `ADMIN_SERVICE_TOKENS`. A tool that enumerates service tokens tells an agent —
and anyone who compromises the MCP — the shape of the very auth system guarding
it: how many headless clients exist, their names, and **when they expire**. The
expiry data is the only genuinely useful part ("is a service token about to
lapse and break the MCP?"), and that is a once-a-year question better handled by
a calendar reminder than a standing capability.

**Recommendation: do not expose. Do not grant `Access: Service Tokens Read`.**
The security value of the MCP not being able to introspect its own gate exceeds
the convenience of listing tokens. If expiry monitoring is genuinely wanted, put
it in a scheduled job that alerts, not in a tool an agent can call.

---

## 7. WOULD NEED A NEW / WIDER TOKEN

The current `CF_ANALYTICS_TOKEN` (Zone → Analytics → Read) reaches **almost
nothing** in this document. Below is the decision the owner actually has to make.

### Recommended: one new token, four permissions

Create a **second, separate token** — do not widen `CF_ANALYTICS_TOKEN`. Keeping
the GraphQL analytics credential narrow means a leak of the new token does not
also cost you the old one, and vice versa.

Suggested name: `grabient-mcp-config-read`.

| Permission | Level | Unlocks | Risk |
|---|---|---|---|
| **Zone Settings → Read** | Zone: grabient.com | all `/zones/{id}/settings`, AI Crawl Control robots parse, Speed/Observatory trends | Low — read-only config |
| **Zone WAF → Read** | Zone: grabient.com | WAF custom rules + rate limiting rules via rulesets | Low — read-only |
| **Zaraz → Read** | Zone: grabient.com | Zaraz tool/trigger config (the GA4 wiring) | Low, **but** also opens `/export` which contains secrets — endpoint choice is the control |
| **Workers Scripts → Read** | Account | deploy + version timeline for correlation | Low-moderate — also allows downloading Worker source |

That set is the sweet spot: it makes the four highest-value proposed tools
possible and grants **no write capability anywhere**.

> **Naming mismatch when you create the token.** The OpenAPI spec says
> **"Write"**; the dashboard token editor says **"Edit"**. They are the same
> thing. In *My Profile → API Tokens → Create Token → Create Custom Token*, the
> permission rows read as a three-part control — scope (`Zone` / `Account`),
> group (e.g. `Zone Settings`), and level (`Read` / `Edit`). So spec
> `Zone Settings Read` → dashboard **Zone · Zone Settings · Read**. Set
> *Zone Resources* to `Include → Specific zone → grabient.com` and *Account
> Resources* to your single account; do not leave either on "All".

### Optional fifth, if the Vectorize question matters

| Permission | Level | Unlocks | Risk |
|---|---|---|---|
| **Vectorize → Read** | Account | index `/info`: `vectorCount`, `dimensions`, staleness | Low, but note `Vectorize Read` also permits `/query` and `/get_by_ids` |

### Explicitly recommend AGAINST granting

| Permission | Why not |
|---|---|
| **Workers Observability → Write** | The only scope that can run a log query. Also grants create/delete of saved queries, log destinations, metrics exports, and live tail. Too much for 7 days of retention. |
| **D1 → Read** | Despite the name, it reaches the arbitrary-SQL `/query` endpoint. Treat as a production-write credential. The admin worker's D1 *binding* already covers every legitimate need. |
| **Workers KV Storage → Read** | `GET /values/{key}` turns the MCP into a production data browser. |
| **Workers AI → Read** | Permits `POST /ai/run/{model}` — billable inference. No analytics value. |
| **Account Settings → Read** | Broad account-config read, and buys only Web Analytics site metadata that is effectively a constant. |
| **Access: Service Tokens → Read** | Lets the MCP introspect its own auth boundary. See §6. |
| **Bot Management → Read** | Only if the managed-robots.txt / Bot Fight Mode state is genuinely wanted; it is a rarely-changing toggle. Defer. |
| **Any `* Write` permission** | This server is read-only. Full stop. |

### Storing it

Add as a **Worker secret**, not a `var` — matching how `CF_ANALYTICS_TOKEN` is
handled today (`apps/admin/wrangler.jsonc` deliberately has no `vars` block):

```bash
cd apps/admin && npx wrangler secret put CF_CONFIG_TOKEN
```

Add `CF_CONFIG_TOKEN?: string` to `apps/admin/src/env.d.ts` and to
`.dev.vars.example` (name only, never a value).

---

## 8. PROPOSED MCP TOOLS (prioritised)

All tools below are **read-only**. Follow the existing conventions in
`apps/admin/src/mcp.ts`: `json()` for results, `unavailable()` for
"not configured" so the agent never reports a config failure as "no data", and
descriptions that tell the agent what the number *means*, not just what it is.

### P1 — `zone_config` (read-only) — *needs Zone Settings Read + Zone WAF Read*

The highest-value addition. Collapses several endpoints into one digest so an
agent gets the whole edge posture in a single call.

```ts
description:
  "The edge configuration of grabient.com as one digest: zone plan and status, " +
  "all zone settings (cache level, browser cache TTL, Always Use HTTPS, early " +
  "hints, security level, Brotli...), the WAF custom rules, and the rate " +
  "limiting rules with their thresholds and expressions. This is CONFIGURATION, " +
  "not traffic — it explains why traffic looks the way it does. Read this before " +
  "concluding that a crawler was blocked or a page was not cached. Crawler Hints " +
  "status is NOT in the API and is reported from a known constant.",
inputSchema: {
  section: z.enum(["all", "settings", "waf", "ratelimit", "zone"]).optional(),
}
```

Composes: `GET /zones/{id}`, `GET /zones/{id}/settings`,
`GET /zones/{id}/rulesets/phases/http_request_firewall_custom/entrypoint`,
`GET /zones/{id}/rulesets/phases/http_ratelimit/entrypoint`.

### P2 — `robots_and_signals` (read-only) — *needs Zone Settings Read*

```ts
description:
  "What grabient.com's robots.txt actually tells crawlers right now, as parsed " +
  "by Cloudflare: per-user-agent allow/disallow rules, Content Signals " +
  "(search / ai-input / ai-train) and declared sitemaps. Use this to verify that " +
  "AI crawlers are permitted — the managed AI-training block is deliberately OFF " +
  "for this site, and this tool is how you confirm that is still true. It reads " +
  "the live file, so it catches drift between what was intended and what is served.",
inputSchema: { subdomain: z.string().optional() }
```

Calls `GET /zones/{id}/ai-audit/robots`. Directly serves the AI-visibility goal.

**Cheaper alternative worth considering first:** plain
`fetch("https://grabient.com/robots.txt")` needs **no token at all** and gets you
the raw file (verified 200 — see §1). You would parse it yourself and lose
Cloudflare's Content Signals interpretation, which the live file currently does
not use anyway. If the owner declines to grant `Zone Settings Read`, ship this
version instead — it still answers the drift question, and it is the honest
default given how little the authenticated variant adds today.

Whichever version ships, the tool description **must** carry the caveat the file
itself records: robots.txt is only the first gate, and AI Crawl Control's
per-crawler allow/block state is invisible to the API. A permissive robots.txt
does not prove a crawler is getting through.

### P3 — `deploys` (read-only) — *needs Workers Scripts Read*

```ts
description:
  "Deployment and version history for the production Worker (grabient-production) " +
  "and staging (grabient-lite): when each version went out, who deployed it, and " +
  "from where (wrangler / dashboard / API). This is the correlation tool — when a " +
  "metric changes on a date, check here before attributing it to SEO, a crawler, " +
  "or seasonality. Returns metadata only; no source code.",
inputSchema: {
  script: z.enum(["grabient-production", "grabient-lite", "grabient-admin"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
}
```

Calls `GET /accounts/{id}/workers/scripts/{script}/deployments` and `/versions`.
Deliberately does **not** expose `GET /workers/scripts/{name}` (source download)
even though the same scope allows it.

### P4 — `zaraz_config` (read-only) — *needs Zaraz Read*

```ts
description:
  "Which third-party tools Zaraz is running on grabient.com, their triggers and " +
  "whether each is enabled. GA4 is delivered through Zaraz, so this is the " +
  "authoritative answer to 'is analytics actually wired up?' when GA4 numbers " +
  "look wrong. Reads the published config with secret values omitted.",
inputSchema: {}
```

Calls `GET /zones/{id}/settings/zaraz/config`. **Never** `/export`.

### P5 — `vectorize_status` (read-only) — *needs Vectorize Read*

```ts
description:
  "Health of the Vectorize index behind palette search: vector count, dimensions, " +
  "and how far the index has been processed (processedUpToDatetime / " +
  "processedUpToMutation). Use this to tell 'search returns bad results' apart " +
  "from 'search is querying a stale or half-built index'.",
inputSchema: { index: z.string().optional() }
```

Calls `GET /accounts/{id}/vectorize/v2/indexes/{name}/info`.

### P6 — `web_vitals` (read-only) — *needs Zone Settings Read*

```ts
description:
  "Cloudflare Observatory Core Web Vitals trend for a tested URL (LCP, INP, CLS, " +
  "TTFB). Lab data from scheduled synthetic tests, not field data — it will not " +
  "match Search Console's CWV report, which uses real Chrome users. Read-only: " +
  "starting a new test is deliberately not exposed because it consumes a " +
  "Free-plan quota.",
inputSchema: { url: z.string().url().optional() }
```

Calls `GET /zones/{id}/speed_api/pages` and `/pages/{url}/trend`. Lower priority —
overlaps the existing PageSpeed workflow and its lab-vs-field caveat makes it easy
for an agent to misread.

### P7–P9 — Bing Webmaster Tools tools

Specified in **§10.7** alongside the setup steps they depend on, because they
cannot be built until the owner completes the Bing signup. In priority order:
**`bing_backlinks`** (the dataset no free Google tool provides — arguably the
single highest-value tool in this entire document), **`bing_search_performance`**,
**`bing_crawl_health`**. All read-only.

### Considered and REJECTED

| Tool | Why rejected |
|---|---|
| `d1_query` (arbitrary SQL) | `D1 Read` reaches an unfiltered SQL endpoint against production. The admin worker's D1 binding + curated SELECTs in `queries.ts` already provide every legitimate answer with no leakable credential. Add named queries instead. |
| `worker_logs` (observability query) | Requires `Workers Observability Write`; 7-day retention makes it a debugging tool, not analytics. If the owner really wants it, it belongs in a *separate* server with a *separate* token, not this one. |
| `kv_get` / `kv_list` | Production data browser wearing a metrics costume. |
| `service_tokens` | Lets the MCP introspect its own auth boundary (§6). |
| `rate_limit_analytics` | Deprecated, and serves the *legacy* rate limiting product — would return empty for the owner's ruleset-based rule and be misreported as "never triggering". |
| `zone_analytics_rest` | Deprecated duplicate of the existing GraphQL-backed `traffic` tool. |
| `web_analytics_sites` | Returns constants. |
| Anything calling `POST /ai/run` | Billable inference; zero analytics value. |
| **Every write endpoint in this document** | This server is read-only by design, and that property is enforced by what gets registered — see the header comment in `mcp.ts`. Adding one write tool silently reclassifies the whole server, and its Access policy was written for a read-only threat model. |

### On writes, generally

The default answer for every `POST`/`PUT`/`PATCH`/`DELETE` catalogued above is
**do not expose**. The specific ones that would be most tempting and are most
dangerous: `PATCH /zones/{id}/settings/*` (silently changes live caching —
`apps/web/README.md` records two production incidents from cache-policy
mistakes), `PUT /zones/{id}/rulesets/...` (could disable the WAF),
`PUT /zaraz/config` + `POST /zaraz/publish` (could break or exfiltrate analytics
wiring), and anything under D1 (`/import`, `/time_travel/restore`).

---

## 9. Gotchas — Cloudflare

1. **`Workers Observability Read` cannot run a query.** Only `...Write` reaches
   `telemetry/query`. There is no read-only path to your logs.
2. **`D1 Read` can execute arbitrary SQL, including `DROP`.** The permission is
   enforced on the endpoint, not the statement. Never treat a D1 token as safe.
3. **`Workers AI Read` can run billable inference** via `POST /ai/run/{model}`.
4. **Web Analytics needs `Account Settings Read`, not any Analytics permission.**
   Granting Account Analytics Read will not open `/rum/*`.
5. **Crawler Hints has no REST read.** Zero occurrences of `crawlhints` in the
   entire OpenAPI spec.
6. **AI Crawl Control's crawler *counts* are GraphQL-only.** REST gives you
   robots.txt parsing and nothing else. Crawler allow/block is dashboard-only.
7. **`/zones/{id}/rate_limit_analytics` is for the legacy product.** It will not
   report on ruleset-engine rate limiting rules. Silent wrong answer, not an error.
8. **`/zones/{id}/analytics/dashboard` and `/rate_limit_analytics` are both
   `deprecated: true`** in the spec — reachable with today's token, but building
   on them is building on sand.
9. **`/zaraz/export` returns secret variable values** and is satisfied by the same
   `Zaraz Read` scope as the safe `/config`. The scope does not protect you.
10. **`Workers Scripts Read` allows downloading Worker source.** Not just metadata.
11. **`GET /accounts/{id}/workers/scripts` is also satisfied by `Workers Tail
    Read`** — Tail Read is not the harmless-sounding scope it appears to be.
12. **Vectorize v1 paths are deprecated**; use `/vectorize/v2/`.
13. **`POST` does not imply write.** `/ai-audit/robots/bulk`, `/d1/.../query` and
    `/observability/telemetry/query` are all POSTs that read. Do not filter tools
    by HTTP verb — filter by what the operation does.
14. **`observability.enabled` must be set per Worker.** `apps/admin` has it;
    **verify `apps/web`** before assuming production logs exist.
15. **The two-token split is deliberate.** Do not widen `CF_ANALYTICS_TOKEN` in
    place — a config token and an analytics token failing independently is the
    whole point.
16. **Free zone plan limits the datasets, not the endpoints.** Config reads work
    identically on Free; it is the analytics *retention and granularity* that are
    capped (already documented for the existing `traffic` / `acquisition` tools,
    where the 24-hour cap on the acquisition dataset is a plan artefact).
17. **`x-api-token-group` lists alternatives, not requirements.** A scope array of
    `['D1 Read','D1 Write']` means *either* satisfies the endpoint — always pick
    the narrowest.

---

## 10. Bing Webmaster Tools

Why this matters more than its traffic share suggests: `SEO-STRATEGY.md` records
Bing at **237 referrals** — behind cssgradient.io (219) and chatgpt.com (164) in
the same table, i.e. real but not dominant. The reason to invest is different:
**ChatGPT search rides Bing's index**, and Bing is **the only free backlink
report in existence**. `SEO-PASSOFF.md` lists "Backlink + competitor baseline" as
an open medium-priority gap, and `SEO-STRATEGY.md` flags "it has no links" as at
least as likely an explanation for weak rankings as anything on-page. This is the
dataset that closes that gap.

### 10.0 URGENT — SOAP/POX retire 2026-08-31 (15 days from today)

Both `https://learn.microsoft.com/en-us/bingwebmaster/` and `/api-protocols`
now carry:

> "Legacy SOAP and POX APIs will be retired on August 31, 2026. Migrate to our
> REST APIs to avoid service disruption."

**Impact on this design: none, provided you build on `/json/`.** Microsoft's
"REST API" is just the new name for the existing JSON/HTTP protocol at
`https://ssl.bing.com/webmaster/api.svc/json/...`. Per the migration notice:
all methods remain available over JSON/HTTP with identical functionality, the
API key does not need re-issuing, and quotas/rate limits/permissions are
unchanged.

Two consequences worth internalising:

- **Never use `/soap/` or `/pox/`.** Much of the sample code on the internet —
  and Microsoft's own `getting-started` page — is SOAP/WCF flavoured. It is
  about to stop working.
- **After 2026-08-31 there will be no machine-readable spec for this API.** The
  only one that ever existed is the SOAP WSDL at
  `https://ssl.bing.com/webmaster/api.svc?wsdl`, which dies with SOAP. There is
  **no OpenAPI/Swagger spec**. Types must be hand-written from the
  `IWebmasterApi` reference pages — which contain at least one copy-paste error
  and at least one stale response schema (§10.8). Consider capturing the WSDL now
  as a reference artefact while it still exists.

### 10.1 Setup steps the owner must perform

1. Sign in at [bing.com/webmasters](https://www.bing.com/webmasters) (Microsoft,
   Google or Facebook ID).
2. **Import from Google Search Console.** Per
   [Bing's announcement](https://blogs.bing.com/webmaster/september-2019/Import-sites-from-Search-Console-to-Bing-Webmaster-Tools),
   imported sites are "added and automatically verified" — no DNS record or meta
   tag needed. Sitemaps come across too. Up to 100 sites per import.
3. **Wait up to 48 hours** for traffic data to appear. Query/page stats are
   weekly-batched, so the first useful numbers can take a week or more. Empty
   responses in the first stretch are expected, not a bug.
4. **Settings** (top right) → **API Access** → accept Terms → **Generate API Key**.
5. Immediately run the two smoke tests in §10.3 and §10.5. Both are one-liners
   and either can invalidate a design assumption before code gets written.

**The API key is per-USER, not per-site** — one key covers every verified site,
and only one key can exist at a time. Deleting it breaks every application using
it. Observed format: 32 hex characters.

### 10.2 Auth — prefer OAuth, and here is the security reason

| Mechanism | Shape | Scope enforcement |
|---|---|---|
| API key | `?apikey=KEY` query param | **None — full read + write** |
| OAuth 2.0 | `Authorization: Bearer <token>` | **`Webmaster.read`** or `Webmaster.manage` |

Microsoft marks OAuth **[Recommended]**. For this server the argument is stronger
than a preference:

> **The API key carries full read+write.** With a key, "read-only" is a property
> of your code — one bug or one careless tool registration away from `SubmitUrl`,
> `RemoveSite` or `VerifySite`. With OAuth scoped to **`Webmaster.read`**, it is a
> property of the credential, enforced by Microsoft's servers. That is exactly
> the distinction this whole document has been drawing about Cloudflare scopes,
> and here it is available for free.
>
> **Recommendation: use OAuth with `Webmaster.read`.** Register the client under
> the same Settings → API Access panel. Authorize at
> `https://www.bing.com/webmasters/oauth/authorize`, token at
> `https://www.bing.com/webmasters/oauth/token`. Access tokens expire in ~3599s;
> auth codes are valid 5 minutes.
>
> The cost is a refresh-token lifecycle the API-key path does not have. If that
> is judged not worth it for a single-user internal tool, an API key is
> defensible — but then the read-only property rests entirely on §10.7's tool
> list, and that should be stated in a comment at the call site the way
> `mcp.ts` already does for its other invariants.

Base URLs (both hosts verified live to serve identically):

```
GET  https://ssl.bing.com/webmaster/api.svc/json/{Method}?apikey=KEY&param=VALUE
POST https://ssl.bing.com/webmaster/api.svc/json/{Method}?apikey=KEY
```

Every response is wrapped in `{"d": ...}`.

### 10.3 The `siteUrl` gotcha — and the pattern this codebase already uses

Bing has no URL-prefix/Domain property split. It **normalizes** the property.
Per the Bing Webmaster Team:

> "Bing webmaster tools considers all variations and normalise the website url.
> Http, https, www., Non www, etc and the all the reports are for that
> normalised URL."

Microsoft's own docs contradict themselves on trailing slashes (the
`GetRankAndTrafficStats` C# sample uses `"http://yoursite.com/"`; the
`GetUserSites` JSON sample returns `"http://example.com"` with none).

> **Do not construct the `siteUrl` string. Read it.** Call `GetUserSites` once,
> take the `Url` field byte-for-byte, cache it, and never let a tool argument
> override it.

**This is exactly the problem `search-console.ts` already solved**, and its
comment states the failure mode precisely — worth quoting because it applies
verbatim to Bing:

> "Guessing wrong does not error in any obvious way — it authenticates fine and
> returns an empty result set, which looks identical to 'no search traffic'.
> Rather than make a human know which kind their property is, ask the API what
> this service account can see and take the match."

`discoverProperty()` in `apps/admin/src/search-console.ts` is the template. Bing's
equivalent is `GetUserSites`. **Reuse the pattern, do not reinvent it.**

```bash
curl -s "https://ssl.bing.com/webmaster/api.svc/json/GetUserSites?apikey=$KEY" \
  | python3 -m json.tool
```

**Known open issue:** [microsoft/bing-wordpress-url-submission-plugin#54](https://github.com/microsoft/bing-wordpress-url-submission-plugin/issues/54)
reports a **GSC-imported** site returning "Site Not Registered/Verified In Bing
Webmaster" when its API key is used. Open, no Microsoft response. Since the owner
is importing from GSC, run the `GetUserSites` smoke test *before* building
anything.

### 10.4 Endpoint surface (READ)

All READ methods are HTTP **GET** except `GetChildrenUrlInfo` (POST). No method
requires anything beyond the single API key / OAuth token — there is no
per-endpoint permission model.

#### Traffic and queries

| Method | Params | Returns | Window |
|---|---|---|---|
| `GetRankAndTrafficStats` | `siteUrl` | `[{Clicks, Impressions, Date}]` | **Daily**, updated daily. Includes Web, Chat, News, Images, Videos and Knowledge Panel from 2023-03-24 |
| `GetQueryStats` | `siteUrl` | `[{Query, Clicks, Impressions, AvgClickPosition, AvgImpressionPosition, Date}]` | **Weekly**, ~6 months rolling. No date or top-N params |
| `GetPageStats` | `siteUrl` | same shape, `Query` holds the **page URL** | Weekly |
| `GetPageQueryStats` | `siteUrl`, `page` | queries that drove traffic to that page | Weekly |
| `GetQueryPageStats` | `siteUrl`, `query` | pages that ranked for that query | Weekly |
| `GetQueryPageDetailStats` | `siteUrl`, `query`, `page` | detailed cross-tab | Weekly |
| `GetQueryTrafficStats` | `siteUrl`, `query` | daily series for one query (top queries only) | Daily |
| `GetUrlTrafficInfo` | `siteUrl`, `url` | `{Url, Clicks, Impressions, IsPage}` | Point-in-time |
| `GetChildrenUrlTrafficInfo` | `siteUrl`, `url`, `page` | traffic per child URL | Paginated |

**History window — assume 6 months, not 16.** Bing's
[Oct 2024 announcement](https://blogs.bing.com/webmaster/October-2024/Bing-Webmaster-Tools-Extends-Search-Performance-Data-to-16-Months)
extended search performance data to 16 months, but says nothing about the API,
and a decoded live response from the maintained Python client showed **25 rows,
weekly step, spanning 175 days ≈ 6 months**. **UNVERIFIED / probably false** for
the API. Measure on the live property before promising a 16-month window.

Weekly buckets are Saturday-dated, each covering the 7 days ending Friday
midnight Pacific.

#### Backlinks — see §10.5

| Method | Params | Returns |
|---|---|---|
| `GetLinkCounts` | `siteUrl`, `page` (Int16) | `{Links:[{Url, Count}], TotalPages}` |
| `GetUrlLinks` | `siteUrl`, `link`, `page` (Int16) | `{Details:[{Url, AnchorText}], TotalPages}` |
| `GetConnectedPages` | `siteUrl` | `[{Url, VerificationStatus, VerificationStatusDetails, VerifiedDate, SubmissionDate}]` |

#### Crawl and index

| Method | Params | Returns |
|---|---|---|
| `GetCrawlStats` | `siteUrl` | `[{Date, CrawledPages, InIndex, InLinks, Code2xx, Code301, Code302, Code4xx, Code5xx, AllOtherCodes, BlockedByRobotsTxt, ContainsMalware, CrawlErrors}]` — docs say 6 months, daily |
| `GetCrawlIssues` | `siteUrl` | `[{Url, HttpCode, Issues, InLinks}]` — `Issues` is a **bitmask int** in JSON |
| `GetCrawlSettings` | `siteUrl` | `{CrawlRate: [24 ints], CrawlBoostAvailable, CrawlBoostEnabled}` |
| `GetUrlInfo` | `siteUrl`, `url` | `{Url, AnchorCount, DiscoveryDate, DocumentSize, HttpStatus, IsPage, LastCrawledDate, TotalChildUrlCount}` |
| `GetChildrenUrlInfo` | `siteUrl`, `url`, `page`, `filterProperties` | `UrlInfo[]` — **POST despite being a read** |
| `GetBlockedUrls` | `siteUrl` | blocked pages/directories |
| `GetActivePagePreviewBlocks`, `GetDeepLinkBlocks`, `GetQueryParameters`, `GetCountryRegionSettings`, `GetSiteMoves` | `siteUrl` | config reads |
| `GetDeepLink`, `GetDeepLinkAlgoUrls` | | **marked Obsolete** |

`GetUrlInfo` is Bing's rough analogue of GSC's URL Inspection — the existing
`url_inspection` tool's Bing counterpart, though with less detail (no
robots.txt verdict, no canonical resolution).

#### Sitemaps and submission state

| Method | Params | Returns |
|---|---|---|
| `GetFeeds` | `siteUrl` | `[{Url, Type, Status, Submitted, LastCrawled, UrlCount, FileSize, Compressed}]` — **the sitemap endpoint**, direct analogue of the existing `sitemaps` tool |
| `GetFeedDetails` | `siteUrl`, `feedUrl` | details for sitemap indices |
| `GetUrlSubmissionQuota` | `siteUrl` | `{DailyQuota, MonthlyQuota}` |
| `GetContentSubmissionQuota` | `siteUrl` | content-submission quota |
| `GetFetchedUrls`, `GetFetchedUrlDetails` | `siteUrl`[, `url`] | fetched-URL state |

#### Keyword research — NOT site-scoped

| Method | Params | Returns |
|---|---|---|
| `GetKeywordStats` | `q`, `country`, `language` | `[{Query, Impressions, BroadImpressions, Date}]` — weekly, ~6mo |
| `GetKeyword` | `q`, `country`, `language`, `startDate`, `endDate` | single `Keyword` |
| `GetRelatedKeywords` | `q`, `country`, `language`, `startDate`, `endDate` | `Keyword[]` |

> These take **no `siteUrl`** — this is **market-wide Bing search-volume data**,
> not your site's. That makes them a genuinely valuable free keyword-research
> source (the kind of thing people pay Ahrefs for), and it also means they are
> the one part of the surface where "read-only about my site" does not describe
> what is happening. Worth surfacing in a tool, worth labelling clearly so an
> agent does not report market volume as grabient traffic.

Date params are plain ISO dates (verified from recorded live traffic):
`?q=python+programming&country=us&language=en-US&startDate=2024-10-15&endDate=2024-11-14`

⚠️ **The `GetRelatedKeywords` doc page is broken** — its request/response samples
show `GetSiteRoles` output. A copy-paste error in Microsoft's docs. Do not trust
that page's samples.

### 10.5 Backlinks — the payoff, and the risk

**Confirmed: Google Search Console has no backlinks API at all.** The
[GSC API reference](https://developers.google.com/webmaster-tools/v1/api_reference_index)
exposes exactly four resources — `searchanalytics`, `sitemaps`, `sites`,
`urlInspection`. The Links report is UI-only. So Bing's `GetLinkCounts` /
`GetUrlLinks` genuinely is the only free programmatic backlink source. The
task's weighting is correct.

**Two-level fan-out.** `GetLinkCounts` gives a whole-site rollup — one row per
*your* page that has inbound links, with a count — and **tells you nothing about
who is linking**:

```json
{"d":{"Links":[{"Count":14,"Url":"http://example.com/page1.html"}],"TotalPages":3}}
```

`GetUrlLinks` then drills into one of your pages to get the actual referring
pages and anchor text:

```json
{"d":{"Details":[{"AnchorText":"link","Url":"http://example.com/page1.html"}],"TotalPages":3}}
```

That is the whole dataset: **referring URL + anchor text**. No first-seen date,
no nofollow flag, no domain rating, no dedupe by domain. Aggregating to
"referring domains" is your own work on top.

The access pattern is **N+1**: one `GetLinkCounts` sweep, then one `GetUrlLinks`
per linked page. With an undocumented rate limit (§10.6), budget for it and cache
aggressively — this is a daily-refresh dataset at best, not per-request.

**Rows per page: UNDOCUMENTED.** Neither doc page states a page size. `page` is
an `Int16`, capping pagination at 32,767. The UI is widely reported to cap
exports at 1,000 rows; whether that applies to the API is **UNVERIFIED**.

> ### 🚩 Go/no-go spike before committing to this
>
> An open [Microsoft Q&A thread (#5939109)](https://learn.microsoft.com/en-us/answers/questions/5939109/bing-webmaster-tools-api-getlinkcounts-and-geturll)
> reports `GetLinkCounts` and `GetUrlLinks` returning **`Links: []` /
> `TotalPages: 0`** on a verified site returning HTTP 200, with `GetUserSites`
> working correctly. The reporter tried every `siteUrl` permutation. **Microsoft
> never resolved it** — a moderator redirected to Bing Webmaster Support.
>
> Because backlinks are the highest-weighted dataset in this design, verify
> before building:
>
> ```bash
> KEY=...
> SITE=$(curl -s "https://ssl.bing.com/webmaster/api.svc/json/GetUserSites?apikey=$KEY" \
>   | python3 -c 'import json,sys; print(json.load(sys.stdin)["d"][0]["Url"])')
> echo "resolved siteUrl: $SITE"
> curl -s "https://ssl.bing.com/webmaster/api.svc/json/GetLinkCounts?siteUrl=$SITE&page=0&apikey=$KEY"
> ```
>
> Non-empty `Links` → the feature is viable. Empty on a site with known inbound
> links → try the alternate string encoding first (§10.8 gotcha 2), then treat
> the premise as unproven. Better to learn this in one curl than after a tool
> ships and starts telling the owner "you have no backlinks."

### 10.6 Quotas and rate limits

- **URL submission:** `GetUrlSubmissionQuota` returns `{DailyQuota, MonthlyQuota}`.
  The doc sample showing `5`/`24` is a stale 2019 artefact; since
  [Jan 2019](https://blogs.bing.com/webmaster/january-2019/bingbot-Series-Get-your-content-indexed-fast-by-now-submitting-up-to-10,000-URLs-per-day-to-Bing)
  the ceiling is 10,000/day with no monthly cap. But allocation is per-site and
  "determined based on the site verified age..., site impressions and other
  signals" — **a brand-new property gets a small quota. Always read the live
  value; never hardcode.** (Moot anyway, since submission is not being exposed.)
- **API call rate limits: NOT DOCUMENTED ANYWHERE.** No official rate-limit page
  exists for the Webmaster API. The retirement notice says limits are
  "unchanged", implying they exist, but no number is published. Best available
  signal: the maintained Python client defaults to **5 calls/second** with
  exponential backoff. **Treat 5 rps as a safe ceiling; the true limit is
  UNVERIFIED.** This is the constraint that makes the backlinks N+1 fan-out
  something to cache rather than call live.
- **History:** ~6 months rolling, weekly buckets, for query/page/keyword stats;
  daily for rank/traffic and crawl stats. `GetCrawlStats` is documented as 6
  months but a real recorded response contained only **30 daily rows** — measure
  rather than assume.

### 10.7 Proposed Bing MCP tools (all read-only)

Prerequisite for all three: Bing signup complete, API key or OAuth client
created, and the §10.5 spike passed. Resolve `siteUrl` once via `GetUserSites`
using the `discoverProperty` pattern from `search-console.ts` — never take it as
a tool argument.

#### P7 — `bing_backlinks` (read-only) — the highest-value tool in this document

```ts
description:
  "Who links to grabient.com, from Bing: which of our pages have inbound links " +
  "and how many, and for a given page the actual referring URLs with their " +
  "anchor text. THIS IS THE ONLY BACKLINK DATA WE HAVE — Google Search Console " +
  "has no backlinks API at all, so nothing in the `search_console` tool can " +
  "answer this. Use it when asking why a page ranks poorly: 'no links' is at " +
  "least as likely an explanation as anything on-page. Anchor text is the only " +
  "other field; there is no first-seen date, no nofollow flag and no domain " +
  "rating, and rows are per-URL rather than per-domain. Bing's index is not " +
  "Google's, so this is a strong sample, not a census.",
inputSchema: {
  page_url: z.string().url().optional(),   // omit → site-wide GetLinkCounts rollup
  page: z.number().int().min(0).max(50).optional(),
}
```

Composes `GetLinkCounts` (no `page_url`) and `GetUrlLinks` (with `page_url`).
Cache hard — this is a daily dataset, and the N+1 pattern plus an undocumented
rate limit makes live fan-out a bad idea.

#### P8 — `bing_search_performance` (read-only)

```ts
description:
  "Bing organic search performance for grabient.com: top queries and top pages " +
  "with clicks, impressions, average click position and average impression " +
  "position, plus the daily clicks/impressions series. This is the SECOND search " +
  "engine — ChatGPT search rides Bing's index, so Bing visibility is a proxy for " +
  "AI-assistant visibility in a way Google's numbers are not. Query and page " +
  "stats are WEEKLY buckets (Saturday-dated, covering the 7 days ending Friday " +
  "midnight Pacific) over roughly 6 months; the rank/traffic series is daily. " +
  "Bing returns everything it has — there is no date-range parameter.",
inputSchema: {
  view: z.enum(["queries", "pages", "daily"]).optional(),
  query: z.string().optional(),     // → GetQueryPageStats: which pages rank for it
  page_url: z.string().url().optional(), // → GetPageQueryStats: which queries drive it
  limit: z.number().int().min(1).max(500).optional(),
}
```

#### P9 — `bing_crawl_health` (read-only)

```ts
description:
  "How Bing crawls and indexes grabient.com: pages crawled and pages in the " +
  "index over time, the HTTP status-code split bingbot saw (2xx/301/302/4xx/5xx), " +
  "pages blocked by robots.txt, crawl errors, and the current crawl issue list. " +
  "Also reports submitted sitemaps with when each was last crawled and how many " +
  "URLs Bing found. Use this to tell 'Bing cannot fetch the page' apart from " +
  "'Bing fetched it and chose not to rank it' — and to confirm the permissive " +
  "robots.txt is actually being honoured. Read-only: URL submission is " +
  "deliberately not exposed.",
inputSchema: { view: z.enum(["stats", "issues", "sitemaps"]).optional() }
```

`GetFeeds` here is the direct Bing counterpart of the existing `sitemaps` tool,
and its description should mirror that tool's "submitting is deliberately not
exposed" language.

#### Optional — `bing_keyword_research` (read-only, but read the caveat)

`GetKeywordStats` / `GetRelatedKeywords` give free **market-wide** Bing search
volume. Genuinely useful for the palette/color query strategy. If exposed, the
description must open by stating that these numbers are **not grabient's
traffic** — an agent that conflates market impressions with site impressions
would produce badly wrong conclusions, and the field names (`Impressions`,
`BroadImpressions`) actively invite that mistake.

#### Explicitly NOT exposed — every Bing write method

`SubmitUrl` · `SubmitUrlBatch` · `SubmitContent` · `SubmitFeed` · `RemoveFeed` ·
`SubmitSiteMove` · `FetchUrl` · `AddSite` · `RemoveSite` · `VerifySite` ·
`AddSiteRoles` · `RemoveSiteRole` · `AddBlockedUrl` · `RemoveBlockedUrl` ·
`AddPagePreviewBlock` · `RemovePagePreviewBlock` · `AddDeepLinkBlock` ·
`RemoveDeepLinkBlock` · `UpdateDeepLink` · `AddConnectedPage` ·
`AddQueryParameter` · `RemoveQueryParameter` · `EnableDisableQueryParameter` ·
`AddCountryRegionSettings` · `RemoveCountryRegionSettings` · `SaveCrawlSettings`

`RemoveSite` and `VerifySite` deserve special mention: an agent with an API key
and a bug could **delete the property**, discarding the verification and history
this whole section depends on. That is the concrete scenario the
`Webmaster.read` OAuth scope eliminates.

### 10.8 Bing gotchas

1. **SOAP/POX die 2026-08-31.** Build on `/json/` only. Most sample code online
   is SOAP.
2. **String params: docs say JSON-quote them, reality says do not.** Microsoft's
   samples show `query=%22query1%22` — a JSON string *literal*, backslash-escaped
   then URL-encoded. The maintained client and its recorded live traffic use
   **plain URL-encoding with no quotes** and get HTTP 200. `siteUrl` is never
   quoted in any sample; `url` / `link` / `query` / `page` are. **If a call
   returns unexpectedly empty, try both encodings before concluding the data
   does not exist** — this is a plausible root cause of the empty-backlinks
   reports in §10.5.
3. **`/Date(...)/` timestamps, and the offset is optional.** Real responses
   contain both `"/Date(1316156400000-0700)/"` and bare
   `"/Date(1716015600000)/"`. Parse with `/Date\((-?\d+)([+-]\d{4})?\)/` and use
   the milliseconds; the offset is presentational. Negative values appear —
   `/Date(-62135568000000-0800)/` is .NET `DateTime.MinValue`, meaning "unset",
   and must not be rendered as a date in the year 1.
4. **Errors return HTTP 400, not 401/403**, with `{"ErrorCode":3,"Message":"ERROR!!! InvalidApiKey"}`.
   The live `Message` carries an `ERROR!!! ` prefix the docs omit — **switch on
   `ErrorCode`, never string-match `Message`.** There is no published error-code
   enumeration; `3` = InvalidApiKey and `18` = InvalidToken are the two
   confirmed empirically.
5. **An empty array and a broken call are indistinguishable.** Everything is
   `{"d": ...}`; empty reads return `{"d":[]}`. This is the single most important
   gotcha for an MCP server: the model will confidently report "you have no
   backlinks" when the truth is "the call silently failed." **Surface the raw row
   count and the resolved `siteUrl` in every tool's output**, and follow the
   `unavailable()` convention already in `mcp.ts` so a configuration failure is
   never rendered as a zero.
6. **New sites return empty for days.** Up to 48h for traffic after GSC import;
   a week or more for weekly-batched query stats; "a few days" for crawl issues.
7. **Published response schemas are stale.** Live `GetCrawlStats` rows include
   `ConnectionTimeout` and `DnsFailures`, neither of which appears in Microsoft's
   documented sample. **Parse permissively** — do not use a strict schema that
   rejects unknown fields.
8. **`GetChildrenUrlInfo` is a POST despite being a read.** Do not assume
   "read = GET" when generating the client.
9. **`GetCrawlIssues.Issues` is a bitmask int in JSON** (e.g. `32`) but an enum
   name in XML (`ContainsMalware`). No mapping table is published; you will have
   to build one.
10. **Prior-art MCP servers exist and both expose writes** —
    [isiahw1/mcp-server-bing-webmaster](https://github.com/isiahw1/mcp-server-bing-webmaster)
    and [zizzfizzix/mcp-server-bwt](https://github.com/zizzfizzix/mcp-server-bwt).
    Useful maps of the territory; **neither is the read-only design wanted here**,
    so read them for endpoint shapes, not for tool policy.

---

## 11. IndexNow

### Recommendation: do NOT build a manual IndexNow tool

Cloudflare **Crawler Hints** — which `SEO-STRATEGY.md` step 5 already has the
owner enabling — is a full IndexNow client operating on the zone's behalf. Four
reasons, in order of weight:

1. **Coverage is already near-total, and the gap points the wrong way.** Crawler
   Hints fires on cache **MISS**. `CLAUDE.md` pins `cross_version_cache: false`
   *specifically so every deploy starts from a cold edge cache* — so after each
   deploy essentially every URL is a MISS on first request and Crawler Hints
   signals broadly. The deploy-time change notification a manual tool would
   provide is the exact case Cloudflare already covers best.
2. **It is a write tool in a read-only server.** IndexNow submission is a
   mutation with side effects at third parties. Adding it breaks the property
   that makes this server safe to expose to a model, in exchange for a capability
   that is already automated. If submission is ever wanted it belongs in the
   deploy pipeline — deterministic, triggered by an actual content change — not
   in a tool an LLM decides to call.
3. **Marginal value near zero; marginal risk not.** An unattended agent with a
   submission tool can trivially breach the documented "don't resubmit unchanged
   URLs / wait at least 5 minutes" guidance and earn 429s or deprioritization.
4. **Bing's own guidance agrees**, recommending IndexNow over the Webmaster
   API's `SubmitUrl` — and Cloudflare already *is* the IndexNow client.

**Do this instead:** confirm Crawler Hints is actually toggled on (Caching →
Configuration). It is free on all plans, it is opt-in, and it is a 30-second
check that delivers the entire benefit of the feature you were considering
building. Then measure whether it is working using **read-only** signals that
already belong in the server: Bing's `GetFeeds` (`LastCrawled`, `UrlCount`) and
`GetCrawlStats` (`CrawledPages`, `InIndex` over time). That is what an analytics
server should do.

### Reference — the protocol, for completeness

Single URL: `GET https://<engine>/indexnow?url=<escaped-url>&key=<key>[&keyLocation=<url>]`

Batch: `POST https://<engine>/indexnow`, `Content-Type: application/json; charset=utf-8`

```json
{ "host": "grabient.com", "key": "<key>",
  "keyLocation": "https://grabient.com/<key>.txt",
  "urlList": ["https://grabient.com/url1", "https://grabient.com/url2"] }
```

**Key file:** UTF-8 plain text named `{key}.txt`, containing the key and nothing
else (filename and body must match). At the host root, or anywhere on the host if
declared via `keyLocation`. Key is 8–128 characters from `a-z A-Z 0-9 -`. **The
key file's location scopes which URLs you may submit** — a key at
`/mydir/key.txt` cannot authorize `/otherdir/page`. Root placement avoids this.

**Limits:** 10,000 URLs per POST. **No published daily cap** — "each participating
search engine sets its own daily submission thresholds per site." Over-submission
returns **429**; the documented failure mode is being ignored or deprioritized,
not banned.

**Submit once, not to each engine.** Engines are required to share submissions
with each other in a timely manner (re-pinging via `/indexnow?noreping` to avoid
loops). One POST to `api.indexnow.org` suffices; fanning out is redundant.

**Participating engines** (from `https://www.indexnow.org/searchengines.json`,
fetched live 2026-08-16), with endpoint probe results:

| Engine | Endpoint | Probe (invalid key) |
|---|---|---|
| Generic | `api.indexnow.org/indexnow` | 202 |
| Bing | `www.bing.com/indexnow` | 202 |
| Yandex | `yandex.com/indexnow` | 202 |
| Seznam | `search.seznam.cz/indexnow` | 403 |
| Naver | `searchadvisor.naver.com/indexnow` | 403 |
| Yep | `indexnow.yep.com/indexnow` | 422 |
| Internet Archive | `web-static.archive.org/indexnow` | — |
| Amazonbot | `indexnow.amazonbot.amazon/indexnow` | — |
| **Google** | `www.google.com/indexnow` | **404 — not participating** |

(403/422 are the *correct* responses to a deliberately invalid key — those
engines validate eagerly, the 202 engines lazily.)

**Google is out.** Absent from `searchengines.json`, 404 on the endpoint, and
absent from the FAQ's supported list. It announced a *test* in Nov 2021; five
years on there is no participating endpoint.

**The AI-visibility angle, which is the interesting part here.** Two entries are
not conventional search engines: **`amazonbot`** (feeds Alexa/Rufus-class
assistants) and **`internetarchive`** (a significant training and retrieval corpus
for LLMs). Add that Bing's index is the retrieval substrate for Copilot,
DuckDuckGo, Ecosia, Brave and Yahoo, and IndexNow is more relevant to the owner's
AI-visibility goal than its search-market-share numbers suggest. That is an
argument for making sure Crawler Hints is **on** — not for building a tool.

### Crawler Hints — verified facts

- **Free on all plans**, GA. Dashboard: Caching → Configuration → Crawler Hints.
- **Cloudflare owns the credential entirely.** Verified: `https://grabient.com/indexnow`
  and `/.well-known/indexnow` both **404** — there is no key file on the origin
  and none is needed. Cloudflare submits from its own infrastructure under its
  own IndexNow relationship. Zero code, zero files.
- **Documented limitation:** "If an asset's response has an HTTP status code
  greater than 4xx, the Crawler hints will not report that to IndexNow." Global
  zone-level setting; individual pages opt out via `X-Robots-Tag: noindex`.
- **No REST read for its status** — see §5. Confirm in the dashboard.
- Manual IndexNow and Crawler Hints can coexist (different credentials), but see
  the recommendation above for why they should not.

---

## 12. What to do next, in order

1. **Run the §0 probe** to establish what `CF_ANALYTICS_TOKEN` actually reaches —
   specifically whether `loadReferrers` has been silently returning `null`. One
   curl, and it may already fix a quietly-broken dashboard panel.
2. **Confirm Crawler Hints is enabled** in the Cloudflare dashboard. Free, one
   toggle, moots the entire manual-IndexNow question.
3. **Finish the Bing signup + GSC import**, then immediately run the two smoke
   tests: `GetUserSites` (§10.3, settles `siteUrl`) and `GetLinkCounts` (§10.5,
   settles whether backlinks return data at all). Both are one-liners and either
   can invalidate a design assumption before code is written.
4. **Decide on the Cloudflare token** (§7). The recommended four-permission
   read-only token unlocks P1–P4; declining it is a legitimate choice that costs
   only configuration-visibility tools, not any analytics.
5. **Build in priority order:** `bing_backlinks` (P7) first — it is the only new
   *dataset* in this document rather than a new view on data already reachable.
   Everything on the Cloudflare side is configuration context; valuable, but it
   does not answer a question the owner cannot currently answer at all.
