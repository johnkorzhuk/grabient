# Onboarding: the Grabient admin dashboard

Written to be handed to a person or pasted to an AI agent as a starting prompt.
It assumes no prior knowledge of this repo.

---

## What this is

`apps/admin` is a Cloudflare Worker at **https://admin.grabient.com** showing
growth, engagement, traffic and acquisition for grabient.com. It is read-only: it
issues `SELECT`s against the production D1 database and calls two read APIs. It
cannot write anything, anywhere.

It is a separate worker from the public site on purpose. `apps/web` serves
grabient.com and pins `cross_version_cache: false`, so every deploy of that
worker starts from a cold edge cache — you do not want dashboard iteration on
that path. The two share a database and nothing else.

## Getting access (two gates, both required)

Access is denied by default and fails closed everywhere. Adding someone means
**two** changes; doing only one silently denies them.

1. **Cloudflare Access policy.** Zero Trust (`one.dash.cloudflare.com`) → Access
   → Applications → `admin` → Policies → `admin-only` → add their email to the
   Include rule.
2. **The allow-list secret.** This is a second, independent check inside the
   worker, so widening the Access policy alone is not enough:

   ```bash
   pnpm --filter admin exec wrangler secret put ADMIN_EMAILS
   ```

   Enter the full comma-separated list — the value is replaced, not appended to.

Sign-in is a one-time PIN emailed by Cloudflare. There is no password.

If someone reports **"Not authorized"** they passed Access but are missing from
`ADMIN_EMAILS`. **"Not configured"** (503) means a secret is unset — the worker
refuses to serve rather than fail open.

## Working on it

```bash
nvm use 25          # wrangler needs Node 22+; 20 exits immediately
pnpm install
pnpm --filter admin dev
```

`.dev.vars` holds one line (`DEV_UNSAFE_SKIP_ACCESS=i-am-running-wrangler-dev`)
which bypasses the Access check locally, because nothing sits in front of
`wrangler dev`. Never put that key in `wrangler.jsonc` — that file is deployed.

The D1 binding is `"remote": true`, so **local dev reads the real production
database**. Every query is a `SELECT`; keep it that way.

```bash
pnpm --filter admin typecheck
pnpm --filter admin deploy
```

## The five things not to break

1. **`workers_dev: false`.** Access is bound to the admin.grabient.com hostname.
   A live `*.workers.dev` URL is a different hostname, would not be covered, and
   would expose production data to anyone who guesses it.
2. **`Cache-Control: no-store, private`** on every response (`seal()` in
   `index.ts`). This is per-user production data; a cached copy outlives the
   session allowed to see it.
3. **No `migrations_dir` in `wrangler.jsonc`.** This worker must never be able to
   migrate the production database. Migrations belong to `apps/web`.
4. **The `var(--…)` chart colors.** Charts are server-rendered SVG that inherit
   CSS custom properties from the page, which is what makes dark mode a pure CSS
   swap. Renaming a token in `app.css` silently changes the charts — grep
   `charts.ts` first.
5. **The table view under every chart.** It is the keyboard and screen-reader
   path to exact values, and the fallback if the hover script fails.

## Reading the numbers without being misled

The dashboard's own `/brief` page carries the full list; the ones that catch
people out:

- **Roughly half of all pageviews are bots.** Any traffic figure not labelled
  "browser" includes them. The split is a user-agent heuristic, not Cloudflare's
  bot score (Bot Management is not on this plan), so it is a *floor* on bot
  traffic.
- **"Accounts liking" is not site traffic.** It is a few dozen signed-in accounts
  against tens of thousands of daily visitors, because liking requires an
  account. It was once labelled "active users" and caused exactly the confusion
  you would expect.
- **Distinct IPs are not people** and must never be summed across days.
- **Recent cohorts always look worse.** Activation has held at 17–19% for every
  cohort since launch; a new one below that is usually just young.
- **Traffic sources are bot-free but young.** They come from the Web Analytics
  browser beacon (crawlers do not run JS), and nothing exists before
  2026-08-15 when it was enabled.
- **Acquisition breakdowns are a 24-hour snapshot** — the plan caps that dataset
  at a 1-day query range. Not a trend.

## If you are an AI agent

Fetch **`/brief.json`** rather than scraping the pages. It carries the same
numbers plus three things the HTML does not:

- `definitions` — what each metric counts, exactly
- `caveats` — the known distortions
- `unavailable` — questions this data **cannot** answer

Read `unavailable` before answering anything about marketing channels. Several
obvious questions ("where does our traffic come from?") are not answerable from
this data, and the correct response is to say so, not to infer one.

When you add a metric, add its definition and caveats to `brief.ts` in the same
change.

## Where things live

| File | What it does |
|---|---|
| `src/index.ts` | Routes and page composition |
| `src/queries.ts` | Every D1 read |
| `src/traffic.ts` | Cloudflare zone analytics, the bot split, and RUM traffic sources |
| `src/search-console.ts` | Google Search Console; service-account auth, property auto-discovery |
| `src/charts.ts` | Chart definitions → SVG strings |
| `src/brief.ts` | The machine-readable brief |
| `src/access.ts` | Access JWT verification — read before touching |
| `README.md` | Architecture, setup, and the marketing notes |
