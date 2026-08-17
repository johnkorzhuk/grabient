# Measured consumption, 2026-08-17

Every number here was read from the Cloudflare GraphQL Analytics API against
account `f846204052f664d57da7acde8f6803cd`, 24h window. Nothing is estimated.
This is the empirical companion to `cost-surface-audit.md` (what the code
*could* cost) and `pricing-and-spend-controls.md` (what Cloudflare charges).

## Workers, per script

`workersInvocationsAdaptive`, 24h:

| script | requests | errors | subrequests | CPU p50 | CPU p99 | CPU p99.9 |
|---|---:|---:|---:|---:|---:|---:|
| **grabient-production** | 367,263 | **0** | 3,964 | 2.6 ms | 91 ms | **141 ms** |
| grabient-data-collection | 1,448 | 0 | 0 | 4.0 ms | 8.3 ms | 17 ms |
| grabient-lite (staging) | 1,004 | 0 | 69 | 13.8 ms | 108 ms | 123 ms |

**The single most reassuring number in this document: `cpuTimeP999` is 141 ms
against a `limits.cpu_ms` of 10,000.** The wrangler cap sits ~70x above the
worst request actually observed, so it is a runaway guard, not a live financial
exposure. Nothing in production is anywhere near it.

Zero errors across 370k requests.

## D1 — and the big number is not the website

`d1AnalyticsAdaptiveGroups`, 24h. Database IDs resolved against the D1 REST API:

| database | size | read queries | **rows read** | rows written |
|---|---:|---:|---:|---:|
| `grabient-dc` (data-collection) | 344 MB | 4,320 | **91,506,240** | 0 |
| `grabient-prod` (the website) | 6.4 MB | 52,792 | 30,725,648 | 128 |
| `grabient` (staging) | 1.8 MB | 836 | 69,848 | 0 |

Two observations.

**`grabient-dc` reads 21,181 rows per query.** 4,320 queries producing 91.5M row
reads is a full-table-scan pattern. It is also **not grabient.com** — it is the
ML data-collection project, and it accounts for 75% of all D1 row reads on the
account. If D1 ever becomes a cost problem, that is where to look first, and
the fix is an index, not anything to do with the website.

**The website itself reads 582 rows per query** across 52,792 queries — normal
for list pages. ~921M rows/month.

Account total is ~122M rows/day ≈ **3.7B rows/month**.

## KV

`kvOperationsAdaptiveGroups`, 24h, by namespace:

| namespace | reads | writes |
|---|---:|---:|
| `f43a67e1…` | 10,970 | **11,420** |
| `e8a90572…` | 4,790 | 660 |
| `07c7e76f…` | 230 | 0 |
| `04596938…` (SEARCH_CACHE, staging) | 60 | 50 |
| `a06cc24c…` (OG_IMAGE_CACHE, staging) | 10 | 0 |

Writes are the expensive KV operation. ~11.4k/day ≈ 342k/month.

## Workers AI

| model | calls (24h) | neurons |
|---|---:|---:|
| `@cf/google/embeddinggemma-300m` | 765 | **5.47** |

765 embeddings a day against ~367k requests confirms the KV search cache is
doing almost all the work. Neuron consumption is a rounding error.

## Vectorize and Durable Objects

- `vectorizeQueriesAdaptiveGroups`: **no rows returned for this window.**
  Monthly billing shows 14.34M queried dimensions, so the dataset either lags or
  keys differently than queried here. **UNVERIFIED** — do not conclude usage is
  zero.
- `durableObjectsInvocationsAdaptiveGroups`: **2 requests/day** on
  grabient-production. Consistent with `checkRateLimit` guarding only writes
  (contact form, like toggle) — the read rate limit is a Cloudflare rate
  limiting rule, not the DO.

## What this says about the shape of the risk

Production is ~367k requests/day ≈ 11M/month, which is the dominant billable
line at $0.30/M over the 10M included. Everything else — CPU, D1, KV, AI, DO —
is currently well inside included allowances.

The exposure is therefore **linear in request count**, not in any per-request
cost bomb. There is no operation in the measured data that is individually
expensive enough to matter; the way this bill grows is by serving a lot more
requests, not by serving a few catastrophic ones.

The one structural caveat worth carrying into the audit: the rate limiting rule
exempts `cf.client.bot`, so every Cloudflare-verified crawler bypasses it
entirely, and `meta-webindexer` alone already does ~140k requests/day. See
`cost-surface-audit.md` for what that could scale to.
