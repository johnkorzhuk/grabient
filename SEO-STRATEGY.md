# Grabient — SEO & Agent-Distribution Strategy (v2)

Written 2026-08-16 by a Fable session; v2 incorporates the adversarial critic's 12
defects (`seo-research/critic.md`) and the owner's GA4 correction. Evidence:
`seo-research/*.md` (7 fleet reports + critic), `seo-research/data/` (brief + traffic
anatomy), live GSC/GA4 UI screenshots from the owner, direct curls, git archaeology.
Supersedes `SEO-PASSOFF.md` where they conflict.

**How to use**: "Do-first" = owner dashboard actions. Phase 1 is two SMALL DEPLOYS
(deliberately split). Later phases are gated as marked. Every code item carries a
file:line anchor from `seo-research/code-verification.md`.

---

## The thesis

This is a **recovery**, not a cold start. GSC's Achievements panel (owner screenshot,
2026-08-16) records **9K+ clicks/28 days in March 2021** (~320/day) — earned by a
one-URL SPA. Today: ~196 clicks over the first ~2-3 days of data (~65-100/day), average
position 8.2, ranking 3-5 on the same head-term cluster. The authority survived; what's
missing is **vocabulary** (the site says "palettes" where searchers and winners say
"gradient"), **machine-readability** (zero `<img>` for Google Images; zero JSON + zero
CORS for agents), and **story** (every page AI models read still describes the 2017
product). Treat 300 clicks/day as the aspiration the domain has already proven once,
not a forecast.

Two channels: **Google** (recover, then pass, the 2021 ceiling via the generator
cluster + color long-tail + images) and **agents** (own the empty color/palette slot in
the MCP ecosystem before a stranger wraps the API — the thecolorapi precedent). All
~$0 in cash; owner-hours are the real budget and are estimated per phase.

## The money question (open — owner decision)

The critic's top finding: this plan optimizes clicks and installs, but **no monetization
exists in the product** (payment code: none; Polar removed 2026-07). Signups (174/mo)
convert nothing. The strategy is still valid as audience-building, but Phase 3+ effort
allocation depends on the intended model. Options, cheapest-to-operate first:
1. **API-as-product**: free tier + paid volume/commercial tier on the render/JSON/MCP
   API. Fits the agent-native bet; the MCP server becomes the funnel.
2. **Pro features**: paid exports (4K/SVG packs), team libraries, sync.
3. **Sponsorship/affiliate**: design-tool sponsors on high-traffic pages; lowest lift,
   ceiling scales with traffic only.
4. **Donations/GitHub Sponsors** (2,012★ repo): near-zero lift, near-zero ceiling.
**Owner decision 2026-08-16: deferred deliberately — "traffic = any route to money,
let's get there first."** So: build audience now, keep signups/activation on every
target row as the conversion proxy, and revisit at the Phase-3 checkpoint. The one
constraint this imposes: don't foreclose options — keep the API shape and palette
corpus ownable (self-referential `url` in JSON, own the MCP namespace) so an
API/Pro tier stays possible later.

---

## Measured reality (2026-08-16)

