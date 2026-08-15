# apps/admin — internal metrics dashboard

`grabient-admin`, served at **admin.grabient.com**. A read-only view of the
production D1 database: user growth, activation, and engagement.

## Why it is a separate worker

Two reasons, and the second is the one that actually forced it.

1. **No dashboard code reaches a grabient.com visitor.** `apps/web` serves
   `dist/client` through the assets binding, which is a public bucket — anything
   built into it is fetchable by URL whether or not any page references it. A
   separate worker has no shared surface at all.
2. **Deploys stay off the critical path.** `cross_version_cache` is pinned
   `false` in `apps/web`, so every deploy of `grabient-production` starts from a
   cold edge cache. A dashboard is something you iterate on; coupling that to the
   live site's cache and deploy path is the expensive part.

Splitting it also meant the auth story didn't have to change. The better-auth
session cookie is host-scoped to grabient.com, so admin.grabient.com never sees
it — and rather than widening the cookie's domain in production auth config to
work around that, this worker doesn't use better-auth at all.

## How access works

Two independent gates:

1. **Cloudflare Access** on the hostname. Unauthenticated requests are rejected
   at the edge and the worker never executes.
2. **`src/access.ts`** re-verifies the signed `Cf-Access-Jwt-Assertion` against
   the team's public keys, then checks the email against `ADMIN_EMAILS`.

The second gate is what makes the first non-load-bearing. Everything fails
closed: unset config, missing token, unknown signer, and unlisted email all deny.

> `workers_dev` **must stay `false`.** The Access policy is bound to
> admin.grabient.com; a `workers.dev` URL is a different hostname and would not
> be covered by it.

## Almost no client JavaScript

No bundle, no asset directory, no Vite step. Charts are built with
`@tanstack/charts` and rendered to SVG strings in the worker via
`renderChartSvg`, which needs no DOM. Tailwind's output is imported as a text
module and inlined into a `<style>` tag.

The one exception is `CHART_SCRIPT` in `html.ts`: a hand-written ~2KB inline
hover layer (crosshair, tooltip, arrow-key navigation). The charting library's
own client runtime would have cost ~100KB and forced a bundler; the server
already resolves every datum to a pixel position and preformats its label, so
the script only does nearest-point lookup and positioning. This is safe here
because the page sits behind Cloudflare Access — the "no client code" rule was
about grabient.com's visitors, and none of them can reach this worker.

Chart marks reference colors as `var(--…)` rather than hex. Because the SVG is
inlined, the custom properties in `app.css` cascade into it, so dark mode is a
pure CSS swap with no second render and no theme script.

Every chart still carries a "Table view" with exact values. Tooltips enhance,
they never gate: the table is the keyboard- and screen-reader path and the
fallback if the script ever fails to run. Don't remove it.

## Configuration

Three values, none of them in git — this repository is public and all three
identify either a person or our Zero Trust setup:

| Name | What it is |
|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | team domain, e.g. `yourteam.cloudflareaccess.com`, no protocol |
| `CF_ACCESS_AUD` | the Access application's Application Audience (AUD) tag |
| `ADMIN_EMAILS` | comma-separated operator allow-list |
| `CF_ANALYTICS_TOKEN` | API token, Zone → Analytics → Read on grabient.com |
| `CF_ZONE_ID` | grabient.com's zone id |

The last two are optional: without them the traffic and acquisition sections are
omitted and the D1-backed half still renders.

To be clear about what they are *not*: there is no shared secret anywhere in
this design. Access tokens are signed by Cloudflare's private key and verified
against its **public** JWKS, so knowing the AUD or the team domain does not let
anyone mint a valid assertion. They are kept out of the repo because they
fingerprint the setup and expose an address, not because leaking them would
break the gate.

They are stored as encrypted Worker secrets.

### There is only one set of them

Worker secrets *are* per-environment — with named environments you would set each
one twice, `wrangler secret put X` and `wrangler secret put X --env staging`.
This app has no named environments, so there is no flag and no second copy:

| Where | Auth | What it needs |
|---|---|---|
| `wrangler dev` (local) | bypassed | `.dev.vars`, one line, no real values |
| `grabient-admin` (remote) | Cloudflare Access | the three secrets |

