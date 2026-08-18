# Passoff: analytics MCP audit + dashboard rewrite

Written 2026-08-17 for a fresh session. Everything discoverable from the code is
omitted — read `apps/admin/src/` and `infra-research/ACTION-PLAN.md` first. What
follows is only what you cannot recover by reading.

## Where things stand

`admin.grabient.com` is a Hono Worker (`apps/admin`, deployed as
`grabient-admin`) behind Cloudflare Access. Three HTML pages (`/`,
`/acquisition`, `/brief`), one JSON endpoint (`/brief.json`), and an MCP server
at `/mcp` with 10 tools. Data comes from Search Console, GA4, the Cloudflare
GraphQL Analytics API, and D1.

**Auth is solved — do not redesign it.** Access Managed OAuth was enabled on the
application on 2026-08-17. The endpoint returns `401` + `WWW-Authenticate:
Bearer`, serves RFC 9728 discovery, and accepts dynamic client registration.
Claude Code connects and is verified working. Granting a person access is two
edits: the `admin-only` Access policy, and the `ADMIN_EMAILS` Worker secret
(deliberately two gates — see the comment at `access.ts:95`). Zero Trust Free
allows 50 seats.

**The code you will edit is uncommitted.** `apps/admin/*` is deployed but lives
only in the working tree and on branch `admin/analytics-mcp`. Commit it before
you start changing it, or you will lose the ability to tell your changes from
the inherited state.

## Task 1 — audit the MCP toolset

Ten tools exist: `brief`, `search_console`, `ga4`, `traffic`, `acquisition`,
`cloudflare_capabilities`, `cloudflare_graphql`, `url_inspection`, `sitemaps`,
`funnel`. Read `mcp.ts` for their shapes.

Judge them against one question: **can an agent asked "is our SEO working, and
what should we do next" answer it without guessing?** Known gaps to consider:

- No tool reads the **Bing Webmaster API** (signed up 2026-08-17; its AI
  Performance report is the only free first-party measure of AI citation).
- No tool exposes **historical** anything. Every tool returns a window ending
  now. Trend questions are unanswerable, which is most of Task 2's point.
- `cloudflare_graphql` is a raw passthrough. Powerful, but an agent must know
  the schema. Decide whether that is a feature or a gap.
- Nothing surfaces the **corpus**: palette count, which are indexed, which
  queries are curated. SEO questions often bottom out there.
- `url_inspection` exists but nothing sweeps the whole corpus (quota is
  2,000/day; 867 URLs sweep in ~2 minutes).

Be skeptical of adding tools. Ten is already near the limit where models start
picking badly. Consolidating may beat extending.

## Task 2 — dashboard rewrite

The owner wants the dashboard to answer "is what we did working?" over months,
not "what is happening now."

**Persisted briefs.** Generate a brief for a period (daily / weekly / monthly /
quarterly), store it, and keep a browsable catalog. `brief.ts` already builds
the digest; the missing half is persistence and retrieval. D1 has no table for
this yet — production tables are `palettes`, `likes`, `auth_*`,
`refine_sessions`. Migrations live in `packages/data-ops/src/drizzle/`, and
**anything under `packages/data-ops/src/` needs `pnpm build:data-ops` or apps
silently use the old `dist/`.**

**The MCP is the bridge.** Briefs must be creatable and readable through MCP
tools, not only the UI, so an agent can generate one on a schedule and reason
over the archive. Design the storage so both consume the same rows.

**Markers.** The owner wants vertical annotation lines on charts, like
Cloudflare's "2 changes" deploy marker. Sources: the Cloudflare Workers
deployments API for deploy times, plus a manual annotations table for "changed
robots.txt", "enabled Managed OAuth". Treat manual annotations as first-class —
the interesting markers are decisions, not deploys.

**Goals.** Long-term goals from this thread should be trackable objects with a
baseline, a target, and a current value, so a check-in is a query rather than an
essay.

**UI.** TanStack charts. More pages than today, each built on a data source.
The owner will supply screenshots for visual direction — ask for them rather
than inventing a look. `app.css` and `charts.ts` are the current primitives.

## Baselines, 2026-08-17 — so "improvement" is measurable

These are measured, not estimated. They are the before-picture for everything
in this thread.

| metric | value | source |
|---|---|---|
| Organic Search | 5,438 sessions / 76,614 pageviews per 28d | GA4 |
| Direct | 6,714 / 52,817 | GA4 |
| Referral | 741 / 12,926 (cssgradient.io 222) | GA4 |
| **AI Assistant** | **205 sessions / 2,040 pageviews** | GA4 |
| Top query | "gradient maker" — 75 clicks, pos 5.8 | GSC |
| Googlebot crawl | 1,152 req/day | CF GraphQL |
| meta-webindexer | 140,447 req/day (163x Googlebot) | CF GraphQL |
| Worker requests | 367,263/day, **0 errors** | CF GraphQL |
| CPU p99.9 | 141 ms (cap 10,000) | CF GraphQL |
| Spend | $3.97/mo, projected $5.60 | billing |

Indexation was the problem this thread attacked: palette pages were textually
~95% identical, had zero internal links, and existed at three URLs. All three
shipped fixed on 2026-08-17. **Whether indexation improves is the headline
question the new dashboard should answer.**

## Five things that cost this session time

1. **Behaviour is split between the Worker and the Cloudflare dashboard.**
   Grepping the repo is not evidence a control does not exist. The read rate
   limit and `ads.txt` were both real and both invisible in the code.
2. **Where RUM and GA4 disagree about attribution, GA4 wins.** Cloudflare RUM
   reports no referrer for 91% of pageloads and sees ~⅓ of traffic. Believing
   it produced a confidently backwards conclusion about channel mix.
3. **Cloudflare has no hard spend cap.** Budget alerts are informational only.
   Ceilings must live in code — see the `queryRenderGate` and pixel-budget work
   in `apps/web/src/seo.ts`.
4. **A subagent fabricated citations** when its search budget ran out.
   `seo-research/indexing-and-ai-visibility.md` carries a retraction banner.
   Treat unsourced numbers there as absent.
5. **Node 22+ or wrangler exits.** `nvm use 25`.

## Constraints

Zero revenue, **$10/month ceiling**, currently $3.97. Free Cloudflare zone, free
Zero Trust, Workers Paid. Anything proposed should be free or justify itself
against that ceiling. `grabient-dc` (the ML project's D1) reads 91.5M rows/day
from 4,320 queries — a full-scan pattern, 75% of account row reads, still inside
the allowance. An index would fix it; it is not urgent and it is not the website.

## Open, not blocking

GSC Links export (no API — manual, 100k rows). Bing AI Performance (~48h from
2026-08-17). A throwaway OAuth client `probe-delete-me` may be listed in Access.
Four unused Cloudflare API tokens carry 300+ permissions across all accounts —
worth deleting, unrelated to this work.