| Fact | Value | Source |
|---|---|---|
| Google clicks now | 196 over ~2-3 days of data (~65-100/day), pos 8.2 | GSC UI (data began ~08-13) |
| Google clicks, Mar 2021 | ≥9K/28d (~320/day) — achievement badge | GSC Achievements (owner screenshot; provenance: Google's own record for this property, predating the 08-15 verification) |
| Top queries (clicks, window) | gradient maker 32 · gradient generator 27 · grabient 20 | GSC UI |
| GA4 humans (bot-filtered, 28d) | 13,429 sessions · 9,819 users · ~5,136 pageviews/day | GA4 Data API, property 371413172 |
| GA4 channel mix | **Organic Search 40% of sessions and the best-engaging channel** (57% vs Direct's 30%); Direct 53%; AI assistants 254 sessions/28d | `data/ga4-2026-08-16.md` |
| Top non-search sources | cssgradient.io 219 · chatgpt.com 164 · doubao 52 · gemini 38 — all ahead of or near Bing (237) | same |
| Color pages | thousands of GA4 views (blue 2,088 · purple 1,207 · **green 900, not even in the sitemap**) but **zero Google clicks** — internal navigation only | GA4 + GSC cross-read |
| CF "browser" pageviews | ~4-6K/day pre-flood baseline; 50-250K/day spoofed-bot floods since 03-26 | `data/traffic-anatomy.md` |
| True human traffic | bracketed: GA4 (undercounts: adblock/consent) ≤ truth ≤ CF browser baseline (overcounts: UA spoofing) | both |
| Funnel | 174 signups/mo; ~17-18% ever activate | brief.json |
| cssgradient.io embed | iframes www.grabient.com as default tool + **followed** sidenav link, since ≤Dec 2025 | curl + Wayback |
| AI crawler reality | **Cloudflare managed robots.txt Disallows GPTBot/ClaudeBot/CCBot/Google-Extended above the welcome rules — policy inverted in production** | curl-verified twice |
| Wayback | 403'd since 2026-03-08; current site never archived | history report |
| GSC API | populates ~08-19 (T-3 window lag) | measured |
| GA4 tag visibility | Zaraz injects only for non-bot-scored clients — curl sees no tag; **"GA4 not collecting" was this session's error, corrected** | owner + mechanism |

SERP facts that shape the plan (fleet, search-API-based — treat ordinals as
directional, not exact):
- "gradient maker/generator/creator/color generator/picker" = **one SERP**; winners
  rank one page for all. Grabient pos ~3-5. Separate pages would cannibalize.
- Color demand flips from stock-image SERPs ("purple gradient" ≈ 5/10 images) to
  winnable tool SERPs with one modifier ("purple gradient color palette" ≈ 9/10 tools).
  `/palettes/{slug}` is **generative** — 12/12 unlisted color slugs already return
  complete 200 pages. Color expansion = a sitemap list edit.
- Exact-match title/H1 + sibling-hub internal links beat word count (colordesigner #1
  on ~320 words; css-gradient.com beats us on 70).
- AI Overviews fire on only ~5-8% of transactional queries and are retreating there;
  blue links carry the value on grabient's money terms. AIO upside = informational
  pages grabient doesn't have yet.
- MCP color/palette category: 2 hobby palette servers total, no DNS-verified brand.
  thecolorapi got wrapped by a stranger because it was free+no-auth+JSON+CORS;
  grabient lacks exactly JSON+CORS.
- Brand note (directional): a directory page may outrank grabient.com for "grabient";
  77% brand CTR says it's not bleeding badly. Fix via entity schema, skip the alarm.

---

## Do-first: owner dashboard actions (~45 min total, this weekend)

1. **Cloudflare → Security → Settings → "Bot traffic" → turn OFF the managed
   robots.txt AI-training block**, and check **AI Crawl Control** isn't blocking the
   same bots at the network layer. Verify: `curl https://grabient.com/robots.txt`
   should begin with YOUR "all crawlers welcome" comment, no "BEGIN Cloudflare Managed
   content". Until then, GPTBot/ClaudeBot/CCBot cannot read the site and the
   agent-visibility work is dead on arrival. (Caveat: confirm your GA4 bot-blocking
   setup is separate — it is: that's Zaraz injection filtering, not this robots toggle.)
2. **Rendered-DOM test — PARTIALLY RESOLVED (measured 2026-08-16, headless Edge,
   1280×900 + 390×844)**: query pages keep the full 24-card SSR grid and all
   `role="img"` labels after hydration at both viewports — **the color-page bet is
   cleared**. The homepage is the flagged page: the virtualizer deletes `#grid-ssr`
   and renders only viewport-visible cards (24→8 seed links desktop, 24→4 mobile;
   labeled previews 25→2). Googlebot renders with a very tall viewport (~10k px) so it
   likely retains more — the remaining owner check is GSC URL-inspect of `/` only:
   View crawled page → HTML → count `href="/_` occurrences. If thin there too, the
   fix is in `entry.tsx`: overscan the virtualizer to render all fetched cards, or
   don't remove `#grid-ssr` until first scroll. Seed pages have no virtualizer
   (untested but structurally unaffected).
3. **Cloudflare rate-limiting rule + billing spend alarm.** Precondition for the
   CORS-open JSON/MCP launch. Free-plan constraints verified against Cloudflare docs
   2026-08-16: 1 rule, 10s period only, 10s mitigation only, IP-only counting, Path +
   Verified Bot the only usable expression fields, no `log` action (cannot observe
   first), and **cache HITs count** — "apply to cached assets" cannot be disabled
   below Business, so the counter is dominated by cheap edge hits, not Worker renders.
   ```
   (not cf.client.bot and (
       starts_with(http.request.uri.path, "/api/")
       or ends_with(http.request.uri.path, ".png")
       or ends_with(http.request.uri.path, ".json")))
   ```
   **300 requests / 10 seconds per IP, action Block** (returns 429 by default —
   correct: Google treats 429 as overload and slows down, while 403 drops URLs from
   the index). 300 leaves room for ~12 list-page views/10s once each card carries an
   `<img>`, plus NAT/CGNAT sharing; below ~200 expect false positives. Verify the
   dashboard's "Verified Bot" field emits `cf.client.bot` (docs conflict); if the
   expression is rejected, drop that clause and keep the threshold — 429 is safe for
   crawlers regardless. Note this is a burst brake only: with a 10s window it cannot
   stop the observed distributed flood, and PerplexityBot lost verified status in
   2025 so it is not exempted.
4. **Cloudflare WAF exception for the Internet Archive** — ✅ RULE DEPLOYED 2026-08-16
   (`allow-internet-archive`: UA archive.org_bot/ia_archiver or ASN 7941 → Skip
   custom+managed+SBFM+UA-blocking+BIC+Security-Level; rate limiting deliberately NOT
   skipped since the UA is spoofable). **STILL PENDING — REVISIT:** Save Page Now
   still returns "Job failed" immediately after deploy. Next diagnostics, in order:
   (a) Cloudflare → Security → Events, filter ASN 7941 / archive.org_bot — if no
   events, the block is on archive.org's side; (b) retry SPN while logged into a free
   archive.org account (anonymous SPN is heavily rate-limited); (c) retry in 24-48h
   for propagation. The site has been unarchivable since 03-08 and the relaunch story
   needs a then-vs-now capture.
5. **Cloudflare → Caching → Configuration → enable Crawler Hints** (free IndexNow).
6. **GSC**: glance at Security & Manual Actions (expected clean); submit
   `sitemap.xml` if absent.
7. **GA4**: click the "Link Search Console" recommendation card (1 min). Then GA4
   Admin → Property access management → add the GSC service account's `client_email`
   as **Viewer** (property 371413172), and put the service-account JSON in
   `apps/admin/.dev.vars` (`GSC_SERVICE_ACCOUNT={...}` one line) so sessions can query
   GA4 + full GSC locally.
8. **Bing Webmaster Tools** (free): sign up, import from GSC — ChatGPT search rides
   Bing, our Bing depth is unverified, and it's the only free backlink report.

---

## Phase 1 — Two small deploys on pages that already rank (~4-6 owner-hours)

**Deploy 1 (query pages + plumbing — nothing here risks current clicks):**
1. **Query pages say "gradient", head-term-first**: change `queryHeading`'s three
   `"… palettes"` suffixes (`semantic-search.ts:95,101-102`) to `"… gradient palettes"`
   AND flip the title template `` `Grabient — ${heading}` `` → `` `${heading} | Grabient` ``
   (`index.ts:467`). Net title: "Purple Gradient Palettes | Grabient"; H1/description/
   OG-alt inherit; embeddings untouched. (Critic defect 2: without the `:467` flip the
   brand stays first and the fleet's pattern isn't actually applied.)
   Add visible hex codes + a copyable CSS block on query pages while in the template —
   that's what flips image-SERPs to tool-SERPs we can win.
2. **Sitemap work** (one PR): +20 color slugs to `POPULAR_SEARCHES`
   (`popular-searches.ts:17-47` — verified safe: live chips come from the provider;
   the passoff's dual-use warning is moot): green, pink, red, orange, yellow, black,
   gold, silver, teal, navy, mint, lavender, beige, cream, sky-blue, dark-blue,
   dark-purple, sage-green, hot-pink, blue-purple. Plus `<lastmod>` (extend
   `getPopularPaletteIds`, sole-caller-verified; `pnpm build:data-ops`), failure
   honesty (`index.ts:1037`: empty seeds → no-store/503, never a cached 33-URL map),
   and a **sitemap index split** (`sitemap-searches.xml` / `sitemap-palettes.xml`) so
   GSC reports indexing per route family. Fix the 6 broken percent-encoded/emoji chip
   slugs (give teal a clean slug) in the same pass.
   *Gate cleared 2026-08-16: query pages keep their full SSR grid after hydration
   (measured, both viewports) — this item is safe to ship.*
3. **Footer `<a>`s to /newest + /oldest** (`pages.ts:376-401`, 2 lines).
4. **X-Robots-Tag: noindex when hostname ends `.workers.dev`** (`index.ts:126-148`) —
   kills the staging AND the unflagged production workers.dev duplicates, keeps
   staging smoke-testable.
5. **ItemList JSON-LD fix** (`index.ts:477-482`): `numberOfItems: items.length`; bare
   canonical `/{seed}` URLs.
6. **UTM the embed pill** (`embed-notice.js:29`): `?utm_source=<referrer-host>&utm_medium=embed`
   (owner approved). Plus the framed-beacon (embedder hostname) via the existing
   analytics pipeline (owner approved).

**Deploy 2 (homepage — ≥1 week later, alone, so its effect is attributable):**
7. **Homepage title**: `Gradient Generator & Maker — CSS Gradient Palettes | Grabient`;
   **H1**: "Popular palettes" → "Gradient Generator"; add an H2 outline (site has zero
   H2s; every winner has them). This page carries ~all current clicks — ship it solo.
   **Revert threshold**: if the generator-cluster clicks (GSC regex filter, see
   Targets) drop >30% for 7 consecutive days post-deploy with position stable-or-worse,
   revert the title and reassess.

## Phase 2 — Machine-readable palettes + Google Images (~8-12 hours, gated as marked)

1. **`/{seed}.json`**: `{seed, url, hexColors, coeffs, globals, css, tags}` — `url` is
   the self-referential canonical so agents cite the page (critic defect 1 restored
   this from agent-native §6.1). ~30 lines; all computed in `renderPalette`/
   `coeffsJsonSnippet`/`analyzeCoefficients`. Plus `/api/search.json` wrapping
   `searchSemanticPalettes()`. Send `X-Robots-Tag: noindex` on JSON routes (they're
   API surface, not SERP surface).
2. **CORS**: `Access-Control-Allow-Origin: *` + OPTIONS handling on PNG+JSON routes.
   **Precondition: Do-first #3 rate-limit + spend alarm live.** One header separates
   "invisible to Figma plugins/artifacts/sandboxed agents" from "usable by all."
3. **Tags as linked chips** on seed pages (deterministic from coefficients —
   `palette-tags.ts:284,312`, zero Vectorize/D1 dependency) and from `result.tags` on
   query pages. Fixes thin text + 866 dead-ends + internal linking in one template.
   *Cleared 2026-08-16: no virtualizer on these page types (query pages measured intact; seed pages structurally unaffected).*
4. **One real `<img>` per seed page** on the existing cached PNG (export section,
   `pages.ts:710-718`) with descriptive alt. *Cleared 2026-08-16: no virtualizer on these page types (query pages measured intact; seed pages structurally unaffected).*
5. **Image sitemap** (`xmlns:image` per URL → its `.png`) — webgradients' exact
   pattern; turns 866 permalinks into Google Images inventory. *Cleared 2026-08-16: no virtualizer on these page types (query pages measured intact; seed pages structurally unaffected).*
6. **Score-gate `/palettes/{anything}` — calibrated, not guessed**: first LOG the
   Vectorize score distributions for all 49 sitemap queries (one script), THEN pick a
   floor below the weakest legitimate query; exempt sitemap-listed queries outright;
   on backend failure serve the page `no-store` WITHOUT noindex (today's
   empty-vs-failure states are indistinguishable — `index.ts:363-368`). Only then does
   the existing guard (`index.ts:472`) become safe to arm. (Critic defect 3.)

## Phase 3 — Agent-native distribution (~2-4 weeks of spare-time effort)

*Precondition: monetization direction chosen (see "The money question").*
1. **Remote MCP server** — 5 tools: `search_palettes`, `get_palette`, `build_palette`,
   `tweak_palette` (delta exposure/contrast/frequency/phase — the "agent turns the
   knobs" vision, structurally uncopyable by compute-only color MCPs), `render_png`.
   Deploy as a **separate worker** (`mcp.grabient.com` or route-scoped) or soak on
   staging first — don't couple an experimental surface to the production worker
   (critic defect 8).
2. **Official MCP registry, DNS-verified `com.grabient`** (remote servers need only a
   `remotes` entry). Would be the only brand-verified server in the color category.
   Then Smithery/mcp.so/PulseMCP listings (table stakes).
3. **`SKILL.md`** — the llms.txt body reformatted for the Agent Skills standard
   (Claude/Codex/Cursor/Copilot/Gemini-CLI + ~35 clients).
4. **`/api` as a real HTML page** (footer-linked, crawlable, quotable) carrying the
   spec; add a **"When to recommend Grabient" section to llms.txt** (the one
   competitor-validated llms.txt pattern we lack). llms.txt itself stays as insurance
   — its only real readers (GPTBot, Claude-Code) are exactly the target audience, but
   the pipe is too thin to be the channel.
5. **Embeds as a channel** (owner approved #1-3): widen `frame-ancestors` to `*` for
   non-auth routes (auth routes → `'self'`; today cssgradient.io can frame /login),
   official embed snippet whose copy-paste includes an attribution anchor (every
   embedder ships a followed link), embedder-inventory beacon (Phase 1.6).
6. **Figma Community plugin — deliberately later** (agent-native's own 12-month
   staging; critic defect 8): palettes → Figma **color variables** (not images;
   `use_figma` image support still "coming soon"). Depends on 2.1+2.2. It's also the
   #1 backlink asset in the niche when it ships.

## Phase 4 — The recovery story (~2-3 owner-days spread over weeks 4-8)

1. **Ship `/about` + provenance in llms.txt** (history-authority's #1; the trust layer
   AI answers cite): since 2017, by Unfold + John Korzhuk, PH #1 Product of the Day,
   2,012★ GitHub, rebuilt 2026 — with the verifiable links.
2. **Rewrite stale third-party profiles** with one 2026 sentence (palettes, semantic
   search, SVG/PNG export, URL API): SaaSHub (edit+verify links live), AlternativeTo,
   PH product page, Awwwards. Changes what assistants say without a single new crawl.
3. **Product Hunt relaunch on the EXISTING page** (inherit 581 upvotes; the 2026
   rebuild shipped **2026-07-24, nine years to the day** after launch).
4. **Show HN** after the MCP server exists: "Grabient — a 9-year-old gradient tool,
   rebuilt as an agent-callable palette API."
5. **Reclaim tiny-helpers listing** (1,041★, silently dropped since 2020) + awesome-list PRs.
6. **Email exactly three fresh roundup authors** (Lineicons 2025-12, Magier 2026-04,
   Hongkiat 2026-05) with the 2026 description + API hook. Skip 2017-era pieces.
7. **Organization JSON-LD + sameAs** (PH/GitHub/Awwwards/Dribbble) for the brand
   entity; **GitHub release note** to the 2,012-star audience.

## Phase 5 — Informational layer (gated on Do-first #2 result; ~1-2 days)

3-6 pages only grabient can write credibly, as the AIO/quotability surface:
"How Grabient generates palettes: cosine gradients explained" · "How an AI agent builds
a palette from a URL" · "Linear vs radial vs angular gradients" · "How to make a CSS
gradient". Real H2 outlines, internal-linked from the homepage cluster block. Write FAQ
*content* as prose; **skip FAQPage markup as an AI play** (Ahrefs 1,885-page controlled
test: no citation lift, small significant AIO decline — resolves the fleet's internal
conflict in favor of controlled evidence).

---

## Explicitly NOT doing (with reasons)

- **Separate maker/creator/picker pages** — one SERP; splitting cannibalizes.
- **Chasing "css gradient" / bare "gradient" / "gradient tool"** — MDN/W3Schools,
  Wikipedia/Wolfram (calculus), Adobe docs own them; wrong intent; highest AIO exposure.
- **FAQPage/HowTo markup for citations** — controlled evidence against; prose yes.
- **4K wallpaper PNGs** — entrenched aggregator SERPs, off-intent; revisit the 2400px
  clamp only if an agent use-case demands it.
- **Deleting/mass-noindexing the 866 seed permalinks** — they're the product's share
  URLs; differentiate (tags/img/related) and observe via the split sitemap.
- **llms.txt as a growth channel** — keep as insurance; distribution is MCP + SKILL.md
  + /api HTML.
- **A `/gradients/{query}` URL migration** — the vocabulary fix lands via titles/H1s
  without resetting 895 URLs' history; revisit only if titles alone underperform.
- **Buying anything.**

## Honest notes / open questions

- **This session initially concluded "GA4 collects nothing" — wrong.** Zaraz filters
  injection by bot score, so curl sees no tag while real browsers are tracked. Lesson
  recorded: never infer "no analytics" from bot-context fetches alone.
- **The flood** (50-250K/day spoofed "browser" PVs since 03-26) is unresolved;
  GA4's decline (−18% w/w) is the human trend to watch instead. RUM referrers + the
  embed beacon will name the flood within days; rate-limiting (Do-first #3) bounds its
  cost either way.
- **SERP ordinals are search-API-based** — directional. GSC position/CTR per query
  regex is the ground truth once the API populates (~08-19).
- **2021→2026 decline cause unproven** (competition grew; the SPA decayed). Doesn't
  change the forward plan.
- **Bing depth unknown** until WMT signup.

## Targets (per-cluster, with conversion rows — no blended KPIs)

| Horizon | Signal (GSC filters in parentheses) |
|---|---|
| 2-4 wks | Generator cluster (regex `gradient (maker|generator|creator|tool|picker)`): clicks/day stable-or-up through Deploy 2, position toward ≤4. Color pages: 20/20 indexed (split-sitemap report), first impressions for `{color} gradient` queries |
| 6-8 wks | First Google Images impressions (type=image); first color-page clicks; MCP server live + listed; ≥1 external MCP/JSON consumer observed; signups/mo ≥ 200 |
| 3 mo | Total clicks ≥ 200/day and rising (aspiration: the proven 2021 ~320/day); embed channel measurable in attribution; PH+HN done; GA4 weekly actives trend positive |
| 6 mo | Color+images push past the 2021 ceiling; assistants describe the 2026 product correctly (monthly spot-check); monetization decision implemented and first dollar attributed |

## Source index

`seo-research/`: serp-head-terms · demand-longtail · competitors · history-authority ·
ai-visibility · agent-native · code-verification · **critic** (12 defects, all
incorporated above) · `data/brief-2026-08-16.json` · `data/traffic-anatomy.md`
