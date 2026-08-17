# Shaping crawler traffic on Cloudflare — grabient.com

Researched 2026-08-17. Zone: **Free** plan. Workers: **$5/mo Paid** (current spend $3.97).
Budget ceiling **$10/mo**. Goal: keep AI/LLM crawlers welcome, bound the damage, do not
block Meta.

Every claim below carries a doc URL. Where a claim rests on third-party reporting rather
than vendor docs, it is marked **[3P]**. Where I could not verify something, it says so.

---

## 0. Bottom line first

Five findings that change what you should do, before any recommendation:

1. **`facebookexternalhit` is a Cloudflare *verified bot* in the `PAGE_PREVIEW` category.**
   It is not an AI crawler in Cloudflare's taxonomy. **AI Crawl Control cannot touch it** —
   that product only manages Search / Agent / Training crawlers. Your existing WAF rule also
   cannot touch it, because that rule is gated on `not cf.client.bot` and `cf.client.bot` is
   *true* for it. Whatever is hammering `/api/og` from Meta space is, today, entirely
   unshaped by anything you have configured.

2. **The Free plan's single rate limiting rule counts by source IP only, over a fixed 10 s
   window, with a fixed 10 s mitigation.** ASN / header / cookie counting characteristics are
   Business-and-above or Enterprise. Meta announces ~300 IPv6 ranges under AS32934 and crawls
   from a wide pool inside `2a03:2880::/32`. **Per-IP rate limiting is close to useless
   against Meta specifically.** Do not build the plan around it.

3. **On the Free plan there is no non-destructive WAF action.** Free supports "all actions
   except Log" — Block, Managed Challenge, JS Challenge, Interactive Challenge, Skip. A
   Managed Challenge delivered to a non-browser crawler is a 403 it can never solve; it *is*
   a block, just a block that also burns your CPU rendering a challenge page. There is no
   "observe only" mode below Enterprise. So "shape without blocking" on this plan means
   **code changes in the Worker**, not WAF rules.

4. **Two dashboard toggles would actively sabotage the stated goal — do not enable them.**
   - *Managed robots.txt* prepends `Disallow: /` for ClaudeBot, GPTBot, Amazonbot et al.
     *above* your hand-written allow list.
   - *Training blocking* also blocks **mixed-purpose crawlers that do Search and Training**,
     per Cloudflare's own doc. That is precisely the class of crawler that produces AI
     citations. Turning it on trades away the thing the site is optimizing for.

5. **Your robots.txt welcomes `PerplexityBot` and `Perplexity-User`, which Cloudflare
   de-listed as verified bots in August 2025** for stealth crawling. They therefore evaluate
   `cf.client.bot == false` and *are* caught by your existing HTTP/1.1-Chrome challenge rule
   whenever they spoof a Chrome UA. Your robots.txt is making a promise the edge does not
   keep. Worth knowing; not necessarily worth changing.

**The money is not the problem.** 475k req/day ≈ 14.3M/month. On Workers Paid the request
meter is cheap and you are at $3.97. The meter that can actually hurt is **CPU time on
`resvg` rasterization** for long-tail seeds that miss both the edge cache and the KV cache.
Your existing KV cache (`OG_IMAGE_CACHE`, 7-day TTL, keyed on `OG_RENDER_VERSION`) is the
thing keeping this cheap. Verify current unit prices at
<https://developers.cloudflare.com/workers/platform/pricing/> before treating any number here
as authoritative — I did not verify Workers unit pricing in this pass.

---

## 1. Current stance (what the code already says)

**`robots.txt`** is generated, not static — `apps/web/src/seo.ts:37` (`robotsTxt()`), served
at `/robots.txt` from `apps/web/src/index.ts:1141` with `Cache-Control: public, max-age=86400`.

It is maximally open:

- `User-agent: *` / `Disallow:` — everything allowed.
- A second group explicitly naming `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`,
  `Claude-User`, `Claude-SearchBot`, `PerplexityBot`, `Perplexity-User`, `Google-Extended`,
  `Applebot-Extended`, `meta-externalagent`, `CCBot` — all `Disallow:` (allowed).
- No `Crawl-delay` anywhere.
- A comment already notes that "crawler access is also governed by Cloudflare AI Crawl
  Control; both must allow a bot for it to get through."
- Trailing comments **advertise `/api/og`, `/api/png`, `/{seed}.png` and the `w=`/`h=`
  parameters directly to crawlers.**

**`llms.txt`** (`apps/web/public/llms.txt`, 15 KB) goes further: it documents the whole
machine surface and includes an explicit anti-scraping nudge — *"Do not use it for … Bulk
scraping. Use `/api/palettes`; a palette page is ~120KB of HTML for ~8 hex codes."*

**Cost posture already in place** (this is good, and most of the "cheap responses" advice
below is already done):

- `/api/og`, `/api/og/query`, `/api/png`, `/{seed}.png` all return
  `Cache-Control: public, max-age=86400, s-maxage=604800` +
  `CDN-Cache-Control: max-age=604800` (`apps/web/src/seo.ts:430`).
- KV `OG_IMAGE_CACHE` in front of `resvg`, 7-day TTL, version-keyed
  (`apps/web/src/seo.ts:447`). Custom `w`/`h` deliberately not KV-cached (unbounded key
  space) — they still get the edge cache.
- 404s are edge-cached for an hour (`CDN-Cache-Control: max-age=3600`,
  `apps/web/src/index.ts:287`), which already blunts the AWS legacy-URL crawlers.

So the marginal cost of a repeat `/api/og` crawl is roughly *one Worker invocation + one KV
read*. The expensive case is a **first** hit on a seed nobody has rendered — a full `resvg`
rasterize. A crawler walking the seed space (which is combinatorially enormous — 12 numbers)
generates 100% resvg misses. A crawler walking your **sitemap** (1,000 palettes) warms the
cache once and then costs almost nothing. Which of those is happening is the single most
important unknown, and §3 tells you how to find out.

---

## 2. Cloudflare AI Crawl Control (2026)

Formerly "AI Audit". Docs: <https://developers.cloudflare.com/ai-crawl-control/>

### Availability

**"Available on all plans"** — including Free.
<https://developers.cloudflare.com/ai-crawl-control/>

Free-vs-paid split, from
<https://developers.cloudflare.com/ai-crawl-control/features/manage-ai-crawlers/> and
<https://developers.cloudflare.com/ai-crawl-control/get-started/>:

| Capability | Free | Paid |
|---|---|---|
| Crawler detection | **User-agent string matching only** — "well-known, self-identifying AI crawlers" | Bot Management detection ID (Enterprise + Bot Management) |
| Allow / Block per crawler | Yes | Yes |
| Custom block response (403 vs **402 Payment Required**, custom body) | **No** | Yes |
| Analytics window | **24 hours** | Extended |
| Referral analytics (traffic *from* ChatGPT/Perplexity) | **No** | Yes |
| robots.txt tracking + violations tab | Yes | Yes |
| Pay Per Crawl | **No** — private beta, Enterprise + Bot Management | Limited rollout |

### What it actually lets you do

Three actions per crawler: **Allow**, **Block**, **Charge** (private beta).
<https://developers.cloudflare.com/ai-crawl-control/features/manage-ai-crawlers/>

