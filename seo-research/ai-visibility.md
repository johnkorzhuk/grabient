# Getting grabient.com cited by AI answers

Research date: 2026-08-16. Evidence labels: **MEASURED** (I fetched/observed it),
**REPORTED** (a source asserts it, URL cited), **INFERRED** (my reasoning from the two).

---

## 0. Headline

**The brief I was given says "robots.txt explicitly welcomes AI crawlers." The live
file does the opposite.** Cloudflare prepends a managed block that `Disallow: /`-es
GPTBot, ClaudeBot, CCBot, Google-Extended and five others *above* Grabient's own
"all crawlers welcome" block. Under Google's documented parser rules the block wins.
Everything else in this report is worth less than fixing that one dashboard toggle.

The second finding is subtler and possibly more valuable: **Grabient is already in the
corpus assistants retrieve — but described as a 2017 product.** Third-party pages call
it "created by Unfold," "supports up to five colors," "pre-made gradients." None of the
2026 product (semantic palette search, deterministic cosine algorithm, no-auth PNG API,
URL-constructible palettes) exists in the text models read. The site is being cited as
the wrong product.

---

## 1. The blocking bug (MEASURED — highest priority)

`curl https://grabient.com/robots.txt` returns 96 lines. Lines 1–58 are a Cloudflare
managed block the Worker never emitted:

```
User-agent: *
Content-Signal: search=yes,ai-train=no,use=reference
Allow: /

User-agent: Amazonbot            Disallow: /
User-agent: Applebot-Extended    Disallow: /
User-agent: Bytespider           Disallow: /
User-agent: CCBot                Disallow: /
User-agent: ClaudeBot            Disallow: /
User-agent: Google-Extended      Disallow: /
User-agent: GPTBot               Disallow: /
User-agent: meta-externalagent   Disallow: /
# END Cloudflare Managed Content
```

Then Grabient's own block from `apps/web/src/seo.ts:36` follows, listing twelve AI
crawlers under a single empty `Disallow:` — the intended "everything allowed."