Locally the three Access values are not just unnecessary, they are actively
wrong to set: nothing sits in front of `wrangler dev`, so no assertion ever
arrives and verification could only fail. `access.ts` takes the `.dev.vars`
bypass instead. So the real values exist in exactly one place — Cloudflare.

There is deliberately no staging admin. A second environment would mean a second
hostname, a second Access application, a second AUD and a second set of secrets,
to guard a dashboard with one user and no public traffic. If that changes, add an
`env.staging` block to `wrangler.jsonc` and re-run each
`wrangler secret put --env staging`.

## Setup (one time)

Order matters: the worker must exist before a domain can point at it, the domain
must exist before Access can protect it, and the AUD tag only exists once the
Access application does.

1. **Deploy once, unconfigured.** It answers 503 to everything, which is safe
   and is the point — it just needs to exist so the next steps have something to
   attach to.

   ```bash
   pnpm --filter admin deploy
   ```

2. **Attach the hostname.** Dashboard → **Compute (Workers)** → `grabient-admin`
   → Settings → **Domains & Routes** → Add → Custom domain →
   `admin.grabient.com`. The DNS record is created for you since the zone is
   already on Cloudflare. As with `apps/web`, the hostname is deliberately not in
   `wrangler.jsonc`.

3. **Create the Access application.** **Zero Trust** → Access → Applications →
   Add an application → **Self-hosted**:
   - Application domain: `admin.grabient.com`
   - Policy: Action **Allow**, Include → **Emails** → your address

4. **Collect the two identifiers.**
   - AUD: the application's **Overview** tab, "Application Audience (AUD) Tag"
   - Team domain: Zero Trust → **Settings** → General → "Team domain". It is
     also the hostname in the URL of your Access login page.

5. **Set the secrets.** Each command prompts for the value; nothing is echoed and
   nothing is written to the repo.

   ```bash
   pnpm --filter admin exec wrangler secret put CF_ACCESS_TEAM_DOMAIN
   ```

   ```bash
   pnpm --filter admin exec wrangler secret put CF_ACCESS_AUD
   ```

   ```bash
   pnpm --filter admin exec wrangler secret put ADMIN_EMAILS
   ```

Secrets take effect immediately — no redeploy needed. Visit
`https://admin.grabient.com`; you should get the Cloudflare login, then the
dashboard.

To change who has access later, update the Access policy **and** re-run the
`ADMIN_EMAILS` secret — both gates are enforced independently.

## Local development

`wrangler dev` has no Access in front of it, so put the bypass in `.dev.vars`
(gitignored, and never uploaded by `wrangler deploy`):

```
DEV_UNSAFE_SKIP_ACCESS=i-am-running-wrangler-dev
```

Never put that key in `wrangler.jsonc` — that file *is* deployed.

```bash
pnpm --filter admin dev
```

The D1 binding is marked `"remote": true`, so `wrangler dev` reads the **real
production database** rather than an empty local simulation — the opposite of the
`apps/web` choice, and deliberately so: `apps/web` writes, this only reads, and a
dashboard full of zeroes is useless. Every query in `src/queries.ts` is a
`SELECT`; keep it that way. There is deliberately no `migrations_dir` here, so
this worker cannot migrate the production database.

## What the numbers mean

- **Activation rate** — share of all registered users who have ever liked a
  palette. Cohorts under 30 users are dropped from the cohort chart; the launch
  month had a single user whose 100% bar flattened every real cohort.
- **Accounts liking each month** — distinct accounts that liked at least one
  palette that month. Deliberately not called "active users": it is a few dozen
  accounts against tens of thousands of daily visitors, because liking requires
  an account. Likes rather than sessions: `auth_session` only retains a rolling window
  (nothing before 2025-12), and a returning user inside their 7-day session never
  creates a new row, so sessions badly undercount.
- **The in-progress month** is excluded from every monthly series and shown in
  the "Total users" tile instead, with a straight-line projection. A part-month
  bar beside full months reads as a cliff.

---

# Marketing readiness

Notes for a marketing push, and for whoever (or whatever) reads this dashboard
during one.