**There is no rate-limit or throttle action.** There is nothing between "allow everything"
and "block everything" for a given crawler. For a site whose goal is "welcome but bounded",
AI Crawl Control gives you visibility and an on/off switch, and that is all.

Blocking is implemented as a WAF rule: *"When you block a crawler in AI Crawl Control, the
system creates or updates a WAF custom rule on your zone to enforce that block."* The docs do
not state whether that rule consumes one of your **5 free custom rules**. You have headroom
(one rule in use), but check the Custom Rules list after any block so you do not get
surprised at rule 5.

### Granularity

Per crawler, from a fixed roster. The roster
(<https://developers.cloudflare.com/ai-crawl-control/reference/bots/>) includes GPTBot,
ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot,
Perplexity-User, Googlebot, Google-CloudVertexBot, BingBot, Bytespider, CCBot,
**Meta-ExternalAgent**, **Meta-ExternalFetcher**, **FacebookBot**, Applebot, Amazonbot,
DuckAssistBot, MistralAI-User.

**`facebookexternalhit` is absent.** It is `PAGE_PREVIEW`, not an AI category (§5). Confirm
in your own dashboard's Crawlers tab, which lists only crawlers that have actually hit the
zone — but the taxonomy strongly implies AI Crawl Control has no lever for it.

### Dashboard navigation

- **AI Crawl Control:** `https://dash.cloudflare.com/?to=/:account/:zone/ai` → tabs:
  **Crawlers** (allow/block, per-crawler request counts), **Analytics**, **Robots.txt**
  (compliance + violations), **Directives**.
  <https://developers.cloudflare.com/ai-crawl-control/get-started/>
- **Category toggles (Search / Agent / Training):**
  `https://dash.cloudflare.com/?to=/:account/:zone/security/settings` → **Configure AI bot
  policies**.
  <https://developers.cloudflare.com/bots/additional-configurations/block-ai-bots/>
- **Managed robots.txt:** Security Settings → filter **Bot traffic** → *"Set your preference
  to block training in robots.txt"*.
  <https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/>

### The 2026 category system and the September 15 deadline

The old single "block all AI bots" toggle (July 2025) is **retired**. Replaced by three
independent controls:
<https://blog.cloudflare.com/content-independence-day-ai-options/>

- **Search** — "any behavior that collects or indexes your content, so it can answer
  questions about it later."
- **Agent** — "automated behavior that is acting, usually in real time, on a person's behalf."
- **Training** — "a crawler taking your content to train or fine-tune a model."

From **2026-09-15** (four weeks out):

- **New domains onboarding to Cloudflare**: Training and Agent blocked by default **on pages
  that display ads**; Search stays allowed.
  <https://developers.cloudflare.com/bots/additional-configurations/block-ai-bots/>
- **Existing zones**: no automatic change. *"Existing zones: No automatic changes—customers
  retain current settings unless they opt in."*
  <https://blog.cloudflare.com/content-independence-day-ai-options/>

⚠️ **This site serves AdSense** (`apps/web/public/ads.txt` → `pub-2436216252635443`;
`apps/web/src/html.ts:101` → `<meta name="google-adsense-account">`). So it *is* an
"ad-monetized" zone by Cloudflare's automated detection. Since it is an existing zone the
defaults do not move on their own — **but the ad detection means that if anyone ever enables
Training blocking with the "block only on ad pages" scope, it applies to essentially the
whole site.**

⚠️ **The mixed-purpose rule is the trap.** Cloudflare: *"Mixed-purpose crawlers that combine
Search and Training will also be blocked by all configurations to block AI training."*
<https://developers.cloudflare.com/bots/additional-configurations/block-ai-bots/>
A site optimizing for AI citation must **leave Training blocking OFF**. Enabling it does not
"block training and keep search" — it blocks the union.

### Pay Per Crawl

<https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/>
Private/limited beta, gated behind Enterprise + Bot Management, evolving into "Pay Per Use"
(charge when content creates value, not per fetch)
<https://developers.cloudflare.com/changelog/2025-12-10-pay-per-crawl-enhancements/>.
**Not reachable on this plan at any price inside a $10/mo budget.** Ignore it.

---

## 3. Identifying Meta's crawlers

### `2a03:2880::/32`

Registered to **Facebook Ireland Ltd**, netname `IE-FACEBOOK-201100822`, abuse
`domain@fb.com`. AS32934 (Facebook, Inc.) announces ~300 IPv6 ranges including this /32.
**[3P]** — <https://bgp.he.net/AS32934>, <https://ipinfo.io/AS32934>

**Crucially: this /32 is not a "crawler range".** It carries every Meta product's egress.
Grouping by source IP tells you "Meta" and nothing more. **The user-agent is the only signal
that separates a link preview from a training crawl**, and each Meta agent has a distinct,
documented UA.

### The Meta agent roster

From Meta's own docs
(<https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers>) cross-
referenced with Cloudflare's verified-bot directory (`radar.cloudflare.com/bots/directory`,
mirrored as machine-readable JSON at
<https://github.com/microlinkhq/cloudflare-bot-directory>):

| UA token | What it is FOR | Meta on robots.txt | CF category | CF verified? |
|---|---|---|---|---|
| `facebookexternalhit/1.1` | **Link preview.** Crawls content shared on FB / IG / Messenger via paste or social plugin; "gathers, caches, and displays … title, description, and thumbnail image." | *"might bypass robots.txt when performing security or integrity checks, such as checking for malware or malicious content"* | `PAGE_PREVIEW` | **Yes** |
| `meta-externalagent/1.1` | **AI training / direct indexing.** "training foundation AI models or improving products by indexing content directly." | Meta documents robots.txt config for it; CF directory marks `followsRobotsTxt: true` | `AI_CRAWLER` | **Yes** |
| `meta-externalfetcher/1.1` | **User-initiated fetch.** "Fetches individual links at a user's request … evaluating and improving agentic AI capabilities." | *"May bypass robots.txt rules"* — user-requested | `AI_ASSISTANT` | **Yes** |
| `meta-externalads/1.1` | **Ads.** "improving advertising and other business-related products and services." Note: also ships a **Safari-flavoured** UA string. | `followsRobotsTxt: true` in CF directory | `ADVERTISING_AND_MARKETING` | **Yes** |
| `meta-webindexer/1.1` | **Meta AI search quality.** "navigates the web to improve Meta AI search result quality." | not stated | `PAGE_PREVIEW` | **Yes** |
| `meta-externaltest/1.1` | Integration testing. Ships **Web Bot Auth** (`https://www.meta.com/.well-known/http-message-signatures-directory`). | not stated | `AI_ASSISTANT` | **Yes** |
| `facebookcatalog/1.0` | Commerce catalog fetch; folded into the `facebookexternalhit` verified entry. | — | `PAGE_PREVIEW` | **Yes** |
| `FacebookBot` | Listed in Cloudflare's **AI Crawl Control** roster as Meta / AI Crawler. **Absent from the verified-bot directory**, and Meta's current crawler page no longer documents it. Probably legacy. | — | `AI_CRAWLER` (per AI Crawl Control) | **No entry found** |

**Two caveats on this table.**

1. The `followsRobotsTxt` field in Cloudflare's directory is **not trustworthy as a
   compliance claim**. The same dataset reports `followsRobotsTxt: false` for Googlebot and
   ClaudeBot, which is plainly wrong. Treat it as "not asserted", not "does not comply". The
   robots.txt column above leans on Meta's own wording where available.
2. **Meta's documentation does not mention `Crawl-delay` for any agent.** Treat it as
   unsupported across the board (see §4.1).

### Verified-bot consequence

All the current Meta agents evaluate **`cf.client.bot == true`**. That means:

- Your rule `(http.request.version eq "HTTP/1.1" and http.user_agent contains "Chrome/" and
  not cf.client.bot)` **never fires on Meta traffic** — both because of the verified-bot
  guard and because none of these UA strings contain `Chrome/`.
- Any rule you write as `not cf.client.bot` will likewise skip all of them.
- The free rate-limit rule's `Verified Bot` field matches **all** verified bots as one blob —
  it cannot single out Meta.

---

## 4. Is `facebookexternalhit` on `/api/og` real sharing or a crawl?

### What the docs say the normal behaviour is

`facebookexternalhit` fires **on demand**, when a link is pasted into Facebook / Instagram /
Messenger / WhatsApp / Threads, and it **caches** the result. **[3P]** the commonly cited
cache window is ≥24 h and often ~30 days, and the only reliable way to force a re-scrape is
the Sharing Debugger's "Scrape Again"
(<https://developers.facebook.com/tools/debug/>). Meta's own page confirms the on-demand
purpose and the caching but does not publish a TTL:
<https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers>

So the *expected* shape for a real share is: **one HTML fetch of the palette page, then one
fetch of the `og:image` URL it found there, then silence for days.**

### The volume argument

Grabient's human baseline is ~4–6k pageviews/day. Even if *every single human* shared *every
page they saw* to Facebook, that is ≤6k share fetches/day. Observed automated volume is
~464k desktop requests/day. **Sharing cannot explain more than about 1% of this.** Whatever
the UA breakdown turns out to be, the traffic is overwhelmingly systematic.

That said — `facebookexternalhit` sending a genuinely large *burst* is a documented
real-world pathology independent of share volume. **[3P]** operators report spikes of
~400 rps from 20–30 IPs inside Facebook netblocks recurring every 45–60 minutes
(<https://www.techbusinessnews.com.au/news/webmasters-raise-concerns-over-facebooks-aggressive-crawling-and-scraping-practices/>,
<https://hackernoon.com/facebook-bots-crawlers-and-user-agents-causing-resource-drains-on-websites-and-hosting-accounts>).
So "it's `facebookexternalhit`" does not by itself mean "people are sharing you."

### The five server-side signals that settle it

Run these against your own logs. In rough order of decisiveness:

1. **UA histogram, not IP histogram.** `facebookexternalhit` vs `meta-externalagent` vs
   `meta-webindexer` is the whole question, and the UAs are distinct fixed strings. If it is
   mostly `meta-externalagent`, this is a training crawl and robots.txt / AI Crawl Control
   both apply. If it is mostly `facebookexternalhit`, neither applies and you are in §5's
   narrow-lever territory.
2. **HTML-before-image ordering.** A real preview fetch must fetch the palette page first
   (to parse `og:image`) and only then hit `/api/og?seed=…&v=16`. **`/api/og` hits with no
   preceding same-seed HTML fetch from the same UA are not previews** — they are a direct
   walk of the image endpoint, which your `robots.txt` comments and `llms.txt` both advertise
   in plain text.
3. **URL provenance.** Do the seeds fetched correspond to `/sitemap-palettes.xml` (1,000
   entries), or do they range over the wider seed space? Sitemap-shaped = a crawl following
   your own map (cheap once warm, and arguably working as intended). Seed-space-shaped =
   enumeration, 100% resvg misses, and the expensive case.
4. **Repeat rate.** Meta caches OG data per URL. High repeat-fetch counts for the *same*
   seed within a day contradict the on-demand model and indicate a crawl (or a cache-key
   mismatch on your side — check that `v=16` is stable in the emitted `og:image` URL, which
   it is, via `OG_RENDER_VERSION`).
5. **Diurnal shape.** Human sharing tracks a daily curve. A crawl is flat or sawtooth. You
   already have this in the admin traffic dashboard.

### How to actually get the UA histogram on this plan

Free-plan zone analytics will not give you a clean UA × path breakdown, and the GraphQL
adaptive-groups datasets that would are largely Enterprise. Your practical options:

- **AI Crawl Control → Crawlers tab** gives per-crawler request counts for the *AI* roster
  free, with a **24-hour** window. This immediately answers "how much is
  `meta-externalagent`?" It will *not* show `facebookexternalhit`.
- **Security → Events**, filtered by user agent, per Cloudflare's own crawl-error
  troubleshooting guidance
  (<https://developers.cloudflare.com/support/troubleshooting/general-troubleshooting/troubleshooting-crawl-errors/>).
  Only shows requests that matched a security rule, so it will not show unshaped Meta
  traffic.
- **Instrument the Worker.** You are on Workers Paid and already have an admin dashboard.
  A ~15-line counter bucketing `(uaToken, pathFamily)` into Workers Analytics Engine or an
  existing sink is the only thing that definitively answers signals 1–4. This is the single
  highest-value action in this document, because **every recommendation below branches on
  its result.** Verify Analytics Engine's inclusion/pricing on Workers Paid before wiring it
  up — I did not confirm that in this pass.

---

## 5. Free-plan levers, ranked

### 5.1 `robots.txt` `Crawl-delay` — near-worthless, but free

**Google explicitly does not support it.** From Google's own spec: *"Google supports the
following fields (other fields such as `crawl-delay` aren't supported)."*
<https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec>

**Meta's crawler documentation never mentions `Crawl-delay`** for any agent
(<https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers>). Assume
unsupported.

**[3P]** Bing, Yandex and DuckDuckGo are widely reported to honour it, with Bingbot
interpreting it as a window ("`Crawl-delay: 10`" ⇒ at most one page per 10 s). I did not find
a first-party Microsoft doc confirming the current behaviour.

**Verdict:** costs nothing, might trim Bing, will do nothing about Meta or the AI crawlers.
**Low priority. Do not plan around it.**

Rating: ★☆☆☆☆ against the actual problem.

### 5.2 The one free rate limiting rule — structurally wrong shape for this problem

<https://developers.cloudflare.com/waf/rate-limiting-rules/>

Free plan, verbatim from the availability table:

| | Free |
|---|---|
| Number of rules | **1** |
| Counting characteristics | **IP** |
| Counting period | **10 s** |
| Mitigation timeout | **10 s** |
| Available fields in rule expression | **Path, Verified Bot** |
| Counting model | Number of requests |
| Action behaviour | Perform action during mitigation period |

Three fatal problems for this use case:

- **IP-only counting vs a /32 with ~300 announced ranges.** Meta spreads across the pool;
  per-IP counting barely registers. ASN counting is **Enterprise**.
- **`Verified Bot` is all-or-nothing.** You cannot say "rate-limit Meta but not Googlebot" —
  the field is one boolean covering the entire verified list.
- **Cached responses count.** *"Depending on your Cloudflare plan, this rule parameter might
  not be available. In that case, Cloudflare will also apply rate limiting to cached
  assets."* Free cannot exclude them. Since `/api/og` is edge-cacheable, the limiter throttles
  requests that cost you almost nothing — the opposite of the desired shaping.
  <https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/>

There *is* one narrow, defensible use: a **very generous** panic brake on the expensive
uncached surface. Something like `http.request.uri.path contains "/api/png"` at a threshold
high enough that no legitimate client ever reaches it (say 50 req / 10 s / IP), action
Managed Challenge. That is a circuit breaker for a single runaway IP, not traffic shaping.

Note also: free plans cannot pick a custom mitigation duration with challenge actions —
*"their rate limiting rule will always perform request throttling for these actions."*
<https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/>

Rating: ★★☆☆☆ — keep the slot free, or spend it on a panic brake.

### 5.3 WAF custom rules with `cf.client.bot` / `cf.verified_bot_category` — good for
**protection**, bad for **throttling**

<https://developers.cloudflare.com/waf/custom-rules/> — availability table verbatim:

| | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Availability | Yes | Yes | Yes | Yes |
| Number of rules | **5** | 20 | 100 | 1,000 |
| Supported actions | **All except Log** | All except Log | All except Log | All |
| **Regex support** | **No** | No | Yes | Yes |
| Custom rulesets (zone) | 1 | 2 | 5 | 10 |

You have **1 of 5** in use. Note **no regex on Free** — but `contains`, `starts_with`,
`ends_with` and `in {…}` are functions, not regex, and all work.

`cf.client.bot` and `cf.verified_bot_category` carry **no plan restriction** in the fields
reference
(<https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/>), and
Cloudflare's own Free/Pro/Business use-case guide recommends exactly
`(cf.client.bot)` + Skip for allowlisting good crawlers
(<https://developers.cloudflare.com/use-cases/solutions/stop-malicious-bots/>). Contrast
`cf.bot_management.verified_bot`, which the docs state **requires Enterprise with Bot
Management**
(<https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/cf.bot_management.verified_bot/>) —
`cf.client.bot` "provides the same information" and is the field to use here.

**Legacy `cf.verified_bot_category` values**
(<https://developers.cloudflare.com/bots/concepts/bot/verified-bots/>): `Search Engine
Crawler`, `AI Crawler`, `AI Search`, `AI Assistant`, `Monitoring & Analytics`, **`Page
Preview`**, `Search Engine Optimization`, `Security`, `Academic Research`, `Accessibility`,
`Advertising & Marketing`, `Aggregator`, `Archiver`, `Feed Fetcher`, `Social Media
Marketing`, `Webhooks`, `Other`.

`facebookexternalhit` is `Page Preview` — so `cf.verified_bot_category eq "Page Preview"`
*would* isolate the social-preview family (Facebook, Twitterbot, LinkedInBot, Discordbot,
Telegram, Slack Image Proxy, Bing Preview). But **the only actions available are destructive**
(§0.3), so this is a lever you can aim precisely and then only fire as a block. Useful as a
last resort; not useful for shaping.

**The one rule genuinely worth adding now** is defensive, not restrictive:

> **Rule: "Never challenge verified crawlers"**
> Expression: `(cf.client.bot)`
> Action: **Skip** → All remaining custom rules
> Position: **first**, above the HTTP/1.1-Chrome rule.

Your current rule already carries `not cf.client.bot` inline, so this is belt-and-braces —
but it makes the invariant explicit and survives the next person adding rule #3 without the
guard. Note the documented limit: **Skip cannot bypass Bot Fight Mode** — *"you cannot skip
Bot Fight Mode (available on the Free plan)"*
<https://developers.cloudflare.com/waf/custom-rules/skip/>. Which brings us to:

Rating: ★★★☆☆ (as a guard rail; ★☆☆☆☆ as a throttle).

### 5.4 Bot Fight Mode — **do not enable.** It would break this specific site.

<https://developers.cloudflare.com/bots/get-started/bot-fight-mode/>

What it does: identifies requests matching known bot patterns and issues *"computationally
expensive challenges that force the requesting client to perform CPU-intensive
calculations."* Free on all plans.

Documented problems, all of which land squarely on grabient:

- **Cannot be excepted.** *"Bot Fight Mode does not run on the Ruleset Engine — it operates
  in a separate evaluation pipeline where Skip, Bypass, and Allow actions have no effect."*
  You cannot allowlist anything. The only controls are on/off, or upgrade to Super Bot Fight
  Mode (**Pro or above**).
- **It challenges API and non-browser traffic.** *"may challenge API or mobile app
  traffic."* Grabient's entire product thesis is a no-auth, agent-drivable API surface
  (`llms.txt` documents `/api/search.json`, `/api/palettes`, `/{seed}.json`, `/{seed}.png`
  for exactly this). Every Figma plugin, agent sandbox, and `curl` following `llms.txt` is a
  non-browser client. BFM would break the traffic you are courting.
- **It force-enables JavaScript Detections**, which *"cannot be disabled"* for BFM customers
  and *requires specific Content-Security-Policy configuration*. You already emit a CSP
  header (`apps/web/src/index.ts:155`) — currently `frame-ancestors` only, so probably
  survivable today, but it is a live tripwire for any future `script-src`.
  <https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/>

**[3P]** verified bots are reported to be excluded by default, which would spare Googlebot —
but that does not rescue the API-client problem, which is the disqualifying one. I could not
confirm the frequently-repeated claim that BFM causes Workers requests to be billed; treat
that as unverified either way.

Rating: ★☆☆☆☆ / actively harmful here. **Leave off.**

### 5.5 Serving cheap responses — **the actual answer on a free zone** ★★★★★

This is where the plan should live, because it is the only approach that (a) does not block
Meta, (b) has no plan gate, (c) has arbitrary granularity, and (d) you already own the code
path.

Most of the groundwork is done (§1). What is left:

**a. Stop advertising the expensive endpoints to crawlers.**
`robots.txt` currently ends with a comment block naming `/api/og`, `/api/png`,
`/{seed}.png`, and the `w=`/`h=` params. That is a menu handed to every crawler that reads
it, including ones with no use for images. `llms.txt` is the right place for that
documentation — it is aimed at agents that will use it well. Consider trimming the
`robots.txt` tail to the sitemap + the `llms.txt` pointer.

**b. Fence the render endpoints against the *training* crawlers specifically.**
A model-training crawler has no business rasterizing PNGs — the palette data is in
`/{seed}.json` and `/api/palettes` at a fraction of the cost, and `llms.txt` already says so.
`meta-externalagent` is the one Meta agent Meta documents as robots.txt-configurable. So:

```
User-agent: meta-externalagent
User-agent: CCBot
User-agent: Bytespider
Disallow: /api/og
Disallow: /api/png
```

⚠️ **Implementation detail that will bite you:** `meta-externalagent` and `CCBot` are
currently inside the blanket-allow group in `robotsTxt()`. Per Google's spec, groups naming
the same user-agent are **merged**, so leaving them in both places is ambiguous at best.
They must be **moved out** of the allow group into this new one. This is a code change in
`apps/web/src/seo.ts:37`, plus the assertions in `apps/web/test/seo.test.js`.

This will not affect `facebookexternalhit` (does not honour robots.txt) or Googlebot (leave
it fully allowed — see §7).

**c. Add `Crawl-delay` in the same group.** Free, harmless, might catch Bing. Do not expect
anything from it.

**d. Return `410 Gone` for the dead legacy URL formats** the AWS IPs are crawling.
This is the correct, non-punitive way to make a crawler stop. Right now they get a full
rendered 404 HTML page (`renderNotFound`, `apps/web/src/index.ts:269`) — already edge-cached
for an hour, so it is not expensive, but 404 invites retries indefinitely while 410 signals
permanence and drops out of indexes faster.

⚠️ **Do not generalize this into rate limiting.** Google is explicit that 4xx (except 429)
for load-shedding *removes content from Search*: *"all 4xx HTTP status codes (except 429)
will cause your content to be removed from Google Search."* **[3P]** summarizing
<https://developers.google.com/search/blog/2023/02/dont-404-my-yum>. A 410 for a genuinely
dead legacy path is correct; a 4xx for a live palette page because a crawler is being noisy
is not.

**e. If you ever need to slow Googlebot specifically**, the *only* sanctioned mechanism since
the Search Console crawl-rate limiter was retired on 2024-01-08 is to return **500, 503, or
429** — and only briefly. Google: *"Returning 503 or 429 for more than 2 days will cause
Google to drop those URLs from the index."*
<https://developers.google.com/search/blog/2023/11/sc-crawl-limiter-byebye>

**f. Cache Rules** (Free, **10 rules**,
<https://developers.cloudflare.com/cache/how-to/cache-rules/>) are available and free if you
want belt-and-braces edge TTL on `/api/og*`. The Worker already emits
`CDN-Cache-Control: max-age=604800` on those responses, so the marginal benefit is unclear
for a Worker-served route; I did not verify the interaction between Cache Rules and Worker
route responses on this zone. Test before assuming.

**g. Snippets are NOT available on Free.** Pro 25 / Business 50 / Enterprise 300.
<https://developers.cloudflare.com/rules/snippets/> — irrelevant here since you have a
Worker anyway, but noting it so nobody proposes it.

---

## 6. The verified-bot allowlist (2026)

**What "verified" means:** *"bots or agents that Cloudflare has confirmed is transparent
about who it is and what it does"* — requiring honest self-identification (via **Web Bot
Auth** cryptographic signature, a published IP list with stable UA, or reverse DNS) **and**
non-abusive behaviour respecting robots.txt.
<https://developers.cloudflare.com/bots/concepts/bot/verified-bots/>

Canonical live list: <https://radar.cloudflare.com/bots/directory> (693 entries as of this
research; machine-readable mirror at
<https://github.com/microlinkhq/cloudflare-bot-directory>). Cloudflare also ships **BotBase**
in-dashboard <https://developers.cloudflare.com/bots/botbase/>.

Category distribution across the 693 entries: Monitoring & Analytics 164, SEO 70, Search
Engine Crawler 61, Webhooks 55, Security 51, Advertising & Marketing 44, **Page Preview 42**,
AI Assistant 41, Feed Fetcher 40, Aggregator 37, **AI Crawler 36**, AI Search 12, Other 11,
Accessibility 10, Academic Research 8, Archiver 7, Social Media Marketing 4.

The entries that matter for this site:

| Crawler | Operator | CF category (`cf.verified_bot_category`) | Verified? | Web Bot Auth |
|---|---|---|---|---|
| Googlebot (+ Images / Video / Scholar) | Google | Search Engine Crawler | ✅ | — |
| Google-InspectionTool | Google | **Security** | ✅ | — |
| Google-CloudVertexBot | Google | AI Crawler | ✅ | — |
| BingBot | Microsoft | Search Engine Crawler | ✅ | — |
| Bing Preview | Microsoft | Page Preview | ✅ | — |
| GPTBot | OpenAI | AI Crawler | ✅ | — |
| OAI-SearchBot | OpenAI | Search Engine Crawler | ✅ | — |
| ChatGPT-User | OpenAI | AI Assistant | ✅ | — |
| ChatGPT agent | OpenAI | AI Assistant | ✅ | — |
| OAI-AdsBot | OpenAI | Advertising & Marketing | ✅ | — |
| ClaudeBot | Anthropic | AI Crawler | ✅ | — |
| Claude-SearchBot | Anthropic | AI Search | ✅ | — |
| Claude-User | Anthropic | AI Assistant | ✅ | — |
| Applebot | Apple | AI Search | ✅ | — |
| Amazonbot | Amazon | AI Crawler | ✅ | — |
| Amzn-SearchBot | Amazon | AI Search | ✅ | — |
| DuckAssistBot | DuckDuckGo | AI Assistant | ✅ | **Yes** |
| MistralAI-User | Mistral AI | AI Assistant | ✅ | — |
| YandexBot | Yandex | Search Engine Crawler | ✅ | — |
| PetalBot | Huawei | AI Crawler | ✅ | — |
| YouBot | You.com | Search Engine Crawler | ✅ | **Yes** |
| Internet Archive | Internet Archive | Archiver | ✅ | — |
| FacebookExternalHit | Meta | **Page Preview** | ✅ | — |
| Meta-ExternalAgent | Meta | AI Crawler | ✅ | — |
| Meta-ExternalFetcher | Meta | AI Assistant | ✅ | — |
| Meta-ExternalAds | Meta | Advertising & Marketing | ✅ | — |
| Meta-WebIndexer | Meta | Page Preview | ✅ | — |
| Twitterbot / LinkedInBot / Discordbot / Telegram / Slack | various | Page Preview / Webhooks | ✅ | — |
| AhrefsBot, SemrushBot (7 variants) | Ahrefs / Semrush | SEO (2 Semrush variants are AI Crawler) | ✅ | — |
| **PerplexityBot / Perplexity-User** | Perplexity | — | ❌ **DE-LISTED** | — |
| **CCBot** | Common Crawl | — | ❌ **not present** | — |
| **Bytespider** | ByteDance | — | ❌ **not present** (only "Toutiao" is) | — |
| **FacebookBot** | Meta | AI Crawler (per AI Crawl Control roster) | ❌ **not in directory** | — |

**Perplexity was removed in August 2025.** Cloudflare de-listed it and began actively
blocking it network-wide, alleging it rotated UAs (posing as *"Chrome 124 on a Mac"*), IPs
and ASNs to evade `robots.txt` and WAF rules. **[3P]**
<https://www.searchenginejournal.com/cloudflare-delists-and-blocks-perplexity-from-crawling-websites/552899/>

Direct consequence for grabient: your `robots.txt` welcome list names `PerplexityBot` and
`Perplexity-User`, but they resolve `cf.client.bot == false` and their spoofed-Chrome
requests over HTTP/1.1 are caught by your existing rule. **Your robots.txt is writing a
cheque the edge declines.** Either accept the mismatch (harmless, arguably correct given the
behaviour) or drop them from the list so the file describes reality. Note that Perplexity
still appears in the **AI Crawl Control** roster
(<https://developers.cloudflare.com/ai-crawl-control/reference/bots/>) — that roster is about
what the product can *name*, not about verification status.

**Web Bot Auth** is the direction of travel: signing keypairs published at
`/.well-known/http-message-signatures-directory`, verified at the edge. Cloudflare states it
is *"currently available for all Free and Pro plans"*, rolling out to Business/Enterprise.
<https://blog.cloudflare.com/verified-bots-with-cryptography/>,
<https://blog.cloudflare.com/web-bot-auth/>, <https://blog.cloudflare.com/signed-agents/>
Nothing to configure — you inherit the improved verification for free.

---

## 7. Crawler Hints / IndexNow

<https://developers.cloudflare.com/cache/how-to/enable-crawler-hints/>

- **Free on all plans** (Free, Pro, Business, Enterprise). No cost.
- **Enable:** zone → **Caching** → **Configuration** → toggle **Crawler Hints** on.
- **What it does:** Cloudflare watches cache-status MISS events and proactively pings
  IndexNow when content changes — *"Cloudflare can proactively tell a crawler about the best
  time to index or when content changes."*
- **Consumers:** the IndexNow ecosystem — Bing, Yandex, Seznam, Naver. **Google does not
  consume IndexNow.** Announcement:
  <https://blog.cloudflare.com/cloudflare-now-supports-indexnow/>

**Documented caveats:**

1. Responses with status **4xx and above are excluded** from reporting.
2. **It operates globally over the zone** — you cannot scope it. *"to prevent indexing
   specific pages, use `X-Robots-Tag: noindex` headers or `<meta>` tags instead."*

⚠️ **The scoping caveat matters here.** This site emits `noindex,nofollow` on several routes
(`apps/web/src/pages.ts:684, 844, 1154`) and `X-Robots-Tag: noindex, nofollow` on
`*.workers.dev` hosts (`apps/web/src/index.ts:163`). Crawler Hints will happily ping
IndexNow about URLs it sees change regardless; the `noindex` directives are what stop them
being indexed. That is the documented, supported arrangement — but it means turning this on
increases the *pings*, and **[3P]** at least one operator complains it *"is sending Bing
anything it can find on our servers"*. Given the site is already fighting excess crawler
volume, this is a mild "more crawl invitations" tradeoff.

**Net:** upside is modest (Bing/Yandex freshness only, not Google), downside is a slightly
noisier crawl invitation surface. Free either way. **Optional; not a priority.**

---

## 8. Do WAF challenges harm SEO?

### The mechanism

A Managed Challenge is a JS-based interstitial served with a 4xx status. Cloudflare's docs
are explicit that non-browser clients cannot pass: *"Command-line tools such as wget, curl,
or others that lack JavaScript execution capabilities are not supported by Cloudflare
Challenges"*, and headless browsers are *specifically designed to be identified and blocked*.
<https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/>,
<https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/challenge-solve-issues/>

**Googlebot is a non-browser client.** It will never solve a challenge. A challenged
Googlebot request is, functionally, a permanent 403.

### The consequence

Google: *"all 4xx HTTP status codes (except 429) will cause your content to be removed from
Google Search."* **[3P]** summarizing
<https://developers.google.com/search/blog/2023/02/dont-404-my-yum>. So sustained challenges
to Googlebot are not a soft penalty — they are **deindexing**.

### How it surfaces in Search Console

- **Page indexing** report → *"Blocked due to access forbidden (403)"* — the canonical
  symptom.
- **URL Inspection** → *Page fetch: **Failed*** on a live test.
- **Settings → Crawl stats → By response** → a rising 403 slice.
- On the Cloudflare side, Cloudflare's own crawl-error guide says to go to **Security →
  Events** and filter by user agent containing *"Google"*.
  <https://developers.cloudflare.com/support/troubleshooting/general-troubleshooting/troubleshooting-crawl-errors/>

### Your current exposure: **low**

Your rule carries `not cf.client.bot`, and both **Googlebot** and **Google-InspectionTool**
are verified bots (§6), so neither can match. Google-InspectionTool matters specifically —
it is what powers URL Inspection's live test, so if it were challenged you would see
"Page fetch: Failed" for pages that are actually fine, which is a maddening false alarm.

Two real risks remain:

1. **Rule drift.** Someone adds custom rule #3 without the `not cf.client.bot` guard. The
   `(cf.client.bot)` → Skip rule in §5.3 is the cheap structural fix.
2. **Bot Fight Mode.** It runs outside the Ruleset Engine and **cannot be skipped**
   (<https://developers.cloudflare.com/waf/custom-rules/skip/>). This is the single most
   common way a Cloudflare zone accidentally deindexes itself. Keep it off.

### One human-facing note

24h security actions show **Managed Challenge 15.36k / Bypassed 693** — a ~4.5% pass rate,
which is good evidence the HTTP/1.1-Chrome heuristic is hitting genuine automation. But 693
passes/day against a 4–6k human baseline means **up to ~15% of human sessions are traversing
the challenge path.** Managed Challenges are usually invisible (no click required), and real
Chrome negotiates HTTP/2 or HTTP/3 to Cloudflare so should never match — the 693 are most
likely embedded webviews, corporate middleboxes that downgrade to HTTP/1.1, and old clients.
Worth a periodic sanity check that it is not creeping upward, not worth acting on now.

---

## 9. Crawler-by-crawler posture

Every crawler plausibly present in this traffic, what it wants, and what to do about it.

| Crawler | What it wants | Verified? | Managed by AI Crawl Control? | Honours robots.txt? | **Recommended posture** |
|---|---|---|---|---|---|
| **`facebookexternalhit`** | OG card for links shared on FB/IG/Messenger/WhatsApp/Threads | ✅ Page Preview | ❌ **no** | ❌ (may bypass for integrity checks) | **Allow.** No lever exists short of a destructive WAF rule. Make it cheap instead: keep `/api/og` KV+edge cached. Diagnose volume via §4 before touching anything. |
| **`meta-externalagent`** | Foundation-model training + direct indexing | ✅ AI Crawler | ✅ yes | ✅ (Meta documents it) | **Allow pages, disallow renders.** Move out of the blanket-allow group; give it its own group with `Disallow: /api/og` + `/api/png`. It has `/{seed}.json` and `/api/palettes` for the data. |
| **`meta-webindexer`** | Meta AI *search* result quality | ✅ Page Preview | ❌ no | not stated | **Allow, unconditionally.** This is Meta AI citing you. Exactly the traffic you want. |
| **`meta-externalfetcher`** | User-initiated single-link fetch for agentic features | ✅ AI Assistant | ✅ yes | ❌ (user-requested) | **Allow.** Per-request, user-driven, low volume. |
| **`meta-externalads`** | Ad/business product improvement | ✅ Advertising | ❌ no | ✅ per CF directory | **Allow.** You run AdSense; ad crawlers are not the enemy. Watch volume only. |
| **`FacebookBot`** | Legacy Meta AI crawler; no current Meta doc, no directory entry | ❌ | ✅ listed in roster | unknown | **Watch.** If it shows real volume, it is the one Meta agent worth blocking in AI Crawl Control. |
| **Googlebot** (+ Image/Video) | Search index | ✅ Search Engine | ✅ listed | ✅ | **Allow, protect aggressively.** Never challenge. Never `Crawl-delay` (ignored anyway). |
| **Google-InspectionTool** | Powers Search Console URL Inspection live tests | ✅ Security | ❌ no | ✅ | **Allow.** Challenging it produces phantom "Page fetch: Failed" in GSC. |
| **Google-Extended** | Gemini training opt-out token (not a fetching UA) | n/a | n/a | ✅ | **Keep allowed** in robots.txt as today. |
| **GPTBot** | OpenAI model training | ✅ AI Crawler | ✅ | ✅ | **Allow.** Wanted. |
| **OAI-SearchBot / ChatGPT-User / ChatGPT agent** | ChatGPT search + live user fetches | ✅ | ✅ | mixed | **Allow.** This is the citation path. |
| **ClaudeBot / Claude-SearchBot / Claude-User** | Anthropic training / search / user fetch | ✅ | ✅ | ✅ | **Allow.** Wanted. |
| **Applebot / Applebot-Extended** | Apple search + Apple Intelligence | ✅ AI Search | ✅ | ✅ | **Allow.** |
| **Amazonbot / Amzn-SearchBot** | Alexa + Amazon AI | ✅ | ✅ | ✅ | **Allow.** |
| **DuckAssistBot** | DuckDuckGo AI assist (**Web Bot Auth signed**) | ✅ | ✅ | — | **Allow.** |
| **MistralAI-User / YouBot / PetalBot** | AI assistant / search | ✅ | partly | — | **Allow.** |
| **BingBot / Bing Preview** | Search index + preview | ✅ | ✅ | ✅ | **Allow.** The one crawler where `Crawl-delay` may actually do something **[3P]**. |
| **PerplexityBot / Perplexity-User** | AI search | ❌ **de-listed Aug 2025** | ✅ named | disputed — CF alleges evasion | **Decide deliberately.** Your robots.txt welcomes them; Cloudflare's edge does not. Either drop them from the file or accept the mismatch. Do not add a rule for them — Cloudflare already handles it. |
| **CCBot (Common Crawl)** | Bulk corpus for everyone's training | ❌ not in directory | ✅ named | ✅ | **Allow pages, disallow renders** — same group as `meta-externalagent`. Bulk-crawling PNGs is pure waste. |
| **Bytespider (ByteDance)** | Training | ❌ not in directory | ✅ named | ✅ nominally | **Disallow renders**, or block in AI Crawl Control if volume warrants. Lowest citation value of the AI crawlers. |
| **AhrefsBot / SemrushBot ×7** | SEO backlink graphs | ✅ SEO | ❌ | ✗ nominally | **Allow, low priority.** They are polite and low-volume. Prime candidates if you ever need to trim. |
| **AWS-hosted legacy-URL crawlers** (54.80.176.130, 98.87.218.210, 98.91.147.104) | Old grabient URL formats from a prior site version | ❌ | ❌ | unknown | **Return `410 Gone`.** Correct, non-punitive, and it makes them stop. Already edge-cached; the 410 just ends the retry loop faster. |
| **UA-spoofing residual (~90% of "pageviews")** | Unknown — scrapers, resellers, click farms | ❌ | ❌ | ✗ | **Current rule is doing its job.** 15.36k challenged / 4.5% passing is a healthy ratio. Leave it. |
| **Twitterbot / LinkedInBot / Discordbot / Telegram / Slack** | OG cards | ✅ Page Preview | ❌ | ✗ | **Allow.** Note `apps/web/src/seo.ts:80` already handles Telegram's `&amp;`-mangling. |

---

## 10. Prioritized actions

### A. Dashboard clicks — all **$0**, all on the Free plan

| # | Action | Where | Why | Risk |
|---|---|---|---|---|
| **A1** | **Open AI Crawl Control → Crawlers tab and read it.** Note per-crawler request counts (24h window on Free). | `dash.cloudflare.com/?to=/:account/:zone/ai` | Free, instant, and tells you how much of the load is `meta-externalagent` vs the AI roster. Costs nothing to look. | none |
| **A2** | **Confirm every AI crawler is set to Allow.** Especially GPTBot, OAI-SearchBot, ClaudeBot, Claude-SearchBot, Applebot, Amazonbot, Meta-ExternalAgent, Meta-ExternalFetcher. | same, Action column | The site's whole strategy is AI citation. Verify nothing is silently blocked from an earlier experiment. | none |
| **A3** | **Verify Training/Agent/Search category toggles are all OFF (allowed).** | Security Settings → *Configure AI bot policies* | ⚠️ Enabling Training also blocks **mixed Search+Training crawlers** — the exact class that produces citations. And this zone is ad-detected (AdSense), so the ad-scoped variant covers the whole site. | **high if enabled** |
| **A4** | **Verify Managed robots.txt is OFF.** | Security Settings → filter *Bot traffic* → *"Set your preference to block training in robots.txt"* | It **prepends** `Disallow: /` for ClaudeBot/GPTBot/Amazonbot *above* your hand-written allow list, silently inverting your policy. | **high if enabled** |
| **A5** | **Verify Bot Fight Mode is OFF.** | Security Settings → Bot traffic → Bot fight mode | Cannot be excepted (Skip has no effect), force-enables JS Detections, and *"may challenge API or mobile app traffic"* — i.e. every agent and Figma plugin the site is built for. | **high if enabled** |
| **A6** | **Add WAF custom rule, position 1: `(cf.client.bot)` → Skip → All remaining custom rules.** | Security → Security rules → Create rule | Structural guard so no future rule can ever challenge Googlebot / Google-InspectionTool. Uses 1 of your 4 remaining free rules. | none |
| **A7** | *(optional)* **Enable Crawler Hints.** | Caching → Configuration → Crawler Hints | Free IndexNow pings. Bing/Yandex freshness only — **Google does not consume IndexNow**. Mild downside: more crawl invitations on a site already over-crawled. | low |
| **A8** | *(hold)* Leave the single free **rate limiting rule slot empty**, or spend it on a panic brake: `http.request.uri.path contains "/api/png"`, threshold ~50 req/10 s/IP, Managed Challenge. | Security → Security rules → Rate limiting rules | Free counts **per-IP only**, 10 s window, and **cannot exclude cached responses** — useless against Meta's IP pool, and it would throttle cheap cache hits. Only defensible as a circuit breaker on the uncached render path. | medium |

**Explicitly not proposed** (over budget or wrong plan): Super Bot Fight Mode (**Pro or
above**), Bot Management / `cf.bot_management.*` fields / bot scores (**Enterprise**),
Pay Per Crawl (**Enterprise + Bot Management, private beta**), Snippets (**Pro or above**),
ASN / header / cookie rate-limit counting (**Business or Enterprise**), Log action on WAF
rules (**Enterprise**). Cloudflare Pro would unlock the second rate-limit rule, 1-minute
windows, Host/URI/Query fields and Super Bot Fight Mode — I did not verify current Pro
pricing this pass, but it is comfortably above the $10/mo ceiling either way.

### B. Code changes — all **$0**

| # | Change | File | Why |
|---|---|---|---|
| **B1** | **Instrument a `(userAgentToken, pathFamily)` counter.** Bucket on `facebookexternalhit` / `meta-externalagent` / `meta-webindexer` / `meta-externalads` / other, × `/api/og` / `/api/png` / HTML / JSON. Emit to Workers Analytics Engine or the existing admin sink. | `apps/web/src/index.ts` | **Do this first.** Every other recommendation branches on whether Meta traffic is `facebookexternalhit` (no levers, must go cheap) or `meta-externalagent` (robots.txt + AI Crawl Control both work). Verify Analytics Engine inclusion on Workers Paid before wiring. |
| **B2** | **Split `meta-externalagent`, `CCBot`, `Bytespider` out of the blanket-allow group** into their own group with `Disallow: /api/og` + `Disallow: /api/png`. ⚠️ They must be **removed** from the existing combined group — robots.txt groups naming the same UA are **merged**, so leaving them in both is ambiguous. | `apps/web/src/seo.ts:37` (+ `apps/web/test/seo.test.js`) | Training crawlers have no use for rasterized PNGs; `llms.txt` already tells them to use `/api/palettes`. Removes the most CPU-expensive crawl class without blocking anyone. |
| **B3** | **Trim the endpoint documentation from the `robots.txt` tail.** Keep the sitemap line and the `llms.txt` pointer; move the `/api/og`, `/api/png`, `w=`/`h=` spec into `llms.txt` (where most of it already lives). | `apps/web/src/seo.ts:63-73` | `robots.txt` currently hands a menu of expensive endpoints to every crawler that reads it, including ones with no use for images. `llms.txt` reaches the audience that will use it well. |
| **B4** | **Return `410 Gone` for the dead legacy URL formats** the AWS IPs crawl, instead of the rendered 404. | `apps/web/src/index.ts:1304` (`app.notFound`) + the legacy-form matchers | 410 signals permanence; crawlers drop the URLs faster than with 404. ⚠️ Scope strictly to formats you *know* are retired — a 410 on a live palette page deindexes it. |
| **B5** | *(optional)* **Add `Crawl-delay: 10` to the B2 group.** | `apps/web/src/seo.ts` | Free. Google explicitly ignores it; Meta never documents it; **[3P]** Bing/Yandex honour it. Do not plan around it. |
| **B6** | *(optional)* **Drop `PerplexityBot` / `Perplexity-User` from the welcome list**, or leave them and accept that Cloudflare's edge overrides the file. | `apps/web/src/seo.ts:53-54` | Perplexity was de-listed as a verified bot in Aug 2025; they evaluate `cf.client.bot == false` and are caught by your existing HTTP/1.1-Chrome rule when spoofing Chrome. Cosmetic honesty fix. |

### C. Things to deliberately not do

- **Do not block Meta** — the owner's constraint, and also: `facebookexternalhit` is a
  verified Page Preview bot, so blocking it kills real link previews on FB/IG/WhatsApp/Threads.
- **Do not enable Bot Fight Mode** (§5.4). It cannot be excepted, and it breaks the no-auth
  API surface that is the product.
- **Do not enable Training blocking** (§2). It blocks mixed Search+Training crawlers.
- **Do not enable Managed robots.txt** (§2). It overrides your policy from above.
- **Do not use 4xx to throttle Googlebot** (§8). Use 503/429 briefly, or nothing.
- **Do not build a plan around the free rate limiting rule** (§5.2). Per-IP counting against
  a /32 with ~300 announced ranges is theatre.

---

## Sources

**Cloudflare — AI Crawl Control**
- <https://developers.cloudflare.com/ai-crawl-control/>
- <https://developers.cloudflare.com/ai-crawl-control/get-started/>
- <https://developers.cloudflare.com/ai-crawl-control/features/manage-ai-crawlers/>
- <https://developers.cloudflare.com/ai-crawl-control/features/analyze-ai-traffic/>
- <https://developers.cloudflare.com/ai-crawl-control/features/track-robots-txt/>
- <https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/>
- <https://developers.cloudflare.com/ai-crawl-control/reference/bots/>
- <https://developers.cloudflare.com/changelog/2025-07-01-pay-per-crawl/>
- <https://developers.cloudflare.com/changelog/2025-12-10-pay-per-crawl-enhancements/>

**Cloudflare — bots, WAF, cache**
- <https://developers.cloudflare.com/bots/concepts/bot/verified-bots/>
- <https://developers.cloudflare.com/bots/get-started/bot-fight-mode/>
- <https://developers.cloudflare.com/bots/additional-configurations/block-ai-bots/>
- <https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/>
- <https://developers.cloudflare.com/bots/botbase/>
- <https://developers.cloudflare.com/waf/custom-rules/>
- <https://developers.cloudflare.com/waf/custom-rules/skip/>
- <https://developers.cloudflare.com/waf/rate-limiting-rules/>
- <https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/>
- <https://developers.cloudflare.com/cache/how-to/cache-rules/>
- <https://developers.cloudflare.com/cache/how-to/enable-crawler-hints/>
- <https://developers.cloudflare.com/rules/snippets/>
- <https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/>
- <https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/cf.client.bot/>
- <https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/cf.bot_management.verified_bot/>
- <https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/>
- <https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/>
- <https://developers.cloudflare.com/support/troubleshooting/general-troubleshooting/troubleshooting-crawl-errors/>
- <https://developers.cloudflare.com/use-cases/solutions/stop-malicious-bots/>
- <https://radar.cloudflare.com/bots/directory>

**Cloudflare — blog**
- <https://blog.cloudflare.com/content-independence-day-ai-options/>
- <https://blog.cloudflare.com/control-content-use-for-ai-training/>
- <https://blog.cloudflare.com/verified-bots-with-cryptography/>
- <https://blog.cloudflare.com/web-bot-auth/>
- <https://blog.cloudflare.com/signed-agents/>
- <https://blog.cloudflare.com/cloudflare-now-supports-indexnow/>

**Meta**
- <https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers>
- <https://developers.facebook.com/tools/debug/>

**Google**
- <https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec>
- <https://developers.google.com/search/blog/2023/02/dont-404-my-yum>
- <https://developers.google.com/search/blog/2023/11/sc-crawl-limiter-byebye>
- <https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors>

**Third-party [3P]**
- <https://github.com/microlinkhq/cloudflare-bot-directory> (machine-readable Radar mirror, 693 entries)
- <https://bgp.he.net/AS32934> · <https://ipinfo.io/AS32934>
- <https://www.searchenginejournal.com/cloudflare-delists-and-blocks-perplexity-from-crawling-websites/552899/>
- <https://www.techbusinessnews.com.au/news/webmasters-raise-concerns-over-facebooks-aggressive-crawling-and-scraping-practices/>
- <https://hackernoon.com/facebook-bots-crawlers-and-user-agents-causing-resource-drains-on-websites-and-hosting-accounts>
- <https://techcrunch.com/2026/07/01/cloudflares-new-policy-pushes-ai-companies-to-pay-for-publishers-content/>