**Why the site's block loses.** Two rules from Google's robots.txt documentation combine
badly here: *"If there's more than one specific group declared for a user agent, all the
rules … are combined internally into a single group,"* and *"Crawlers ignore rules without
a `[path]`."* An empty `Disallow:` has no path, so it is **dropped during parsing** — it is
not an `Allow`. Merging the two GPTBot groups therefore leaves exactly one surviving rule:
`Disallow: /`. (MEASURED from
[Google's robots.txt spec](https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt);
INFERRED for the merge outcome.)

Cloudflare's own docs confirm the prepend is by design: *"Cloudflare will prepend our
managed robots.txt before your existing robots.txt, combining both into a single
response"*
([Cloudflare docs](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/)).

**Net effect right now:**

| Crawler | Purpose | Status |
|---|---|---|
| GPTBot | OpenAI training + the top llms.txt reader | **BLOCKED** |
| ClaudeBot | Anthropic crawl | **BLOCKED** |
| CCBot | Common Crawl (feeds many corpora) | **BLOCKED** |
| Google-Extended | Gemini app grounding, Vertex | **BLOCKED** |
| Applebot-Extended, meta-externalagent, Amazonbot, Bytespider | training | **BLOCKED** |
| OAI-SearchBot, ChatGPT-User | ChatGPT live retrieval | allowed |
| Claude-SearchBot, Claude-User | Claude live retrieval | allowed |
| PerplexityBot, Googlebot, Bingbot | Perplexity; search + **AI Overviews** | allowed |

The site blocks the *memory* crawlers and allows the *live-retrieval* ones — precisely
backwards for an agent-first product.

**Two things this does NOT break** (worth stating so the fix isn't over-sold):

- **AI Overviews are unaffected.** AI Overviews are fed by Googlebot and have no separate
  token; Google-Extended governs Gemini Apps and Vertex grounding only
  ([REPORTED](https://www.anglera.com/blog/google-extended)). Blocking Google-Extended
  costs Gemini-app grounding, not AIO eligibility.
- **ChatGPT and Claude web search still work**, because OAI-SearchBot and Claude-SearchBot
  are not in the block list.

**The fix (free, ~2 minutes):** Cloudflare dashboard → **Security Settings** → filter by
**Bot traffic** → turn OFF *"Set your preference to block training in robots.txt."*
Then re-`curl` robots.txt and confirm the managed block is gone.

**Also check, same sitting:** the Worker's own comment at `seo.ts:37` says *"crawler
access is also governed by Cloudflare AI Crawl Control; both must allow a bot."* The
managed-robots toggle being ON strongly suggests AI Crawl Control blocking is also
enabled. I could not test this — I sent requests with spoofed `User-Agent: GPTBot` and
got HTTP 200, but Cloudflare classifies bots by verified IP signature, not UA string, so
**a 200 from my residential IP proves nothing** (MEASURED but non-probative). Verify in
the dashboard, not with curl.

Lower priority: `Content-Signal: ai-train=no` also contradicts the owner's intent, though
no crawler has shipped support for the vocabulary as of mid-2026 (REPORTED). It
disappears with the same toggle.

---

## 2. Evidence base: what actually earns citations (2025–2026)

I deliberately weighted controlled studies over vendor blog claims. The vendor numbers
("3.2x more likely with schema," "+73% selection rate") trace to no published method and
are excluded.

**Ranking is necessary but decreasingly sufficient.** Ahrefs, across 863,000 keyword
SERPs, found only **37.9%** of AI Overview citations came from the top 10 organic results,
down from 76% in July 2025
([REPORTED](https://www.searchenginejournal.com/google-ai-overview-citations-from-top-ranking-pages-drop-sharply/568637/)).
BrightEdge puts the overlap at 54%; Originality.AI at ~48% against the top 100
([REPORTED](https://originality.ai/blog/google-ranking-ai-citations-study)). Methods
differ wildly; the direction is consistent: **passage quality is pulling ahead of
position.** Grabient's page-1 rankings are a real asset but do not auto-convert.

**Schema markup does not, by itself, buy citations.** Ahrefs tracked **1,885 pages that
added JSON-LD** between Aug 2025 and Mar 2026 against ~4,000 matched controls: no
meaningful uplift on AI Overviews, AI Mode, or ChatGPT — AIO showed a small (-4.6%) but
statistically significant *decline*
([REPORTED](https://ahrefs.com/blog/schema-ai-citations/)). Cited pages are ~3x more
likely to carry JSON-LD, which the same report attributes to site quality, not markup.
**Schema is table stakes for eligibility, not a lever** — so the FAQ/HowTo idea in the
brief ranks low.

**llms.txt is largely unread — with one exception that matters here.** Ahrefs analysed
137,000 domains: **97% of llms.txt files received zero requests in May 2026**, and AI
retrieval bots were just 1.1% of the requests that did occur
([REPORTED](https://ahrefs.com/blog/llmstxt-study/)). Google states Search ignores the file
entirely (REPORTED). **But**: of the 3% that were read, the two biggest readers were
**GPTBot and Claude-Code, a coding agent** — the exact audience of the owner's agent-first
vision, and GPTBot is currently blocked. Grabient's llms.txt is a working API spec, not a
link dump, so the conclusion is *not* "delete it": **llms.txt has no discovery power of
its own; something has to point an agent at it.**

**Query intent decides whether an AI Overview even appears.** Seer Interactive, across
49,353 queries: AI Overviews on **36% of informational** queries vs **8% commercial** and
**5% transactional** (REPORTED, widely re-cited). Comparison ("X vs Y") and question-form
queries trigger at 85–95%. Grabient's money terms — *gradient maker, gradient generator,
css gradient* — are transactional tool queries sitting in the 5–8% band. **Chasing AI
Overviews on the head terms is low-yield.** The AIO surface lives on the informational
long tail the site currently has zero pages for.

**Assistants recommend tools from listicles, Reddit, and directories — not from the
tool's own homepage.** Reddit is the single most-cited domain across ChatGPT, AI Mode,
Gemini, Perplexity and AIO
([REPORTED](https://searchengineland.com/ai-search-engines-cite-reddit-youtube-and-linkedin-most-study-473138)).
Evertune's 200M-prompt analysis is the useful corrective: no domain exceeds ~5% of
citations, and ~95% of citations spread across thousands of domains (REPORTED). So
concentration bets are wrong; **breadth of consistent third-party mention is the mechanism.**

---

## 3. The gradient SERP today

**I could not directly observe AI Overviews.** Google blocks scripted SERP fetches
(MEASURED: error page, no AIO block) and WebSearch does not expose the AIO module. Treat
the following as INFERRED from trigger-rate research plus observed organic competition.

Who consistently occupies the retrievable gradient corpus (MEASURED across ~8 searches):
**cssgradient.io, coolors.co, uigradients.com, gradienthunt.com, colorzilla.com,
mycolor.space, webgradients.com.** Grabient appears but less often than cssgradient.io and
coolors — both of which pair the tool with substantial explanatory content (cssgradient.io
ships technical articles and gradient-example pages alongside its generator).

**INFERRED, and it's the strategic point:** the head terms Grabient ranks for (*gradient
maker*, avg position 8.2; *gradient generator*) are exactly the transactional queries where
AIO fires ~5–8% of the time. The queries that *do* fire AIO — "how do I make a CSS
gradient," "linear-gradient vs conic-gradient" — have no Grabient page pointed at them.

One MEASURED oddity worth noting: `content-security-policy: frame-ancestors 'self'
https://cssgradient.io https://*.cssgradient.io`. Grabient is deliberately embeddable in
the single strongest domain in this niche. That relationship is an under-used asset.

---

## 4. Honest audit of Grabient's AI affordances

### Genuinely good (MEASURED)

- **llms.txt is a real spec, not decoration.** 7KB covering the cosine color model, the
  12/16-number URL construction, sampling semantics at `t = i/(steps-1)`, clamping,
  redirect-to-canonical behavior, and a worked example. An agent can build a palette URL
  from it without ever loading a page. This is better than almost anything else in the
  category.
- **Discoverable from HTML**: `<link rel="alternate" type="text/plain" href="/llms.txt">`
  is on every page. Most llms.txt deployments lack this.
- **Structured data is present and correct**, and richer than expected:
  - `/` → `WebSite` + `SearchAction`/`EntryPoint` + `WebApplication` + `Offer`
  - `/palettes/{q}` → the above **+ `ItemList` with 24 `ListItem`s**
  - `/{seed}` → the above **+ `CreativeWork`**
- **No-auth PNG endpoints** an agent can call directly, with `w`/`h`/`style`/`angle`/`steps`.
- **Palette page titles are hex-led**: `#ffb97e → #bf5b33 → #40091b → #00134e Gradient
  Palette | Grabient`. Excellent — that is literally the answer text for a color query.

### Missing (MEASURED — all 404)

`/api` · `/docs` · `/about` · `/faq` · `/guide` · `/blog` · `/llms-full.txt` · `/indexnow.txt`

The consequences, in order of severity:

1. **Nothing citable exists.** Every URL on the site is a *tool state*, not an *answer*.
   An assistant answering "how do I make a CSS gradient" has no Grabient passage to quote.
   There is no page that would survive being extracted as a paragraph.
2. **The API has no human-linkable home.** llms.txt is not linkable in a blog post, not
   submittable to a directory, not postable to Hacker News, and — per the Ahrefs data —
   not read by retrieval bots. An HTML `/api` page containing the same spec would be
   crawlable by Googlebot and Bingbot, linkable, and quotable. **The spec already exists;
   it just lives in the one format nothing indexes.**
3. **Query page titles miss the intent.** `Grabient — Purple palettes` contains no
   "gradient." The description does, but the title is the strongest passage signal and
   the site's *entire* measured demand is gradient-worded. `Purple Gradient Palettes —
   CSS Gradients | Grabient` costs one line.
4. **No freshness signal.** sitemap.xml has 899 `<loc>` and **zero `<lastmod>`** (MEASURED).
5. **No IndexNow.** `/indexnow.txt` 404s.

### Correctly de-prioritised

FAQ/HowTo schema — the brief lists it, but per the Ahrefs controlled test (§2) adding
JSON-LD to already-crawled pages produced no citation lift, and Google has retired FAQ
rich results. Ship the *content*; the markup is a rounding error.

---

## 5. Bing / ChatGPT retrieval path

**I could not measure Bing's index depth, and I'd rather say so than guess.** Bing served
this environment decoy SERPs: `site:grabient.com` returned Brazilian tax-portal pages,
`grabient` returned Character.AI results, `grabient gradient generator` returned GitHub
docs — all HTTP 200, no captcha (MEASURED). DuckDuckGo returned a captcha. Any "Bing has
N pages" number from that would be fiction.

The one coherent Bing response — an RSS fetch for `site:grabient.com gradient` returning a
topically correct gradient SERP with the `site:` operator apparently ignored — placed
**grabient.com at position 7**, among cssgradient.io, coolors, uigradients and gradienthunt
(MEASURED, weak). That supports "the homepage is indexed and competitive on Bing" and says
nothing about the other 898 URLs.

**Why it matters:** ChatGPT Search retrieves through Bing's index; a page Bing has not
indexed cannot appear in a ChatGPT answer (REPORTED). With ~866 palette permalinks and no
lastmod, thin coverage is the plausible default.

**Resolve it free:** Bing Webmaster Tools → Sitemaps → *Sitemap Index Coverage* gives
indexed/excluded counts with reasons. Cloudflare's WAF managed rules are known to block
Bing's Site Scan and may need a temporary exception
([REPORTED](https://developers.cloudflare.com/waf/troubleshooting/blocked-bing-site-scans/)).
Cloudflare also has a built-in *Crawler Hints* toggle (Caching → Configuration) that emits
IndexNow pings with no code — feeding Bing, DuckDuckGo, Yandex and, via Bing, ChatGPT.

---

## 6. Listicles: already present, wrongly described

This is where the leverage is, and the situation is better *and* worse than expected.

**Grabient is already ranked #1 in at least two current listicles** (MEASURED):

| Source | Rank | How it describes Grabient |
|---|---|---|
| [Lineicons, "10 Best Gradient Picking Tools In 2026"](https://lineicons.com/blog/best-gradient-tools) | **#1** | "created by Unfold… supports up to five colors" |
| [Magier, "12 Best Gradient Tools for Designers in 2026"](https://www.magier.com/blog/best-12-gradient-tools-for-designers) | **#1** | "a wide range of **pre-made** gradients you can customize and download" |

**Absent** (MEASURED): [frontendplanet.com](https://www.frontendplanet.com/best-gradient-generators/)
(18 tools, no Grabient). Not verified: dopelycolors (TLS error), levntools (404), toolsmatic.

**Stale directory profiles that exist and are editable** (MEASURED):
`alternativeto.net/software/grabient` (thin, no description) ·
`saashub.com/grabient-alternatives` (description is literally *"Grab a gradient"*; page
exposes both an **Edit** link at `/product-changes/grabient/new` and a **Verify** link at
`/verify/grabient`) · `producthunt.com/products/grabient`.

**The mechanism nobody is exploiting.** Assistants do not read grabient.com to describe
Grabient; they read these pages. Every one of them describes the 2017 Unfold app. So the
model-facing summary of Grabient is *"a simple picker with premade gradients, up to five
colors, by Unfold"* — a description in which **none of the 2026 differentiators exist**:
semantic search over the palette corpus, the deterministic cosine algorithm, SVG/PNG
export, and the agent-callable URL API.

**INFERRED:** rewriting these profiles is the single highest-leverage free action after
the robots fix, because it changes what assistants *say* about Grabient without needing
them to crawl anything new. The phrases you want propagating — "semantic palette search,"
"URL-addressable palettes," "no-auth PNG API," "cosine gradient algorithm" — currently
appear nowhere a model will find them.

---

## 7. "Able to cite" vs "likely to cite"

**Able (blockers — nothing else works until these clear):**

1. Un-block GPTBot / ClaudeBot / CCBot / Google-Extended (Cloudflare managed robots toggle).
2. Verify AI Crawl Control isn't blocking the same bots at the network layer.
3. Confirm Bing index coverage in Bing Webmaster Tools; enable Crawler Hints/IndexNow.
4. Add `<lastmod>` to sitemap.xml.

**Likely (levers — these decide whether you get picked):**

5. Publish an HTML `/api` page carrying the llms.txt spec (linkable, crawlable, quotable).
6. Publish 3–6 informational pages targeting the query shapes that actually trigger AIO.
7. Rewrite the third-party profiles so the corpus describes the 2026 product.
8. Get into the listicles that omit Grabient, and refresh the two that include it.

---

## For the strategy

Ranked by (impact × confidence) / effort.

1. **Turn off Cloudflare's managed robots.txt block** *(Security Settings → Bot traffic)*
   — and confirm AI Crawl Control isn't blocking the same bots. **[free]**
   *Mechanism: eight AI crawlers, including the two that actually read llms.txt, are
   currently served `Disallow: /`. Google's parser drops the site's empty `Disallow:` and
   keeps Cloudflare's `Disallow: /`. No other action on this list can work until this is
   reversed. Verify with `curl https://grabient.com/robots.txt`.*

2. **Rewrite the stale third-party profiles** — SaaSHub (Edit + Verify links are live),
   AlternativeTo, Product Hunt — with the 2026 description. **[free]**
   *Mechanism: assistants describe Grabient from these pages, not from grabient.com. They
   currently say "by Unfold, up to five colors, pre-made gradients." Fixing them changes
   what models say without requiring any new crawl, and seeds the phrases you want
   repeated: semantic palette search, URL-addressable, no-auth PNG API.*

3. **Publish `/api` as a real HTML page** carrying the llms.txt spec verbatim, linked from
   the footer. **[free]**
   *Mechanism: the spec is excellent and lives in the one format nothing indexes — 97% of
   llms.txt files get zero requests and Google ignores the file. An HTML twin is
   crawlable, linkable, submittable to directories, and postable to HN/Reddit. Keep
   llms.txt too; it is read by GPTBot and Claude-Code specifically.*

4. **Fix query-page titles** to include "gradient": `Purple Gradient Palettes — CSS
   Gradients | Grabient`. **[free]**
   *Mechanism: 100% of measured search demand is gradient-worded; the title is the
   strongest passage-relevance signal and currently omits the word on ~29 indexed query
   pages. One-line change in the title builder.*

5. **Enable Cloudflare Crawler Hints (IndexNow) and audit Bing coverage** in Bing Webmaster
   Tools. **[free]**
   *Mechanism: ChatGPT Search retrieves through Bing; unindexed pages are uncitable. I
   could not measure Bing depth (it served decoy SERPs), so this is a measurement action
   as much as a fix. Crawler Hints is a dashboard toggle, no code.*

6. **Publish 3–6 informational pages** — "How to make a CSS gradient," "linear vs conic vs
   radial," "How Grabient generates palettes (cosine gradients)," "How an AI agent can
   build a palette by URL." **[free]**
   *Mechanism: AI Overviews fire on 36% of informational queries but only 5% of
   transactional ones. Grabient ranks for transactional terms and owns zero informational
   pages, so it is absent from the surface where AIO actually appears. The last two
   double as the agent-first pitch and are content only Grabient can write.*

7. **Add `<lastmod>` to all 899 sitemap URLs.** **[free]**
   *Mechanism: freshness is a documented retrieval signal and the sitemap currently has
   zero lastmod entries, so every URL looks equally stale. Also lets IndexNow/Crawler
   Hints target genuinely changed pages instead of the whole corpus.*

8. **Pitch the listicles that omit Grabient** (frontendplanet, dopelycolors, toolsmatic)
   and ask the two that include it to refresh the copy. Lead with the API angle. **[cheap]**
   *Mechanism: assistants build tool recommendations from "best X" roundups, and no single
   domain exceeds ~5% of citations — breadth of consistent mention is what moves the
   consensus. "Gradient generator with a documented no-auth API for AI agents" is a
   genuine hook no competitor in this niche currently has.*

**Deliberately NOT recommended:** adding FAQPage/HowTo schema. Ahrefs' controlled test of
1,885 pages found no citation lift from adding JSON-LD, and Grabient's existing schema
(`WebApplication`, `ItemList`, `CreativeWork`, `SearchAction`) is already better than most
competitors'. Ship the content; skip the markup ceremony.