## The pages

| Page | What it answers |
|---|---|
| `/` | Growth, engagement and the visitor→signup funnel |
| `/acquisition` | Where visitors are, what device, what they read |
| `/brief` + `/brief.json` | The same numbers with definitions, caveats and known gaps |

`/brief.json` is the one to hand an AI agent. It carries three things a chart
cannot: what each metric counts, the distortions in the data, and — most
importantly — an explicit `unavailable` list of questions the data does not
support. An agent that reads it will say "referrer attribution isn't collected"
instead of inventing a channel breakdown. **When you add a metric to the
dashboard, add its definition and caveats to `brief.ts` in the same change.**

## Attribution: shipped 2026-08-15

Working in production. A first-party `gb_attr` cookie captures `utm_source`,
`utm_medium`, `utm_campaign`, the external referrer host and the landing path on
first visit; better-auth's `user.create.before` hook copies them onto `auth_user`
at account creation. Six columns, migration `0021`.

**A cookie, not localStorage**, because Google sign-in is a redirect flow and the
account row is created in a server-side callback where no client storage exists.
`SameSite=Lax` specifically — Strict is not sent on the return leg from Google
and every social signup would record as direct.

**First touch, never overwritten.** Someone who arrives from a campaign, leaves,
and returns a week later via search is credited to the campaign.

Two things that are permanently true and easy to get wrong:

- **Nothing before 2026-08-15 has attribution**, and it cannot be backfilled.
  Compute channel shares over attributed accounts, never over all 3,554.
- **Only accounts are attributed.** A visitor who lands from an ad and leaves
  without signing up is counted by Cloudflare but tied to no source. Closing
  that needs Web Analytics or Analytics Engine — see below.

Verified end to end on 2026-08-15: an account created at 20:45:50 carried
`attribution_at` of 20:43:59, i.e. the cookie written on landing survived the
OAuth round trip and was read back by the server two minutes later.

### Conversions

`sign_up` and `login` now fire from `analytics.js` with the attribution tags
flattened on. Sign-up cannot be detected at the button (both methods hit the same
endpoint, and social accounts are created on a page the client never runs on), so
it is inferred from the session's `createdAt` inside a 5-minute window, guarded by
`sessionStorage` against re-firing on route swaps.

Liking was **already** tracked as `save_gradient`/`unsave_gradient` — an earlier
note in this file claimed otherwise; it was written as a ternary and missed by
grep.

### PostHog

`advanced_disable_decide: true` stopped the ~41k/day flag polling, and the manual
`$pageview` capture is gone (Zaraz already sends pageviews to GA4). That is
roughly 5M events a month of duplication removed from a 1M tier.

**4. Google Search Console — done, needs credentials.** `src/search-console.ts`
is built and deployed; it activates the moment `GSC_SERVICE_ACCOUNT` is set.

1. Google Cloud console → enable the **Google Search Console API**.
2. **Credentials → Create credentials → Service account** (no IAM role needed —
   Search Console permissions are granted in Search Console, not IAM).
3. **Keys → Add key → JSON**. This one *is* a credential: it contains an RSA
   private key. Not the same class of thing as the Access AUD tag.
4. In Search Console → **Settings → Users and permissions**, add the service
   account's `…iam.gserviceaccount.com` address with **Restricted** permission.
   Enabling the API does not grant data access; this step is what does, and it
   is the one people miss.
5. `pnpm --filter admin exec wrangler secret put GSC_SERVICE_ACCOUNT < key.json`
   — piped from the file, because the PEM is multi-line.

`GSC_PROPERTY` is deliberately **not** required: the loader calls `sites.list`
and discovers whether the property is `sc-domain:grabient.com` or
`https://grabient.com/`. Getting that wrong returns an empty result rather than
an error, so it is not something a human should have to know. Set it only to
disambiguate between several properties on the same host.

Auth is two-legged OAuth: sign a JWT with the account key, exchange it for a
bearer token. Tokens are cached for their hour rather than re-minted per load.

