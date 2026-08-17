# Grabient: domain history, authority inventory, and a $0 relaunch plan

Research date: 2026-08-16. Every claim is tagged **MEASURED** (I fetched it), **REPORTED**
(a source asserts it, URL given), or **INFERRED**.

---

## 0. The one-paragraph version

Grabient is not a new site with a nine-year-old domain. It is a genuinely well-known tool
that peaked in July 2017 (**Product Hunt #1 Product of the Day, 581 upvotes**), accumulated
**2,012 GitHub stars**, sat essentially frozen for ~7 years, and was rebuilt twice (May 2025,
then again July 2026). The equity is real and *intact* — redirects are healthy, and there is
no legacy 404 surface because the old site had exactly one URL. The problem is not lost links.
**The problem is that every live description of Grabient on the internet is the 2017 one**, and
neither the mention corpus nor `/llms.txt` contains a single word of provenance. Search engines
and AI answer engines currently see a 2017 CSS-gradient toy, not a 2026 palette search engine
with a URL API.

---

## 1. Timeline

| Date | Event | Evidence |
|---|---|---|
| 2017-05-06 | GitHub repo `johnkorzhuk/grabient` created | MEASURED — GitHub API `created_at` |
| 2017-05 → 07 | 217 commits — the original build | MEASURED — local `git log` (89 May / 72 Jun / 56 Jul) |
| **2017-07-24** | **Product Hunt launch. Tagline "Grab a gradient". 581 upvotes. #1 Product of the Day, #2 Product of the Week.** Makers: Eddie Lobanovskiy, John Korzhuk | MEASURED — https://www.producthunt.com/posts/grabient |
| 2017-07-26 | First Wayback capture, `https://www.grabient.com/` — 2 days after the PH launch | MEASURED — CDX API |
| 2017 identity | Twitter `@unfoldco`; `og:title` "Grab yourself a gradient"; description "Beautiful and simple UI for generating web gradients"; `<title>` just "Grabient"; Create-React-App SPA; GA `UA-103030674-1` | MEASURED — raw 2017 snapshot HTML |
| 2017-08-26 | Only Hacker News submission ever: 2 points, 0 comments | MEASURED — HN Algolia, item 15103395 |
| 2017-08 → 2022-09 | 12 commits *total* across five years | MEASURED — local `git log` |
| 2019-01-11 | Dribbble Stories "5 favorite gradient picking tools" — Grabient #1, written by Renee Fleck, explicitly credits "our very own Unfold team" | MEASURED — WebFetch |
| 2018-08 → 2025-04 | Homepage HTML digest essentially frozen; shell stays 1.4–1.9 KB for ~6.7 years | MEASURED — CDX digest column |
| 2022-09 → 2025-11 | Zero commits on any ref | MEASURED — `git log --all` over the window |
| 2025-05-16 | **Rebuild #1 goes live.** First large-HTML capture (35.6 KB), apex `grabient.com`, assets under `/_build/`, `clerk.grabient.com` serving clerk-js 5.67.1 → TanStack Start + Clerk | MEASURED — CDX |
| 2025-07 → | Per-palette seed permalinks appear (`/HQJgbAjANK…`) — the first time Grabient ever had deep URLs | MEASURED — CDX |
| 2025-11 → 12 | 214 commits — heavy revival | MEASURED — local `git log` |
| 2026-01 → 03 | `/palettes/{query}` corpus and `/api/og/query` appear in the archive (135 `/palettes/` URLs captured) | MEASURED — CDX |
| 2026-03-08 | **Last successful Wayback capture of the homepage.** Everything since is 403 or 301 | MEASURED — CDX |
| 2026-07-22 | `feat(web): web-lite SSR app — full rebuild with auth + saved palettes` | MEASURED — local `git log` |
| **2026-07-24** | **Rebuild #2 promoted to production — exactly nine years to the day after the Product Hunt launch** | MEASURED — local `git log` |

The 2017-07-24 → 2026-07-24 coincidence is a free, true, and unusually good story hook.

> Note on the 2025 rebuild: the archive proves a TanStack Start + Clerk site was live in
> May 2025, but this repo's history has no commits between 2022-09 and 2025-11. INFERRED:
> that work lived on a separate branch/repo (`origin/grabient_original` and `origin/update`
> exist as remote branches). Doesn't affect any conclusion below.

---

## 2. URL structure by era, and redirect health

**2017 → 2025-04: one URL.** The CDX listing for the whole domain contains **zero deep paths
before 2025** — no per-gradient permalinks, no hash-route captures, nothing but `/` plus tracking
params (MEASURED). INFERRED: gradient state was held in client memory, not the URL.

This is the single most useful fact in this report: **there is no legacy deep-link 404 surface
to reclaim.** Nine years of backlinks all point at the homepage.

**www was canonical for the entire 2017–2025 era** — nearly every capture is `www.grabient.com`
(MEASURED). So the decade of equity sits on the www hostname.

Redirect health, all MEASURED today:

| Check | Result |
|---|---|
| `https://www.grabient.com/` | 301 → `https://grabient.com/` → 200. **Single hop.** |
| `https://www.grabient.com/palettes/purple` | 301 → apex, **path preserved** |
| Legacy v2 seed URLs (3 tested, incl. one Google-indexed) | 301 → v3 seed → 200, self-canonicalizing |
| `https://grabient.com/?ref=producthunt` | 200, `<link rel=canonical>` → `https://grabient.com/` |
| `https://grabient.com/?page=2` | 200, self-canonical (correct) |
| `/about`, `/gradients` | **404 — no provenance page exists** |

**Verdict: redirect hygiene is already good.** Nothing to fix here. Do *not* spend effort asking
people to change `www` links — the 301 passes equity and the hop is single.

### The one broken thing: Wayback is being blocked

Homepage capture status through 2026 (MEASURED, CDX):

```
2026-03-08  200   ← last successful capture
2026-03-23  403
2026-04-21  403
2026-04-30  403
2026-06-28  403
2026-08-02  403
```

I tested `archive.org_bot`, `ia_archiver`, `Googlebot`, `ClaudeBot`, and browser UAs from my own
IP — **all returned 200** (MEASURED). INFERRED: this is Cloudflare bot-scoring by IP/ASN, not a
UA or robots.txt rule. Consequence: **the current production site (live since 2026-07-24) has
never been successfully archived.** That breaks the historical record precisely at the relaunch,
and removes the "then vs now" proof the relaunch story depends on.

---

## 3. Mention / backlink inventory

### 3a. Verified today by direct fetch

| # | Source | Target URL it links to | Live? | Target resolves? | Notes |
|---|---|---|---|---|---|
| 1 | [producthunt.com/posts/grabient](https://www.producthunt.com/posts/grabient) | `www.grabient.com/?ref=producthunt` | yes | 301→200 | 581 upvotes, #1 PoD 2017-07-24 |
| 2 | [producthunt.com/products/grabient](https://www.producthunt.com/products/grabient) | same | yes | 301→200 | 36 followers, 5.0★ / 1 review, **no relaunch ever posted** |
| 3 | [github.com/johnkorzhuk/grabient](https://github.com/johnkorzhuk/grabient) | `grabient.com` (repo homepage) | yes | 200 | **2,012 stars, 91 forks**, pushed 2026-08-15 |
| 4 | [dribbble.com/stories/2019/01/11/5-favorite-gradient-picking-tools](https://dribbble.com/stories/2019/01/11/5-favorite-gradient-picking-tools) | `www.grabient.com/` | yes | 301→200 | **#1 of 5**; credits Unfold |
| 5 | [awwwards.com/inspiration/grabient-gradient-generator](https://www.awwwards.com/inspiration/grabient-gradient-generator) | `www.grabient.com/` | yes | 301→200 | in "Handy Tools and Apps for Designers" |
| 6 | [lineicons.com/blog/best-gradient-tools](https://lineicons.com/blog/best-gradient-tools) | `www.grabient.com/` | yes | 301→200 | **#1 of 10**, published 2025-12-24 |
| 7 | [magier.com/blog/best-12-gradient-tools-for-designers](https://www.magier.com/blog/best-12-gradient-tools-for-designers) | `www.grabient.com/` | yes | 301→200 | **#1 of 12**, published 2026-04-24 |
| 8 | [hongkiat.com/blog/best-color-palette-gradient-generator](https://www.hongkiat.com/blog/best-color-palette-gradient-generator/) | `grabient.com/` (**apex**) | yes | 200 | published 2026-05-01; only source that already knows it's a palette finder |
| 9 | [en.eagle.cool/blog/post/gradient-tool](https://en.eagle.cool/blog/post/gradient-tool) | `www.grabient.com` | yes | 301→200 | **#1 of 30** |
| 10 | [alternativeto.net/software/grabient](https://alternativeto.net/software/grabient) | `www.grabient.com/` | yes | 301→200 | **stale**: last updated 2017-07-25, 0 likes, 17 alternatives |
| 11 | [ui-tools.com/product/grabient](https://www.ui-tools.com/product/grabient) | `www.grabient.com` | yes | 301→200 | description is the verbatim **2017 meta tag** |
| 12 | tiny-helpers.dev | — | **LOST** | — | was linked in 2020 (`?ref=tiny-helpers` capture); **absent from `helpers.json` today** |
| 13 | [news.ycombinator.com/item?id=15103395](https://news.ycombinator.com/item?id=15103395) | `www.grabient.com/` | yes | 301→200 | 2 points, 0 comments — effectively no HN presence |
| 14 | CSS Weekly Issue 280 | `www.grabient.com/` | REPORTED | 301→200 | evidenced by archived `?utm_source=CSS-Weekly&utm_campaign=Issue-280`; `cssweekly.com` now 301s to `css-weekly.com` |

### 3b. Archive-derived referrer map (a free backlink list)

The Wayback CDX index recorded **46 distinct referrer-tagged homepage URLs** — each one is a site
that actually linked to Grabient with a tracking param (MEASURED). Beyond those already in 3a:

`onepagelove` · `uigoodies.com` · `bookmarks.design` · `postmake.io` · `toolkit.design` ·
`evernote.design` · `designgems.co` · `uifreebies.net` · `resource.fyi` · `designer.tips` ·
`awesomeindie.com` · `toolfk.com` · `bestwebsite.gallery` · `uixlibrary.com` · `kolosek.com` ·
`cvbox.org` · `tool.dance` · `opentoolz` · `mergeek.com` · `undesign` · `illustration.tools` ·
`gdtools.aliraafat.com` · `stash.tomoweb.dev` · `toolbox.necipakgoz.dev` · `designxstream.com` ·
`engigogo.com` · `gorkareta.com` · `martindellert.de` · `pinta-it` · `blog.harshadsatra.in` ·
`blog.moeminmamdouh.com` · `thomas-guillaumont` · `13c.org` · `andykk.com` · `toolsdar.cn` ·
`www.cor.com.cn` · plus newsletters: **CSS Weekly Issue 280**, **L&D Toolbox (Revue)**,
**recursia.com**, **Eagle**, and a LinkedIn post (`?trk=public_post-text`).

Liveness spot-check of 22 of these domains: **20 return 200**; `uxdatabase.io` 404s, `plantapp.io`
and `marketsplash.com` failed to connect (MEASURED).

### 3c. The pattern that matters most

**9 of the 11 live mentions point at `www.grabient.com`, and almost all of them still carry the
2017 description** — "Beautiful and simple UI for generating web gradients" appears verbatim on
ui-tools.com and AlternativeTo nine years later.

Not one of them mentions palettes, palette *search*, SVG/PNG export, or the URL API. Meanwhile
`/llms.txt` (7,023 bytes) contains **zero** occurrences of `2017`, `unfold`, `since`, `history`,
or `years` (MEASURED — its headings are Main pages / URL structure / PNG images / Machine-readable
resources / Usage notes / Constructing a palette URL from scratch).

INFERRED, and this is the core finding: an AI answer engine assembling "best gradient tools" reads
a corpus that describes a 2017 CSS-gradient toy, and reads an `/llms.txt` that explains *how* to
build a URL but never establishes *why this source is trustworthy*. The agent-first vision is
undercut at the trust layer, not the capability layer.

---

## 4. Reclamation actions (only the realistic ones)

1. **Unblock Wayback.** Add a Cloudflare WAF skip / bot-management exception for the Internet
   Archive (AS7941, and UA `archive.org_bot` / `ia_archiver`), then use Save Page Now on `/`,
   `/llms.txt`, and the top ~20 `/palettes/{query}` pages. Free, ~15 minutes.
2. **Re-list on tiny-helpers.** `stefanjudis/tiny-helpers` — 1,041 stars, pushed 2026-07-27,
   `/color/` category, submissions are PRs. It was listed in 2020 and silently dropped.
3. **Rewrite the stale description everywhere self-serve**: AlternativeTo (community-editable),
   ui-tools.com, Awwwards, and the Product Hunt *product* page. One new sentence, used everywhere,
   that names palettes + search + SVG/PNG + the URL API.
4. **Notify only the three *fresh* roundup authors** — Lineicons (2025-12-24), Magier (2026-04-24),
   Hongkiat (2026-05-01). These are actively maintained, already rank Grabient #1–#2, and "it
   relaunched, here's what changed" is a realistic ask. Do **not** chase the 2017–2019 pieces.
5. **Add `/about`** (currently 404) as the citable provenance page: launched 2017 by Unfold,
   PH #1 Product of the Day, 2k GitHub stars, rebuilt 2026, how the cosine-palette algorithm works.
6. **Do not** run a link-update campaign for `www` → apex. The 301 is single-hop and clean.
7. Minor, adjacent: `sitemap.xml` has 899 URLs and **zero `lastmod`** (MEASURED). The entire corpus
   changed on 2026-07-24 and nothing tells crawlers that.

---

## 5. The $0 relaunch story

The narrative writes itself and is entirely true: *a tool that won Product Hunt in 2017, was used
by designers for nine years, went dormant, and came back on its exact ninth anniversary — rebuilt
so that an AI agent, not just a human, can drive it.*

Exact submission targets, all free:

| Target | URL | Why it works here |
|---|---|---|
| **Product Hunt relaunch** | https://www.producthunt.com/products/grabient | PH supports launching an update against an existing product — keeps the 581 upvotes and 36 followers as social proof rather than starting from zero. PH pages rank and are heavily scraped by AI answer engines. |
| **Show HN** | https://news.ycombinator.com/submit | Never actually done — the only submission ever got 2 points in 2017. "Old beloved tool + agent-callable API" is HN-native. |
| CSS Weekly | https://css-weekly.com (submit form) | Already covered it once, in Issue 280. |
| Sidebar.io | https://sidebar.io/submit | Free, design-tool focused, 5 links/day. |
| Frontend Focus (Cooperpress) | https://frontendfoc.us | Free tool submissions. |
| Web Design Weekly | https://web-design-weekly.com | Free submissions. |
| Smashing Magazine newsletter | https://www.smashingmagazine.com/contact/ | Tool tips accepted. |
| TLDR Design | https://tldr.tech/design | Free tips inbox. |
| tiny-helpers | https://github.com/stefanjudis/tiny-helpers | PR; reclamation + relaunch in one. |
| Bookmarks.design / uiGoodies / Postmake / Toolkit.design / Designer.tips / OnePageLove | see §3b | All already linked once; all still live; re-submitting a relaunch is a normal, accepted use. |
| Dribbble | Unfold + Eddie Lobanovskiy accounts | Existing shots: [Grabient](https://dribbble.com/shots/3681200-Grabient), [Grabient 2 Branding](https://dribbble.com/shots/4961252-Grabient-2-Branding). Dribbble Stories has featured it before. A "Grabient 3" shot costs nothing. |
| GitHub | https://github.com/johnkorzhuk/grabient | 2,012 stars is a distribution list. Cut a release; add a relaunch section to the README; PR into `Gradients/awesome-gradient` and similar lists. |

Sequencing that maximises the free coverage: fix Wayback → publish `/about` + provenance in
`/llms.txt` → refresh descriptions on the directories → **then** Product Hunt relaunch and Show HN
on the same day → newsletters in the following 48h while there's a link to point at.

---

## For the strategy

1. **Put provenance in `/llms.txt` and ship a citable `/about` page** *[free]* — `/llms.txt` today
   teaches agents *how* to build a URL but gives them zero reason to trust the source; "since 2017,
   Product Hunt #1 Product of the Day, 2,012 GitHub stars, built by Unfold" is exactly the
   verifiable-entity signal that gets a tool *named* in an AI answer rather than merely used.
2. **Relaunch on the existing Product Hunt product page, not a new one** *[free]* — inherits 581
   upvotes and 36 followers as social proof, and PH pages are both high-ranking and heavily
   ingested by answer engines; a new listing throws the nine years away.
3. **Unblock the Internet Archive at Cloudflare, then Save Page Now** *[free]* — the production
   site has been unarchivable since 2026-03-08, so the relaunch is currently invisible to the
   substrate that AI systems and journalists use to verify a tool's history and continuity.
4. **Replace the 2017 description everywhere self-serve** *[free]* — nine of eleven live mentions
   still say "Beautiful and simple UI for generating web gradients", so the corpus AI reads has no
   idea palette search, SVG/PNG export, or the URL API exist; this is the cheapest way to change
   what models say Grabient *is*.
5. **Email the three 2025-12/2026-04/2026-05 roundup authors only** *[free]* — they actively
   maintain lists that already rank Grabient #1, so a relaunch note plausibly refreshes both the
   blurb and the anchor context, whereas 2017-era authors will not respond.
6. **Show HN the relaunch** *[free]* — HN presence is effectively nil (2 points, 2017), and the
   "nine-year-old design tool rebuilt as an agent-callable API" framing is unusually well matched
   to that audience; one front-page result outweighs months of directory submissions.
7. **PR Grabient back into tiny-helpers and the awesome-* gradient lists** *[free]* — it was listed
   in 2020 and dropped; these are actively maintained, high-star repos whose pages rank for
   tool-discovery queries and are cheap to re-enter (one PR each).
8. **Add `lastmod` to all 899 sitemap URLs and resubmit** *[free]* — the entire corpus changed on
   2026-07-24 and nothing signals that, so recrawl of the relaunched pages is being left to chance
   at exactly the moment the content is new.