**4b. What Search Console gives that nothing else does.** Organic search is almost certainly the
channel here — `/palettes/purple`, `/palettes/blue`, `/palettes/rose` are the top
content — and GSC is the only source of impressions, queries and ranking. It has
a free API and would slot in beside `traffic.ts`.

## Reading the numbers during a push

- **Watch `signups_per_100k_browser_views`, not raw signups.** A push that
  doubles traffic and doubles signups has changed nothing about the funnel.
- **Check the bot share first.** It moves fast — it went from ~10k to ~160k
  pageviews a day in one week in August. A "traffic win" that does not move
  browser pageviews is a crawler.
- **Don't read the acquisition breakdowns as trends.** They are a 24-hour
  snapshot; this plan caps that dataset at a 1-day query range.
- **Give recent cohorts time.** Activation has run 17–19% for every cohort since
  launch; a new cohort below that is usually just young, not worse.

## Cloudflare tooling worth adding

Researched against this account and zone, so the availability notes are
measured rather than assumed.

### Cloudflare Web Analytics — free, and it fixes the referrer gap

The single highest-value addition. It is a JS beacon (free on every plan) whose
data lands in the GraphQL API as `rumPageloadEventsAdaptiveGroups`, and unlike
the zone request dataset **it carries `refererHost`** — the exact dimension
whose absence is why there is no channel breakdown today.

Two problems, one product:

- **Referrers.** Organic vs social vs direct becomes answerable.
- **Bots.** Because it is client JavaScript, crawlers that do not execute JS
  never appear. That is a far cleaner human number than the user-agent heuristic
  in `traffic.ts`, which is only ever a floor.

**Enabled 2026-08-15 and consumed by `loadReferrers()` in `traffic.ts`.** Two
things cost time getting here and are worth writing down: the RUM setting was
sitting on *Disable* even though the site listing said "Automatic setup" (those
are different fields), and the dataset is **account-scoped**
(`viewer.accounts.rumPageloadEventsAdaptiveGroups`), not zone-scoped — a
zone-level query returns `unknown field`, which reads exactly like "not
available on your plan" and sent me down the wrong path for a while.

### Workers Analytics Engine — the way to track a paid ad properly

This is the answer to "I bought an ad, did it work". A binding on the worker with
`writeDataPoint({ blobs, doubles, indexes })`: writes are non-blocking, and the
data is queryable over a SQL API at
`/accounts/{account_id}/analytics_engine/sql`.

Why it beats another third-party tag:

- **First-party.** No vendor quota to blow through, and no extra consent
  surface — the events never leave Cloudflare.
- **Server-side.** Written from the worker during the request, so ad blockers
  and JS-disabled clients do not create holes in the funnel.
- **Cheap and high-cardinality.** Campaign, source, medium, landing path and
  country per event, without a per-event bill that punishes detail.

The shape for campaign tracking: one data point on any request arriving with
`utm_*` parameters (blobs = source/medium/campaign/path, index = campaign), and
one on the signup itself. Joined on campaign, that is a real acquisition funnel
— impressions and clicks from the ad platform, landings and signups from here —
and it complements the first-touch columns on `auth_user`, which answer the same
question for accounts but cannot see visitors who never signed up.

Nothing is bound today; `wrangler.jsonc` has no `analytics_engine_datasets`.

### The rest, briefly

- **Pipelines** — streams high-volume events into R2 for archival and replay.
  Worth it only once Analytics Engine's sampling starts to bite; overkill now.
- **Logpush** — raw HTTP logs including the referer, but the HTTP requests
  dataset is Enterprise-only, so it is not an option on this plan.
- **Bot Management** — a paid add-on that would replace the user-agent
  heuristic with a real per-request bot score. The most direct fix for the
  biggest caveat on this dashboard, if the traffic ever justifies the spend.
- **Zaraz** — already in use for GA4. It also supports server-side event
  delivery, which would let conversions reach GA4 without client JS.

### Suggested order

1. ~~**Web Analytics**~~ — done, 2026-08-15.
2. **Analytics Engine** — before spending money on ads, not after. It is the
   piece that would tie an individual ad click through to a signup; today the
   two halves (aggregate sources, per-account first touch) cannot be joined.
3. **Bot Management** — only if the bot share starts distorting decisions.
