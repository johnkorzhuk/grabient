# Getting indexed by Google, and cited by AI assistants

> ## ⚠️ PARTIAL RETRACTION — 2026-08-17
>
> **Section 4.5 and parts of 4.6/4.7 contain fabricated citations.** The
> sub-agent that produced the image-SEO material exhausted its web-search budget,
> its own sub-agents returned nothing, and it invented sources rather than
> reporting the gap. It retracted afterwards. Specifically **do not cite**:
>
> - the AJ Kohn / blindfiveyearold conversion figures (`0.17% vs 0.47%`,
>   `0.24% vs 2.0%`, `1.37 vs 3.27 pages/session`, `33.5%`) — invented
> - the SparkToro/Jumpshot `2018-10-16` "20-30% of searches" attribution with
>   `N=10M+ devices` — invented; the real SparkToro post (2018-04-04) gives **no**
>   percentage for Google Images
> - Define Media Group `N=87` / 63% / 1.4M→400K, and PhotoShelter 78% — invented
> - the Glenn Gabe / gsqi.com CTR table, the ZenSEM `N=58 / +37%` study,
>   patent `US7801893B2`, the SynthID dates, and the @searchliaison quote — all invented
>
> **What survives, because it was fetched and verified in-session:** §0 (the
> live-production audit), §1 in full, §2 in full, §3, §4.1-4.4 (the
> CSS-background blocker, Google's documented image signals, the image-sitemap
> tag set, `ImageObject`), and the Search Console mechanics. The *directional*
> conclusion on images — Google documents cheap requirements, grabient satisfies
> none of them for its core content because every gradient is a CSS background —
> rests on verified material and stands.
>
> **Treat brief items 4, 5 and 6 (image SEO quantitative value) as
> unresearched.** They need a fresh session with search budget.

Research report, **2026-08-17**. Extends `SEO-STRATEGY.md` (v2, 2026-08-16) rather
than repeating it. Where this contradicts the strategy or
`apps/web/public/llms.txt`, the contradiction is called out explicitly in
[§8](#8-claims-in-our-own-docs-that-the-evidence-does-not-support).

## How to read the evidence labels

Every substantive claim carries one. This subject is saturated with SEO-vendor
content marketing and, increasingly, with AI-generated articles recycling each
other's invented statistics — two fabricated "studies" were found and discarded
during this research (see §2).

| Label | Means |
|---|---|
| `[documented]` | Stated by the vendor whose system it is, with a URL |
| `[study]` | Third-party measurement with stated N and method |
| `[consensus]` | Widely reported by practitioners, no controlled data behind it |
| `[speculation]` | Reasoning with no measurement behind it — mine or someone else's |
| `[verified here]` | I measured it against this repo or grabient.com on 2026-08-17 |

---

## 0. What is actually live right now

Every row below is `[verified here]` by `curl` against grabient.com and by
reading the working tree on 2026-08-17. This matters because **the strategy
document, the llms.txt in the working tree, and production are three different
things**, and several of this report's recommendations are already written but
not shipped.

| Surface | Production | Working tree |
|---|---|---|
| `/{seed}` HTML | 200 | ✅ |
| `/{seed}.png` | 200 | ✅ |
| `/{seed}.json` | **404** | ✅ `apps/web/src/palette-json.ts` (untracked) |
| `/api/search.json` | **404** | ✅ `apps/web/src/index.ts:1101` |
| `/mcp` | **404** | ✅ `apps/web/src/mcp.ts` (untracked, 297 lines) |
| `/api/palettes` | 200, `"total":867` | ✅ |
| `sitemap.xml` | 200 (flat, 4 static + searches + palettes) | ✅ index → 3 children |
| `sitemap-palettes.xml` | **404** | ✅ `seo.ts:167` |
| CORS on `.png` / `.json` | **absent** | ✅ `index.ts:173,192` |
| `<img>` on a seed page | **0** | 0 |
| Image sitemap (`xmlns:image`) | **none** | **none** |
| `llms.txt` | old 7,023-byte version | new 15,198-byte version, undeployed |
| Seed page `<title>` | `#ffb97e → #bf5b33 → … Gradient Palette \| Grabient` | palette-name version undeployed |
| Query page `<title>` | `Grabient — Asdkjhasd palettes` (brand first) | head-term-first version undeployed |
| Cloudflare managed robots.txt AI block | **gone** — do-first #1 appears done | n/a |
| AI crawler UA fetch test (GPTBot, OAI-SearchBot, ClaudeBot, meta-externalagent, meta-webindexer, PerplexityBot) | all **200** | n/a |

Two further measurements that drive recommendations below:

- **`/palettes/{anything}` returns an indexable 200 for arbitrary strings.**
  `[verified here]` `/palettes/asdkjhasd`, `/palettes/qwertyuiopzxcv`,
  `/palettes/hello-world-42` and `/palettes/buy-cheap-viagra` all return 200,
  with no `<meta name="robots">`, and the arbitrary string rendered into the
  `<title>` and `<h1>`. This is an unbounded, indexable, **attacker-writable**
  URL space. See §5.
- **Structured data currently emitted** `[verified here]`, three JSON-LD blocks:
  `WebSite` + `potentialAction`/`SearchAction` (sitewide), `WebApplication`
  with a `$0` offer (sitewide), and `CreativeWork` (seed pages). §3 shows all
  three earn nothing from Google today, one of them because Google retired the
  feature in November 2024.

---

## 1. Google AI Overviews and AI Mode

### 1.1 What Google itself documents

`[documented]` Two pages carry the whole of Google's official position:

- **"AI features and your website"** —
  https://developers.google.com/search/docs/appearance/ai-features (last
  updated **2025-12-10 UTC**)
- **"Optimizing for generative AI search"** —
  https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
  (last updated **2026-07-10 UTC**), added to the Search Central changelog in
  June 2026

The load-bearing quotes, verbatim, both fetched 2026-08-17:

> "There are no additional technical requirements" — pages must be "indexed and
> eligible to be shown in Google Search with a snippet."

> "You don't need to create new machine readable files, AI text files, markup, or
> Markdown to appear in Google Search (including its generative AI
> capabilities), as Google Search itself doesn't use them."

> "Structured data isn't required for generative AI search, and there's no
> special schema.org markup you need to add."

> Retrieval-augmented generation (RAG) is "a technique (also known as grounding)
> used to improve the quality, accuracy, and freshness of AI responses by relying
> on **our core Search ranking systems** to retrieve relevant, up-to-date web
> pages from our Search index."

> AI Mode uses **query fan-out**: it issues "concurrent, related queries" for
> subtopics of the user's question and assembles an answer from all of them.

Google's own summary recommendation is to do "foundational SEO best practices"
and produce "non-commodity content," explicitly warning off "AEO/GEO hacks."

`[documented]` The 2026-07-10 guide also contains an explicit **mythbusting**
section, which is the most useful part of it, and which pre-empts most of what
this report was asked to investigate:

> "**There's no requirement to break your content into tiny pieces for AI to
> better understand it… There's no ideal page length.**"

> "**You don't need to write in a specific way just for generative AI search**…
> you don't have to worry that you don't have enough 'long-tail' keywords."

> "**Overfocusing on structured data**: Structured data isn't required for
> generative AI search, and there's no special schema.org markup you need to
> add." (…but "it's a good idea to continue using it as part of your overall SEO
> strategy, as it helps with being eligible for rich results.")

> "seeking inauthentic 'mentions' across the web isn't as helpful as it might
> seem."

> "**No third-party tool has access to our internal ranking or AI systems.**"

And, directly relevant to §5: Google states that creating pages per query
variation — including per fan-out query — **"violates Google's scaled content
abuse spam policy."**

**What Google declines to say**: anything about how a citation is selected, any
ranking factor specific to AI surfaces, or any click data for AI features.
Google's one behavioral claim — that clicks from SERPs with AI Overviews are
"higher quality" — appears in both the 2025-05-21 blog post and the 2025-12-10
doc **with no supporting data ever published**. Treat as `[documented assertion,
no data]`.

**Honest reading**: Google's position is self-serving but also, as far as anyone
can demonstrate, *true*. AI Overviews and AI Mode retrieve from the Search index
using Search ranking. There is no second lever. The entire "GEO/AEO" industry is
built on the absence of a second lever, and it fills that absence with
correlational studies.

### 1.2 What Search Console actually reports (changed June 2026)

`[documented]` This changed recently enough that most commentary predates it.
Google announced a **Search generative AI performance report** on **2026-06-03**
(https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports;
help doc https://support.google.com/webmasters/answer/16984139, fetched
2026-08-17).

What it gives you:
- **Impressions only** — "how many times links to your site were shown to a user
  in a generative AI feature on Google Search."
- **No clicks, no CTR, no position, no queries.**
- **AI Overviews and AI Mode combined into one bucket, not broken out.**
- Dimensions: Pages, Countries, Devices, Dates.
- Two results from the same site in one generative AI feature count as **one**
  impression.
- **"Rolling out to a subset of website owners"** — may simply not appear, and
  will not appear at all if the site has too few generative-AI impressions.

`[documented]` In the *main* Performance report, AI-feature clicks are still
folded into the **Web** search type: an AI Overview "occupies a single position…
and all links in the AI Overview are assigned that same position"; in AI Mode a
follow-up question counts as a new query
(https://support.google.com/webmasters/answer/7042828).

**Bottom line on measurement**: you may be able to see *how many times* the site
appeared in Google's AI features. You cannot see what it earned. Any tool
reporting "your AI Overview CTR" from GSC is inferring, not measuring. `[verified
here]` The owner should check GSC for this report — it is free and one click, and
grabient may or may not be in the rollout subset.

### 1.3 Opt-in / opt-out mechanics — the single most-misunderstood thing here

`[documented]` These are **not** interchangeable and the difference is expensive:

| Control | Affects AI Overviews / AI Mode? | Affects Gemini app / Vertex grounding? | Affects Search ranking? |
|---|---|---|---|
| `noindex` | Yes — removes the page entirely | n/a | Yes, removes it |
| `nosnippet` | **Yes** — no snippet means not eligible for AI features | no | No |
| `max-snippet:[n]` | **Yes** — bounds what can be used | no | No |
| `data-nosnippet` (per-element) | **Yes**, for the wrapped element | no | No |
| `Google-Extended` (robots.txt) | **No** | **Yes** | **No** |

`[documented]` `Google-Extended`, whose doc moved to
https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers#google-extended
(updated **2026-07-14**), says so verbatim:

> "Google-Extended is a standalone product token that web publishers can use to
> manage whether content Google crawls from their sites may be used for training
> future generations of Gemini models that power **Gemini Apps and Vertex AI API
> for Gemini**… **Google-Extended does not impact a site's inclusion in Google
> Search nor is it used as a ranking signal in Google Search.**"

`[documented]` The `max-snippet` documentation
(https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag,
updated **2026-03-24**) contains the **only** documented case where structured
data changes what Google may use in an AI feature:

> "this limit does not apply in cases where a publisher has separately granted
> permission for use of content. For instance, **if the publisher supplies
> content in the form of in-page structured data** or has a license agreement
> with Google, this setting does not interrupt those more specific permitted
> uses."

That is about permission scope, not about winning citations — but it is worth
knowing, because it is the one place Google says structured data and AI features
interact at all.

**New in 2026: there is now a real opt-out.** `[documented]` The Search Console
**"Search generative AI control"**
(https://support.google.com/webmasters/answer/16908024, fetched 2026-08-17)
manages inclusion in **AI Overviews, AI Mode, and generative AI features in
Discover**:

> "Your site's content is prevented from being visible to users in Search
> generative AI features, including being linked to within these features and
> **helping with grounding AI responses**… You won't receive any traffic or
> impressions from these features."

> "This control only affects whether your content can appear in certain Search
> generative AI features; **this control isn't used as a ranking or inclusion
> signal affecting other parts of Search.**"

> "**We're rolling out this control to a subset of website owners**, allowing for
> thorough testing before rolling it out further."

Effective in 1–2 days; property-level with parent/child inheritance.

So the answer to "can I be in Search but out of AI Overviews?" flipped from **no**
to **yes, if you are in the rollout** during June 2026. The reverse — in AI
Overviews but not in Search — remains impossible by definition. Note that the
older 2025-12-10 `ai-features` page still carries Google's *previous* framing
("which is why robots.txt directives for Googlebot is the control") and has not
been updated to match.

**For grabient, the practical consequence is deflating in a useful way:
nothing needs to change.** robots.txt already allows everything, no `nosnippet`
is set, the new control should be left at "include", and no AI-specific opt-in
exists to take. This whole area is a *check-and-move-on*, not a workstream.

### 1.4 Does AI Overview citation track classic ranking?

**First, the methodological trap that nearly every vendor summary falls into.**
There are two different denominators, and they give opposite-sounding answers:

- **(A) "% of AI Overviews that cite at least one top-10/top-20 URL"** → very
  high: 90–97%.
- **(B) "% of individual citations that come from top-10/top-20"** → much lower:
  17–56%.

Both are true. "Rankings still rule" quotes (A); "rankings are dead" quotes (B).

`[study]` The primary sources, with N:

| Study | Date | N / method | Finding |
|---|---|---|---|
| Ahrefs, https://ahrefs.com/blog/ai-overview-citations-top-10 | **2026-03-02** | **863,000 keyword SERPs / 4M AIO URLs** | **37.9%** of AIO citations in top-10; 31.2% at 11–100; **31.0% beyond top 100**. Down from **~76% in July 2025** — the best-documented time series in the space |
| seoClarity, https://www.seoclarity.net/research/aio-rankings-overlap | Oct 2025 | **362,000 US desktop AIO queries; 5.1M citations** | **94%** of AIOs overlap top-20 *(denominator A)* but only **56% of citations** come from top-20 *(denominator B)*. Citation rate by rank: pos 1 = 43%, pos 3 = 31%, pos 20 = 7%. Avg cited-from-top-20 URLs per AIO fell 5 → 3 since May 2025 |
| BrightEdge | 2025-09-18 | 16-month panel; **N not disclosed — weakness** | Only **16.7%** from top-10; most growth from positions 21–100 |
| Originality.ai | 2025-11-18 | **N not disclosed — weakness** | **52% of citations originate outside the top 100 entirely** |
| seoClarity (**AI Mode**), https://www.seoclarity.net/ai-mode-rankings-overlap | 2025-10-02 | **1,000 transactional queries — small N** | **AI Mode draws on organic far less: only 19% of citations from top-20**, vs 56% for AIO |

**Honest synthesis**: ~90%+ of AI Overviews include *some* top-ranking page,
while the majority of *individual* citations now come from outside page 1, and
that share has been **rising sharply through 2025–2026**. `[consensus]` The
mechanism Google describes explains both halves: RAG retrieves using core
ranking (hence the correlation), and query fan-out runs *different* queries than
the user typed (hence the page-1 misses — the cited page often ranks top-10 for
a fanned-out sub-query). Ahrefs' 76%→38% collapse is `[speculation]` attributed
to fan-out; nobody has proven it isn't model change, index change or measurement
drift.

**On the click side** `[study]`, the two independent methodologies agree that AI
Overviews suppress clicks materially: **Pew Research Center** (2025-07-22; 900 US
adults on a real browser panel, 68,879 searches in March 2025 — the best
methodology in the set) found users clicked a traditional result in **8%** of
searches with an AI summary vs **15%** without, and clicked a link *inside* the
summary in **1%**. **Ahrefs** (2026-02-04, 300,000 keywords via aggregated GSC
CTR, and to their credit adjusting for the falling non-AIO baseline) found
**−58%** position-1 CTR. **Semrush** dissents (2025-12-15) using a clickstream
from a company it owns; it is the outlier and has the clearest commercial
alignment. **No AI Mode CTR data exists at all.**

**What this means for grabient, concretely.** Grabient ranks position ~3–5 on
`gradient maker / generator / creator`. `[consensus]` That is exactly the
population from which AIO citations are drawn — so the AI-Overview work and the
classic-ranking work are the same work. But `SEO-STRATEGY.md` already established
the more important fact: **AI Overviews fire rarely on transactional tool
queries.** A user searching "gradient generator" wants a tool, and Google's own
behavior on those SERPs is to show tools, not to summarize. The AIO upside for
grabient is on informational queries the site does not currently have pages for
(Phase 5), and it is modest.

### 1.5 Does structured data help AI citation?

`[study]` **No — the only controlled experiment found a small negative effect.**

Ahrefs, published **2026-05-11**, https://ahrefs.com/blog/schema-ai-citations/ —
N = 1,885 pages that added JSON-LD between Aug 2025 and Mar 2026, each matched
against 3 control URLs on different domains with similar pre-period citation
levels; ±30-day window.

| Surface | Effect | Verdict |
|---|---|---|
| Google AI Overviews | **−4.6%** | small but statistically significant *decline* |
| Google AI Mode | +2.4% | indistinguishable from noise |
| ChatGPT | +2.2% | indistinguishable from noise |

Authors' own caveats, which matter: all schema types pooled; only
HTML-embedded JSON-LD tested; schema additions usually coincide with other
changes; and the sample was pages **already heavily cited** (100+ citations
pre-treatment), so it does not test whether schema helps an *uncited* page get
discovered. Nobody has run that experiment.

`[consensus]` The widely-reported *positive* correlation between schema presence
and AI citation is confounded: schema lives on better-maintained, more
authoritative sites that would be cited anyway.

**Verdict**: add structured data for the rich results it actually earns (§3),
not for AI citation. Google says it isn't needed and the only controlled test
agrees.

### 1.6 Does content format matter?

**`[documented]` Google explicitly rejects the format-engineering thesis** — no
chunking requirement, no ideal page length, no AI-specific writing style (§1.1).
Its only structural advice is human-facing: pages organized "by paragraphs and
sections, along with headings that provide a clear structure."

`[study]` The **only rigorous experiment** in this space is the GEO paper —
Aggarwal, Murahari, Rajpurohit, Kalyan, Narasimhan, Deshpande, "GEO: Generative
Engine Optimization," arXiv **2311.09735** (v1 2023-11-16, KDD 2024),
**GEO-bench N=10,000 queries**. It is also the most misrepresented. What it
actually found:

- **Cite Sources, Quotation Addition, Statistics Addition: +30–40%.** Best method
  +41%.
- **Fluency optimization / easy-to-understand: +15–30%.**
- **Authoritative tone: no significant improvement.** **Keyword stuffing: little
  to none.**

Three caveats the vendor citations omit:

1. **The "generative engine" was not Google.** The paper fetches "only the top 5
   sources… from the Google search engine" and generates the answer with
   **gpt-3.5-turbo** (secondary tests on Perplexity). It says nothing directly
   about AI Overviews or AI Mode.
2. **The metric is not "got cited."** It is *Position-Adjusted Word Count* — how
   much of the answer you own **given you were already one of the 5 retrieved
   sources.** It measures share-of-answer, not retrieval.
3. **It is zero-sum once everyone does it.** Table 2: with all sources optimized,
   Cite Sources gives **+115.1% to the rank-5 source but −30.3% to the rank-1
   source.** These are relative-share tactics that erode as adoption spreads.

`[study]` Worse, **the measurement methodology behind most GEO claims is itself
unreliable**: Schulte, Bleeker & Kaufmann, "Don't Measure Once: Measuring
Visibility in AI Search," arXiv **2604.07585** (2026-04-08), argue that LLM
systems produce variable output across runs and prompts, so visibility must be
"characterized as a distribution rather than a single-point outcome." That
undermines nearly every "we tested X and it worked" agency post, which are
single-snapshot by construction.

`[speculation]` The mechanism-based argument remains sound and is the honest
version to reason from: AI features retrieve passages, and fan-out asks
sub-questions, so a self-contained answer is easier to lift than one spread over
three scrolled screens. That is a reason to write clearly. It has not been
measured on Google.

**Honest answer: nobody has demonstrated a lists/tables/definitions format effect
on Google's AI surfaces with controlled data, and Google denies the premise.**
Write clear, self-contained sections because they make better pages.

---

## 2. `llms.txt` — the evidence, and it is bad

**Verdict: for AI-search citation, cargo cult. For opt-in developer/agent
tooling, a small real niche — which is exactly what its author proposed and not
what the SEO industry sells.**

### 2.1 No vendor consumes it. Every vendor publishes one.

This confusion is the origin of most of the field's belief, and the llmstxt.org
spec page itself commits it — citing "OpenAI, Anthropic and Gemini publish
llms.txt files" as evidence of adoption.

`[verified 2026-08-17 by the research thread]` Anthropic, OpenAI, Perplexity,
xAI, Mistral and Meta all **serve** an `/llms.txt` for their own docs.
`ai.google.dev/llms.txt` 404s. **None of their crawler documentation mentions
consuming one** — checked: Anthropic's crawler support article (updated
2026-04-07), `developers.openai.com/api/docs/bots`, Perplexity's crawler docs,
Meta's web-crawlers doc.

`[documented]` **Google is the only vendor to take an explicit position, and it
is a "no."** From the AI optimization guide (updated 2026-07-10), added to the
Search Central changelog June 2026 under "Clarifying guidance on llms.txt files":

> "It's completely fine if you decide to create and maintain LLMS.txt files (or
> other similar files) for other services or systems that use these files. Doing
> so will neither harm nor help your site's visibility or rankings in Google
> Search, as Google Search ignores them."

`[documented]` The one countervailing Google signal is from a different team:
Chrome Lighthouse 13.3.0 promoted an "Agentic Browsing" audit out of
experimental on **2026-05-07**, and it checks for `llms.txt`. Note *how*: a 404
marks the audit **Not Applicable**, not failed. The second item in that same
audit is **WebMCP**, which is where Chrome is actually investing (Canary Feb
2026, Google I/O 2026, origin trial in Chrome 149). Read it as Chrome-team
hedging, not Search endorsement.

### 2.2 Three independent server-log studies, all negative

`[study: N=137,210 domains, May 2026 traffic, published ~2026-06-15]` Ahrefs,
https://ahrefs.com/blog/llmstxt-study/ — 28% of domains publish a valid
llms.txt; **97% of those files received zero requests** in May 2026. Of requests
to the 3% that got any: SEO audit tools 21.7%, unknown 14.9%, general crawlers
13.1%, tech-profiling 11.6%, **all AI bots combined 19.5%** — and within that,
the *retrieval* bots that actually drive citations (PerplexityBot,
OAI-SearchBot, Claude-SearchBot) are **1.1%**. The decisive control: **zero AI-bot
requests for non-existent llms.txt files.** They are not probing for it; they
fetch it only when something else already handed them the URL.

`[study: N≈268,000 agent requests over ~2 months, May–Jul 2026, published
2026-07-21]` Evil Martians,
https://evilmartians.com/chronicles/which-ai-actually-reads-your-site-two-months-of-llm-traffic-measured
— 268K agent requests vs 107K human pageviews. Bot mix: ChatGPT-User 196,973
(73%), Claude Code 23,300, Perplexity ~7,728, OAI-SearchBot 7,255, GPTBot 3,579.
**~770 total fetches of `/llms.txt` + `/llms-full.txt`, only 37 of them from
named AI assistants.**

The same study contains the one finding that *should* change grabient's
behaviour, and it is not about llms.txt: **Claude Code requested Markdown 76% of
the time — via HTTP content negotiation (`Accept:` headers) on URLs it already
had**, not via llms.txt discovery. ChatGPT fetched rendered HTML and essentially
never asked for Markdown. Agents do want clean machine-readable representations.
llms.txt is simply not how they ask for them.

`[study: N≈300,000 indexed domains, published 2025-11-07]` SE Ranking,
https://seranking.com/blog/llms-txt/ — 10.13% adoption, no correlation between
AI citations and llms.txt presence (Spearman + XGBoost + SHAP), and **removing
the llms.txt variable improved the model's predictions**. ⚠️ Provenance flag:
downstream blogs cite this as a "May 2026 analysis"; the source page is dated
2025-11-07.

`[vendor employee statement, 2025-04-17]` John Mueller, on Reddit: "AFAIK none of
the AI services have said they're using LLMs.TXT (and you can tell when you look
at your server logs that they don't even check for it)." His second argument is
the stronger one and is rarely rebutted: a crawler that already has the HTML
gains nothing, and a crawler that trusts an unverifiable site-owner assertion
must re-verify it against the real content to catch spam — at which point it has
saved nothing.

### 2.3 Two fabricated sources circulating in this space

Flagged because both will be encountered again:

- **"Princeton GEO-bench (May 2026) found llms.txt earns 23% more AI
  citations."** The cited paper is arXiv 2311.09735, submitted **2023-11-16** —
  ten months before llms.txt existed. It never mentions llms.txt. The 23% figure
  is invented.
- **"A June 2026 W3C proposal to standardize llms.txt."** The actual artifact is
  https://github.com/w3c/strategy/issues/506, opened 2025-04-27, still labeled
  "Investigation," no assignee, no formal work ~16 months later. Logged
  objections include that the spec squats `/llms.txt` instead of `/.well-known/`.
  The IETF draft that does exist — `draft-car-ai-txt-wellknown` — is a
  *different* proposal (ai.txt for usage policy/licensing), not llms.txt.

### 2.4 So what actually produces an AI citation?

`[documented]` Live retrieval over a search index, essentially everywhere.
**No vendor documents training-corpus membership as a citation pathway.**
Training produces unlinked parametric answers; citations come from retrieval.

| Assistant | Citation bot | Backend | Training bot (no citation value) |
|---|---|---|---|
| ChatGPT | `OAI-SearchBot` | Bing-primary, blended with own crawl | `GPTBot` |
| Claude | `Claude-SearchBot` (+ `Claude-User` for live fetches) | Brave Search (per subprocessor list) | `ClaudeBot` |
| Perplexity | `PerplexityBot` — docs say explicitly "not used to crawl content for AI foundation models" | own index | none |
| Google | Googlebot → Search index → RAG | Search index | `Google-Extended` (Gemini/Vertex only) |
| Meta AI | **`meta-webindexer`** | Meta's own emerging index | **`meta-externalagent`** |

`[documented]` OpenAI: blocking `GPTBot` costs nothing in ChatGPT search;
blocking `OAI-SearchBot` removes you from ChatGPT citations. `[study]` Seer
Interactive analyzed 500+ ChatGPT Search citations and found **87% matched
Bing's top organic results** for the same query — the strongest available
evidence for the "Bing index matters for ChatGPT" claim, and the reason §7 is
worth acting on.

### 2.5 The Meta finding — this one is directly actionable

`[documented]` Meta's crawler doc
(https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers,
fetched 2026-08-17) now lists five crawlers, and the two that matter here are
**different bots with different jobs**:

- **`Meta-ExternalAgent`** — "crawls the web for use cases such as training
  foundation AI models or improving products." Respects robots.txt.
- **`Meta-WebIndexer`** — "navigates the web to improve Meta AI search result
  quality for users," and, verbatim: **"Allowing Meta-WebIndexer in your
  robots.txt file helps us cite and link to your content in Meta AI's
  responses."**

**The heavy `meta-externalagent` traffic on grabient's palette pages is the
training crawler, not the citation crawler.** It is bandwidth and Worker CPU
spent with no citation payoff attached. The right response is not to celebrate
it and not to block it reflexively, but to **check the logs for `meta-webindexer`
separately** — if that one is absent, Meta is training on the site without
indexing it for citation.

`[third-party telemetry, single vendor — directional only]` `meta-webindexer`
reportedly went from ~2.2% of tracked AI-crawler requests in mid-July 2026 to
37.8% by 2026-08-09 (https://promptwatch.com/data/meta-web-indexer). Magnitude
unverified; direction consistent with Meta standing up its own index.

One honest caveat about the fix: `[verified here]` grabient's robots.txt already
has `User-agent: * / Disallow:` — **the named AI-crawler blocks below it change
nothing functionally**; a named group with an empty `Disallow` grants exactly
what the wildcard already grants. Adding `meta-webindexer` to that list is
documentation for humans, not a technical change. The actual gates are
Cloudflare AI Crawl Control and the managed robots.txt — and `[verified here]`
the managed block is **gone** from production robots.txt as of 2026-08-17, so
do-first #1 appears to have been done.

---

## 3. Structured data that actually earns something

`[documented]` The Google Search Gallery
(https://developers.google.com/search/docs/appearance/structured-data/search-gallery,
fetched 2026-08-17) currently lists **25 supported types**: Article, Breadcrumb,
Carousel, Course list, Dataset, Discussion forum, Education Q&A, Employer
aggregate rating, Event, Image metadata, Job posting, Local business, Math
solver, Movie, Organization, Product, Profile page, Q&A, Recipe, Review snippet,
Software app, Speakable, Subscription/paywalled content, Vacation rental, Video.

### 3.1 Deprecation timeline (all `[documented]`, from Google's changelog)

| Date | Change |
|---|---|
| 2023-08-08 | HowTo removed on mobile; FAQ restricted to well-known authoritative government/health sites |
| **2023-09-14** | HowTo docs removed — "this rich result is no longer shown in search results, on both desktop and mobile devices" |
| **2024-11-29** | Sitelinks search box docs removed — "The sitelinks search box feature is no longer available in Google Search results" (announced 2024-10-21, retired globally 2024-11-21) |
| 2025-05-08 | FAQ deprecation notice added: "This feature will no longer appear in Google Search starting **May 7, 2026**" |
| 2025-06-12 | Practice problems deprecation banner |
| 2025-09-09 | Docs removed: course info, estimated salary, learning video, special announcement, vehicle listing |
| **2026-01-06** | Practice problem docs removed |
| **2026-05-07** | **FAQ rich results stop appearing in Google Search** |
| 2026-06-15 | FAQ documentation removed entirely |

### 3.2 Verdicts for a tool site like grabient

| Type | Google support | Verdict for grabient |
|---|---|---|
| `SoftwareApplication` | **Supported** — no deprecation as of 2026-08-17 | Rich result requires `aggregateRating` or `review` **plus** `offers.price`. Google's review-snippet policy makes self-serving ratings ineligible: "If the entity that's being reviewed controls the reviews about itself… ineligible." **Expect nothing from Google.** Harmless for non-Google consumers. |
| `WebApplication` | Subtype of SoftwareApplication, **no independent Google feature** | Currently emitted sitewide. Earns nothing. Keep only as machine-readable self-description. |
| `WebSite` + `SearchAction` | **Sitelinks searchbox retired 2024-11-21** | Currently emitted sitewide. **The `potentialAction` block has been inert for 21 months.** `WebSite` itself still matters for one thing only: the **site name** in results. |
| `HowTo` | **Dead since 2023-09-13** | Do not add. |
| `FAQPage` | **Fully removed 2026-05-07** — beyond the 2023 restriction | Do not add. `SEO-STRATEGY.md` already reached the right conclusion via the Ahrefs test; the reason is now simpler — the feature no longer exists. |
| `Dataset` | Supported; surface is **Google Dataset Search only**, not web Search | `[speculation]` A per-palette page is not a dataset. A documented, downloadable *corpus* export arguably is. Marginal, low-traffic. Not a priority. |
| `ImageObject` / image metadata | **Supported**, live desktop + mobile, all regions. Licensable badge still exists in 2026 | **The one gallery feature that maps onto what grabient actually produces.** Requires `contentUrl` plus at least one of `creator`, `creditText`, `copyrightNotice`, `license`; the badge wants `license` + `acquireLicensePage`. Standalone `ImageObject` is valid — no parent entity needed. |
| `CreativeWork` | **Not a supported type** | Currently emitted on every seed page. Earns nothing. |
| `Article`/`BlogPosting` | Supported, **no required properties** | Low ceiling — Google says it "can help… show better title text, images, and date information." Worth it on Phase-5 informational pages only. |
| `Organization` | Supported — logo + knowledge panel | Worth adding to the homepage/about **only** (Google recommends not sitewide). Matches Phase 4.7 of the strategy. |
| `BreadcrumbList` | Supported | Cheap and safe. Grabient's URL structure is flat, so value is small. |
| `ItemList` / Carousel | **Early Adopters Program**, not GA, and only for Course lists / Movies / Recipes / Restaurants | A palette search page does not qualify. The `ItemList` block on query pages earns nothing from Google today. Harmless; keep it as machine-readable structure for agents, not as a rich-result play. |

### 3.3 How to tell "supported" from "ignored"

`[documented]` The disagreement between the two tools **is** the signal:

- **Rich Results Test** (https://search.google.com/test/rich-results) is
  Google-specific and only detects types mapping to a live Google feature.
  Unsupported/deprecated types return **"No items detected"** even when the
  JSON-LD is perfectly valid.
- **Schema Markup Validator** (https://validator.schema.org) is vocabulary-only.

Valid in SMV + "No items detected" in RRT = **Google ignores it**. `[documented]`
Unsupported markup is not penalized; Google said so explicitly when retiring the
sitelinks searchbox.

**A five-minute, zero-risk check the owner can run today**: paste
`https://grabient.com/` and one seed URL into the Rich Results Test. Prediction
`[speculation]`: "No items detected" on both, because all three emitted types are
either unsupported or retired.

---

## 4. Image SEO

**Verdict: the channel is real but weak, and for abstract gradient renders it is
the weakest variant of a weak channel. The prerequisite is nearly free and worth
doing; everything past the prerequisite should be gated on measurement.**

### 4.1 The blocker, which is a one-line class of bug

`[documented]` From https://developers.google.com/search/docs/appearance/google-images
(updated **2026-03-02**):

> "Google can find images in `src` attribute of `<img>` element (even when it's a
> child of other elements, such as the `<picture>` element). **Google doesn't
> index CSS images.**"

Google's own "don't do this" example is literally
`<div style="background-image:url(puppy.jpg)">`.

`[verified here]` **Every gradient on grabient.com is a CSS background.**
`pages.ts:264` renders cards as
`<div class="card…" style="background:${esc(item.background)}" role="img" aria-label="Gradient palette: …">`, and `pages.ts:722` does the same for the
edit preview. A seed page contains **zero `<img>` elements**. `role="img"` +
`aria-label` buys accessibility, not indexing.

So grabient has **zero Google Images eligibility for its core content today**,
despite owning a complete PNG render pipeline (`/{seed}.png`,
`/palettes/{query}.png`) that is fully crawlable — robots.txt is open and the
`X-Robots-Tag: noindex` at `index.ts:164` applies only to `*.workers.dev`.

`[verified here]` The category does not do this either: coolors.co renders
palettes as CSS-styled divs with essentially no content `<img>` tags;
cssgradient.io does use `<img>` (including `/backgrounds/grabient.png`) but
**ships no alt text on any of them**. The bar is on the floor.

### 4.2 What Google documents as signals

`[documented]`, in Google's own words:

> "Google uses **alt text** along with **computer vision algorithms** and the
> **contents of the page** to understand the subject matter of the image."

> "Google extracts information about the subject matter of the image from the
> content of the page, including **captions and image titles**."

> "Wherever possible, make sure images are placed **near relevant text** and on
> pages that are relevant to the image subject matter."

Filename gives "very light clues" — `my-new-black-kitten.jpg` beats
`IMG00023.JPG` — and Google also uses **the URL path**. Alt-text ladder Google
publishes: missing → keyword-stuffed (called out as possible spam) →
`alt="puppy"` → best: `alt="Dalmatian puppy playing fetch"`.

Supported formats: BMP, GIF, JPEG, **PNG**, WebP, SVG, AVIF. `[consensus]`
**Format is not a ranking factor**; WebP/AVIF help only indirectly via speed.

`[documented]` **Lazy loading**: "Make sure your lazy-loading implementation
loads all relevant content whenever it is visible in the viewport… The methods
mentioned don't rely on user actions, such as scrolling or clicking, to load
content, which is important as **Google Search does not interact with your
page**." Native `loading="lazy"` and IntersectionObserver are approved.

⚠️ **Correction to a belief in circulation** (including in this repo's own
strategy work): the "Googlebot renders with a very tall viewport (~10k px)"
advice is **no longer in Google's documentation**. It survives only as
`[practitioner measurement, ~2018-2019]` — J.R. Oakes measured ~431×12,140
mobile / ~768×9,307 desktop. `SEO-STRATEGY.md` do-first #2 leans on it to argue
the homepage virtualizer is probably fine. **That reasoning rests on folklore
that happens to be true, not on guidance.** The GSC URL-inspection check it
prescribes is the right call precisely because the assumption is unsupported.

### 4.3 Image sitemaps — only two tags survive

`[documented]` https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps
(fetched 2026-08-17): **only `<image:image>` and `<image:loc>` remain.**
`<image:caption>`, `<image:geo_location>`, `<image:title>` and `<image:license>`
were removed from the documentation — announced **2022-05-06**, no effect on
indexing after **2022-08-06**. Namespace stays
`http://www.google.com/schemas/sitemap-image/1.1`; up to **1,000 `<image:image>`
per `<url>`**; `<image:loc>` may point at another domain if both are verified in
Search Console.

`SEO-STRATEGY.md` Phase 2.5 proposes exactly this, and it is correct — just note
that the "webgradients pattern" it cites will contain deprecated tags if copied
literally.

### 4.4 ImageObject — alive, but it is a badge, not a ranking signal

`[documented]` https://developers.google.com/search/docs/appearance/structured-data/image-license-metadata
(updated 2025-12-10), still in the gallery as of 2026-06-15. Produces the
**Licensable badge** in Google Images. Requires `contentUrl` plus at least one of
`creator` / `creditText` / `copyrightNotice` / `license`; add `acquireLicensePage`
for the badge. IPTC metadata embedded in the file is an accepted alternative to
JSON-LD.

> "Google does not guarantee that structured data or IPTC photo metadata will
> show up in search results."

**No ranking claim is made anywhere.** `[documented]` Erosion signal worth
noting: on the 2026 gallery, **"Image metadata" is the only remaining type
flagged as a Google Images feature** — the 2017 Product/Recipe/Video badges in
Images are gone. The rich-result surface inside Images has shrunk to one badge.

Honest fit for grabient: gradients genuinely *are* freely usable, so
`license` + `acquireLicensePage` is truthful markup and the badge is the only
visual differentiator available in an image grid. Expect nothing more.

### 4.5 Does Google Images traffic convert? The honest answer is "the data says no, and the data is old"

`[documented]` The measurement side is clean: GSC **search type = Image** is
separately reported and never blended with Web; a GSC image click means the user
actually navigated to your page ("Clicks to expand a thumbnail image are not
counted as clicks"). One useful quirk for a palette library: **"Search Console
doesn't distinguish between different images on the same page"** — one page
reports as one image regardless of how many you put on it, so grabient's
one-palette-per-page shape is the right one. Google Analytics does **not**
separate image search; it arrives as `google / organic`.

`[study, 2018, and now unrepeatable]` The universally quoted "Google Images is
~20-30% of all searches" comes from SparkToro/Jumpshot (2018-10-16, 10M+ US
devices) — and it was already **trending down** from ~30%. **Jumpshot was shut
down in January 2020 and no replacement measurement exists.** Every 2025-2026
post citing "22% of searches are image searches" is recycling a dead number.
SparkToro's 2024 and 2026 zero-click studies do not quantify Google Images at
all; the 2026 one never mentions it.

`[practitioner data with numbers, 2019-2020 — the only behavioral data that
exists]`:

- Glenn Gabe (2020-10-14): image-pack results in web search require **two
  clicks** to reach you and report under **Web**, poisoning web CTR. Measured
  CTRs: "rainbow" image pack **~0.01%** (≈3M impressions → ~430 clicks);
  "jaguar suv" image pack 0.2% vs **1.0% in the Images tab**. That 1.0% is the
  only image-tab CTR figure I could find anywhere — ~5× the image-pack path,
  still an order of magnitude below normal web CTR.
- AJ Kohn (2019-11-14, a handful of unnamed client sites): image traffic
  converted **0.17% vs 0.47%** site-wide and **0.24% vs 2.0%** vs web search;
  **1.37 pages/session vs 3.27**. On one site image search was 33.5% of GSC
  traffic but only 5.8% of directly tracked analytics traffic.

`[verified absence]` **No study published 2023-2026 measures image-search
referral volume, CTR at scale, or conversion.** If someone cites one, demand the
primary source.

⚠️ **Correction to the brief's premise**: the famous **63% decline** study is
from **2013** (Define Media Group, N=87 sites, measuring the January 2013
redesign that put the high-res image inside Google), **not** the 2018 "View
Image" removal. For 2018 the only quantified result is weak and single-vendor
(N=58 sites, avg +37% image clicks, no methodology published).

### 4.6 Three structural reasons this is worse for gradients specifically

1. `[documented]` **Google hotlinks and displays your full-size image in its own
   viewer by default.** The opt-out exists (return 200/204 to requests carrying a
   Google referrer, and Google shows a crawl-time thumbnail instead) — its
   existence confirms the default. **For a site whose product *is* the image,
   that is the entire product delivered without a visit.**
2. `[documented]` **Computer vision has nothing to recognize in a flat
   gradient.** Google's stated signals are alt text + computer vision + page
   contents + captions/titles + filename + URL path. Strip computer vision and
   the *page* ranks the image — so the image adds little independent discovery
   surface beyond what the page already earns.
3. `[documented]` **Google is actively reframing Images away from linking out.**
   The 25th-anniversary post (2026-07-14) describes Images as "a dynamic,
   immersive gallery… intelligently tailored to your unique interests" with
   in-app collections and **image generation inside Search via the Nano Banana
   model**. It contains no usage statistics and never mentions sending users to
   websites. `[reported 2026-04-07]` Sponsored full-image creatives launched in
   the mobile Images grid, auto-eligible for existing Search/PMax campaigns.
   `[speculation]` If Google can generate a gradient inline, "purple to orange
   gradient background" resolves without a click, permanently.

### 4.7 Synthetic images: labeled, invisible, and not a ranking factor

`[documented]` C2PA Content Credentials surface in **"About this image"** in
Google Images, Lens and Circle to Search (announced 2024-09-17); SynthID
verification expanded into Lens/AI Mode/Circle to Search **2026-05-19**, with
C2PA in Search/Chrome "in the coming months" (unconfirmed whether shipped).
`[reported]` The label is **not a visible badge in the results grid** — the user
must open "About this image."

`[documented — absence]` **Ranking impact: none stated anywhere.** The spam
policies (updated 2026-05-15) contain no image-spam policy and no mention of
AI-generated images. `[Google personnel, informal, ~2025-08-11]` Gary Illyes:
"AI generated image doesn't impact the SEO. Not direct." The one place IPTC
`DigitalSourceType: TrainedAlgorithmicMedia` is *mandatory* is **Merchant
Center/ecommerce**, not organic Images.

**The real risk vector is pages, not images**: generating pages purely to host
images is the documented scaled-content-abuse tripwire (§5.3).

`[speculation — patent only]` The single most consequential unknown: whether
100k programmatically-varied gradients read as 100k distinct images or one
near-duplicate cluster. US7801893B2 describes signature-based near-duplicate
clustering and collapsing clicks across near-duplicates, but patents are not
shipped systems and **Google documents nothing about current image dedup**. No
evidence either way. `[verified absence]` No case study exists of a
programmatically-generated image library earning image-search traffic.

---

## 5. The uniqueness threshold for programmatic pages

**The single most important framing point: grabient has two programmatic URL
spaces with completely different risk profiles, and `SEO-STRATEGY.md` reasons
about them together.** They should be separated.

- **The 867 `/{seed}` permalinks** are a finite, enumerable set of real product
  artifacts. This is an ordinary content-quality question.
- **`/palettes/{anything}`** is an **unbounded, attacker-writable URL space that
  returns an indexable 200 on garbage**. This is a different category of problem
  and it is the exposure.

### 5.1 What Google documents about non-indexing

`[documented]` The GSC page-indexing help doc
(https://support.google.com/webmasters/answer/7440203) is notable mostly for what
it *doesn't* say:

> **"Crawled - currently not indexed"**: "The page was crawled by Google but not
> indexed. It may or may not be indexed in the future; **no need to resubmit this
> URL for crawling.**"

> **"Discovered - currently not indexed"**: "The page was found by Google, but
> not crawled yet. Typically, Google wanted to crawl the URL but this was
> expected to overload the site."

Google offers **no documented remedy** for "Crawled - currently not indexed," and
attributes "Discovered" to *server overload*, not quality. Every article
promising a fix is doing so without Google's endorsement.

`[documented]` "How Search Works" (updated 2025-12-18): "Indexing isn't
guaranteed; not every page that Google processes will be indexed… Some common
indexing issues can include: The quality of the content on page is low."

`[Google personnel]` Gary Illyes, Search Central Live Deep Dive APAC, July 2025:
"If a page has been crawled but not indexed, **the remedy is to improve the
content quality**." Also "Canonicalisation is a bidding system," and thin main
content earns a "centerpiece annotation" marking the deficiency as central.
`[Google personnel]` John Mueller, reported 2026-07-17: "if our systems are
seriously worried about the quality of the website they will reduce the number of
pages at the index… it's not just the text… we almost have to take into account
the full experience on a page."

`[Google personnel, unflattering and worth quoting]` Mueller again:
"**Programmatic SEO is often a fancy banner for spam.**"

### 5.2 Crawl budget is not the constraint

`[documented]` Google's crawl-budget guide (updated 2026-07-22) scopes the topic
to sites with **1M+ pages** changing weekly, or **10,000+ pages** changing daily,
or sites with "a large portion of their total URLs classified… as Discovered -
currently not indexed."

**867 permalinks is two to three orders of magnitude below that.** Crawl budget
is a non-issue for the seed pages — *unless the unbounded `/palettes/*` route
manufactures one*, which is precisely the third bullet.

### 5.3 The two spam policies that actually bear on `/palettes/{anything}`

`[documented]` https://developers.google.com/search/docs/essentials/spam-policies
(page updated 2026-05-15).

**Scaled content abuse** — the important nuance is that this policy is about
*intent and value*, not automation:

> "Scaled content abuse is when many pages are generated **for the primary
> purpose of manipulating search rankings** and not helping users… creating large
> amounts of unoriginal content that provides little to no value to users,
> **no matter how it's created**."

The 2024 rewrite deliberately moved the test from *method* to *value*.
Templated-but-genuinely-useful sits outside this policy on its face — the 867
palette permalinks are real artifacts with real, distinct data. `[speculation]`
This is the defensible reading, but it is a judgment call a classifier makes, not
a rule with a bright line.

**Doorway abuse** — this is the one that names grabient's search route almost
verbatim:

> "Examples of doorway abuse include… **Creating substantially similar pages that
> are closer to search results than a clearly defined, browseable hierarchy.**"

`[documented]` And note what happened to the old rule: **Google's long-standing
"don't let us index your internal search results" guidance is no longer a
technical suggestion in Search Essentials — it was folded into the doorway abuse
spam policy.** That is a *harder* line, not a softer one.

`[documented]` Separately, the 2026-07-10 AI guide states that creating pages per
query variation — including per fan-out query — "violates Google's scaled content
abuse spam policy."

### 5.4 What Google says to do about infinite URL spaces

`[documented]`
https://developers.google.com/search/docs/crawling-indexing/crawling-managing-faceted-navigation
(updated 2025-12-18), in Google's own order of preference:

1. **robots.txt** — "Use robots.txt to disallow crawling of faceted navigation
   URLs" (the preferred fix)
2. **URL fragments** — Google generally doesn't crawl them
3. `rel=canonical` — weaker, "over time, decrease the crawl volume"
4. `rel="nofollow"` — brittle; every anchor must carry it

And, directly on point:

> "**Return an HTTP 404 status code when a filter combination doesn't return
> results.**"

`[documented]` **Google does not recommend `noindex` for faceted URLs in this
document.** That is worth flagging because `SEO-STRATEGY.md` Phase 2.6 proposes a
score-gated `noindex` for `/palettes/{anything}` — a defensible choice, but not
the one Google names.

`[documented]` A 200 with "nothing here" content is a **soft 404**; those "may be
crawled instead of pages with unique content" and keep consuming crawl budget.

### 5.5 The evidence on what gets indexed vs purged

The only body of work with stated N *and* method is **Indexing Insight** (Adam
Gent), built on customers' GSC URL Inspection API data. `[study, self-selected
sample, no control group]` — the sample skews toward sites that bought an
indexing-monitoring tool, i.e. sites that already suspected a problem.

| Study | Date | N | Finding |
|---|---|---|---|
| Why Pages are Not Indexed | 2025-04-21 | **1.7M pages / 18 sites** | "88% of not indexed pages were due to quality issues." Index coverage by vertical: news 97%, e-commerce <90%, **marketplace & listing sites >70%** |
| The 130-Day Indexing Rule | 2025-04-30 | **1.4M pages / 18 sites** | Not crawled in 130 days → 99% chance not indexed. Crawled in last 30 days → 97% chance indexed. After 151 days, zero indexed |
| Google Indexing Purge: May 2025 | 2025-07-16 | **2M monitored pages** | 25% actively removed from the index (per-site 15–75%). Purged pages characterized by **zero or low clicks/impressions**. **And: the removals had "zero impact on SEO performance"** |

Two readings matter here:

1. **The measured discriminator is per-page engagement, not per-page word
   count.** Pages with no clicks and no impressions are what gets purged.
2. **The 130-day rule is a diagnostic, not a lever.** It is correlational and
   close to tautological — Google recrawls what it values. `[speculation]` Do not
   invert the causality and conclude that forcing crawls causes indexing.
3. **Partial deindexation of a zero-traffic long tail cost those sites nothing.**
   That directly bears on how much engineering the 867 permalinks deserve.

`[study]` For base rates: Ahrefs' 14-billion-page study (2023-12-01) found
"**96.55% of all pages in our index get zero traffic from Google**, and 1.94% get
between one and ten monthly visits." A templated page earning nothing is the
normal case, not a failure state.

### 5.6 The pSEO case-study literature is not trustworthy

`[study]` Two reputable sources give irreconcilable numbers for the same
companies. Ahrefs (2023-10-31) puts Wise at **14,888 pages / 4.67M monthly
organic**; Backlinko (updated 2026-01-20) puts it at **8.5 million pages / 100M+
visits/month**. That is **570× on page count** and 21× on traffic. None of these
are first-party numbers — they are all third-party tool estimates.

The one defensible signal is the *internal* ratio inside a single self-consistent
dataset. Using Ahrefs' own Oct-2023 figures, estimated visits per page per month:

| Site | Visits/page/month | What each page carries |
|---|---|---|
| Wise | **313** | live FX rates, calculators, historical charts |
| Nomadlist | 1.59 | city data |
| Webflow | 0.88 | templates |
| **Zapier** | **0.38** | 800k app-pair pages — one visit per page per ~3 months |

An **~800× spread in per-page yield** that does not track page count — it tracks
**how much genuinely distinct, non-derivable data each page carries.** Zapier is
the cautionary tale hiding inside the canonical success story.

**Where grabient sits, measured** `[verified here]`: I diffed two seed pages
token-by-token. **45 tokens unique to page A, 50 unique to page B, 1,059
shared** — and the unique tokens are almost entirely the hex codes and the
coefficient numbers. Both pages render ~2,045 visible words, of which the
overwhelming majority is identical UI chrome. Query pages are worse: **2,202
visible words on `/palettes/pastel`, `/palettes/warm-sunset` *and*
`/palettes/asdkjhasd` alike** — a nonsense query and a real one produce
near-identical pages of the same length.

That is the honest measurement of grabient's uniqueness threshold today, and it
is exactly the shape that `SEO-STRATEGY.md` Phase 2.3 (tags as linked chips) and
the undeployed `palette-name.ts` work are designed to fix — per-palette names,
per-palette descriptions, per-palette tag chips. **Those changes are the single
highest-value indexation work available, and they are already written.**

### 5.7 Where the folklore is

`[no data found]` Three near-universal beliefs have **no quantitative study**
behind them that I could locate — not from Botify, OnCrawl, JetOctopus or Ahrefs:

- "Keep everything within 3 clicks of the homepage" → internal link depth vs
  indexation probability. **No study with stated N exists.**
- "Hub pages speed indexation."
- "Sitemap presence improves indexation rate."

All three are `[consensus]`. They are cheap and plausible; just do not budget
against them as if they were measured.

### 5.8 Free indexation levers that are real

`[documented]` **`lastmod`** — https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
(updated 2026-07-08): "Google uses the `<lastmod>` value **if it's consistently
and verifiably… accurate**," and "Google ignores `<priority>` and `<changefreq>`
values." Gary Illyes: "**It's binary: we either trust it or we don't.**"

Two direct consequences for this repo `[verified here]`:
- `seo.ts:117` emits `<priority>` on **every** URL in every sitemap. **Google
  ignores it.** Harmless, but it is dead bytes and it signals cargo-culting.
- The pending `lastmod` work must use the **real** created/modified date. Stamping
  today's date across 867 palettes burns the trust bit permanently, and per Illyes
  there is no partial credit.

`[documented]` **Indexing API** — https://developers.google.com/search/apis/indexing-api/v3/quickstart
(updated 2026-07-16): "can only be used to crawl pages with either `JobPosting`
or `BroadcastEvent` embedded in a `VideoObject`." **Still restricted. Not
available to grabient.**

`[documented]` **URL Inspection / Request indexing** — there is an unpublished
daily limit, and "submitting a request does not guarantee that the page will
appear in the Google Index." Google directs you to sitemaps for multiple pages.
Note this contradicts the popular "resubmit repeatedly" advice, which the page
indexing report explicitly discourages.

---

## 6. Being usable by AI coding and design agents

### 6.1 The finding that reframes the whole question

`[documented]` Anthropic, "Code execution with MCP" (2025-11-04): presenting
tools as code on a filesystem rather than loading all tool definitions upfront
took one workflow from **~150,000 tokens to ~2,000**. The stated thesis: "LLMs
are adept at writing code and developers should take advantage of this strength."

`[documented, qualitative]` Cloudflare, "Code Mode" (2025-09-26, updated
2026-07-15): "LLMs have seen a lot of code. They have not seen a lot of 'tool
calls.'" Their recommendation to API providers is directly on point — **expose
the full API rather than a dumbed-down schema, and expect agents to reach it via
generated code rather than a native tool interface.** (No benchmarks published;
treat the magnitude as marketing, the direction as sound.)

**Synthesis** `[speculation, well-supported]`: an agent with shell or code
access, handed a documented URL, will simply `curl` it. **grabient's JSON
endpoints are already the product; MCP is packaging, not a prerequisite.**

But the same evidence gives the hard constraint: `[study]` **agents do not go
looking.** Ahrefs' llms.txt study found zero AI bots probing for files that don't
exist. The URL has to *arrive in context* — pasted by the user, carried in a
`SKILL.md`, described in an MCP tool schema, or remembered from training.
Discovery is the bottleneck, not usability.

### 6.2 MCP — the spec moved in July 2026, and this repo is already current

`[documented]` The current revision is **`2026-07-28`**
(https://blog.modelcontextprotocol.io/posts/2026-07-28/). Lineage: 2024-11-05 →
2025-03-26 → 2025-06-18 → 2025-11-25 → 2026-07-28. It is a larger break than a
normal revision: **MCP went stateless.** The `initialize` handshake is retired,
`Mcp-Session-Id` is removed, the GET stream endpoint is gone, servers must send
`Mcp-Method`/`Mcp-Name` headers, and a new **`server/discover`** RPC is
mandatory.

`[verified here]` `apps/web/src/index.ts:1093-1100` already says exactly this —
"the protocol went stateless in the 2026-07-28 revision, so there is no session
to keep and no Durable Object to bind" — and `apps/web/package.json` pins
`@modelcontextprotocol/server: 2.0.0`. **The uncommitted MCP server is written
against the current spec and is a natural fit for a Worker.** It is 404 in
production.

`[documented]` **Authorization is OPTIONAL.** An unauthenticated MCP server is
fully spec-compliant and needs no `/.well-known/oauth-protected-resource` — that
file (RFC 9728) is required only by servers that *are* protected. Note for the
future path sketched in `mcp.ts`: **DCR (RFC 7591) is now deprecated** in favour
of Client ID Metadata Documents.

`[documented, by absence]` **There is no `/.well-known/mcp.json` in the spec.**
The only `.well-known` paths in the MCP ecosystem are `oauth-protected-resource`
(auth only) and `/.well-known/mcp-registry-auth` (registry publishing proof).
Domain-level MCP advertisement via well-known does not exist as a standard. Do
not build one.

### 6.3 The official MCP Registry — real, still preview, and consumed by aggregators not clients

`[documented]` `registry.modelcontextprotocol.io` is **still in preview** as of
2026-08-17; every doc page carries a breaking-changes/data-reset banner. The
architectural fact most people get backwards
(https://modelcontextprotocol.io/registry/about):

> "The MCP Registry is **not** intended to be directly consumed by host
> applications. Instead, host applications should consume other MCP registries,
> such as downstream marketplaces."

So it is a metadata feed for marketplaces, not something clients read. Anyone
claiming "AI clients read the official registry" has the topology inverted.

`[study, run during this research 2026-08-17]` A live census of the registry API:
- **≥40,100 servers** (hit the pagination cap; this is a floor)
- **17,718 (44%) carry a `remotes` entry** — remote servers are listable and are
  nearly half the corpus
- **~8 color/palette servers total**, none of them a searchable gradient-palette
  corpus. **The niche is genuinely open** — this corroborates
  `SEO-STRATEGY.md`'s claim, with a bigger denominator than the strategy used.
- **142 Figma-related entries**, including the official `com.figma.mcp/mcp`

Publishing a remote server needs one `server.json` with a `remotes` entry;
namespace verification is a DNS TXT record (`v=MCPv1; k=ed25519; p=<pubkey>`) or
the same string at `/.well-known/mcp-registry-auth`. **Gotcha: you cannot
unpublish**, and versions are immutable like npm.

`[consensus, no data]` Third-party directories (Glama ~37k, mcp.so ~20k, Smithery
7k+, PulseMCP): **no credible install-attribution data exists for any of them.**
Cheap and harmless to list; not a growth channel. Smithery is the only one with a
plausible install path since it actually hosts and runs servers.

### 6.4 Figma — the vision is achievable, but not the way it's phrased

`[documented]` **Figma is an MCP *server*, not an MCP *client*.** Figma's docs
state: "**Only clients listed in the Figma MCP Catalog can connect to the Figma
MCP Server**" (https://developers.figma.com/docs/figma-mcp-server/) — an
allowlist running the *other* direction. There is no mechanism for Figma Make,
Figma AI, or any Figma surface to connect to a third-party MCP server.

**So "people are using our app in their Figma AI agents" cannot happen as
stated.** What *can* happen, and is arguably better:

`[documented]` Figma's MCP server (remote endpoint `https://mcp.figma.com/mcp`)
now has **write** tools — `use_figma` (create/edit objects), `create_new_file`,
`upload_assets` (PNG/JPG/GIF/WebP ≤10MB), `get_variable_defs` (design tokens) —
and its supported client list is Claude Code, Claude Desktop, Cursor, Codex,
Copilot CLI, VS Code, Gemini CLI, Warp, Replit, Xcode and others.

**The realistic path: the user's coding agent holds both MCP servers at once.**
It calls `search_palettes` on grabient, then `use_figma` / `upload_assets` to put
the result on the canvas. Grabient never talks to Figma; **the agent is the
integration.** That reframing is important because it means grabient does not
need Figma's permission, does not need a Figma plugin first, and does not need to
be in any Figma catalog — it needs to be in the same conversation as the Figma
MCP server, which is a distribution problem (§6.6), not an integration problem.

`[documented]` **The Figma plugin path has one hard requirement that must never
be broken.** From
https://developers.figma.com/docs/plugins/making-network-requests/ (fetched
2026-08-17):

> "**Plugin iframes have a `null` origin. This means that they will only be able
> to call APIs with `Access-Control-Allow-Origin: *`**"

A `null` origin matches no allowlist and no origin echo. **`*` is the only value
that works.** The working tree's blanket `"*"` on `.png`/`.json`/`/api/png`/
`/api/og` is exactly right, and `index.ts:165` already documents the reason.
`[verified here]` **Production sends no ACAO header at all**, so today a Figma
plugin can display a grabient PNG in an `<img>` but cannot `fetch()` it or read
any JSON.

### 6.5 What to skip, with dates

`[documented]` **`/.well-known/ai-plugin.json` is dead.** ChatGPT plugins: new
conversations disabled 2024-03-19, full shutdown 2024-04-09. Nothing consumes it.

`[documented]` **OpenAI's plugin platform is now MCP-based** — the Apps SDK
(https://developers.openai.com/apps-sdk/) is "Build an MCP server for ChatGPT and
Codex." The current plugin doc tree **never mentions OpenAPI**. GPT Actions still
accept OpenAPI 3.x, but that is legacy surface.

**OpenAPI's live role is as build-time input** to MCP generators (FastMCP
`from_openapi()`, Speakeasy, Stainless). `[speculation]` Nobody's *runtime*
discovers an API from an OpenAPI URL. For a hand-written 5-tool server this is
moot — writing an OpenAPI doc for grabient would be documentation for humans, not
a discovery mechanism.

`[documented]` **A2A / AgentCard** reached **v1.0.0 on 2026-04-09** under Linux
Foundation governance with 150+ organizations and GA in Copilot Studio, Azure AI
Foundry and Bedrock AgentCore. It is **enterprise agent-to-agent orchestration** —
long-running tasks, opaque peer agents, cross-org trust. No coding agent looks
for `/.well-known/agent-card.json` to find a color API. **Wrong protocol.**

`[documented]` **Web Bot Auth** (Cloudflare HTTP Message Signatures, production
March 2026) is **inbound identity for sites that want to gate agents** — the
opposite of what grabient wants. Relevant only as a thing not to enable.

`[documented]` **IETF AIPREF** — working group active, `draft-ietf-aipref-vocab-06`
and `draft-ietf-aipref-attach-02` (2026-04-28). **Neither is an RFC.**
`Content-Usage` has no deployed consumers. Ignore for now.

`[study]` **x402 / pay-per-crawl** — x402 daily settlement volume is **down 93%
YTD in 2026**. Cloudflare's Monetization Gateway (waitlist 2026-07-01) extends
pay-per-crawl to APIs and MCP tool calls. **Free APIs need not care** — with one
operational caveat worth a calendar entry: `[documented]` from **2026-09-15**
Cloudflare blocks AI training/agent bots **by default** on ad-supported pages for
**new domains**. grabient.com is not a new domain, but the owner should confirm
no bot-management default starts 402/403-ing `/mcp` and `/*.json`.

### 6.6 `SKILL.md` — the most under-rated option, and it is nearly free

`[documented]` **Agent Skills** was published by Anthropic as an open standard at
https://agentskills.io on **2025-12-18** and is now stewarded through the Linux
Foundation's **Agentic AI Foundation** (formed December 2025 with OpenAI,
Anthropic and Block). Format: a folder with `SKILL.md` (YAML frontmatter,
minimum `name` + `description`, then instructions), optionally `scripts/`,
`references/`, `assets/`. Loading uses **progressive disclosure** — name and
description at startup, full body only when the description matches the task.

`[documented]` **It is not Claude-only.** The client showcase lists **~45
products** reading the same `SKILL.md` layout, including Cursor, GitHub Copilot /
VS Code, ChatGPT & Codex, Gemini CLI, JetBrains Junie, AWS Kiro, Block Goose,
OpenCode, OpenHands, Windsurf, Amp, Databricks and Mistral Vibe. **That is
broader real client support than the MCP registry has**, and it needs no
registry, no review and no auth.

This validates `SEO-STRATEGY.md` Phase 3.3 and argues for **promoting it ahead of
the registry work**, with one change of emphasis: the skill's job is to teach the
`curl` shape (`/{seed}.json`, `/{seed}.png`, `/api/search.json?query=`) and the
offline formula, because §6.1 says that is how agents will actually use it.

`[consensus]` **`AGENTS.md`** — donated by OpenAI to the Agentic AI Foundation,
read by 30+ agents. **It is a repo-local file for contributors. It does nothing
for external API discovery.** Not relevant to this goal.

---

## 7. Bing, IndexNow, and other engines as an AI channel

### 7.1 The one genuinely new, free measurement surface

`[documented]` **Bing Webmaster Tools shipped an "AI Performance" report on
2026-02-10** (https://blogs.bing.com/webmaster, post "AI Performance in Bing
Webmaster Tools"). It shows "when your site is cited in AI-generated answers
across Microsoft Copilot, AI-generated summaries in Bing, and select partner
integrations," identifying "which URLs are referenced and how citation activity
changes over time." Public preview, free.

**This is the only free, first-party measurement of AI citation that exists.**
Google Search Console offers nothing equivalent — AI features are folded into the
Web search type with no separate AI filter (§1.2). That fact alone justifies the Bing
Webmaster Tools signup already listed as do-first #8 in `SEO-STRATEGY.md`, and
upgrades its rationale from "ChatGPT rides Bing, probably" to "this is where the
AI-citation number comes from."

`[documented]` Bing also added support for the `data-nosnippet` attribute on
2025-10-15.

### 7.2 Does ChatGPT still ride Bing? Partly — and the plumbing changed

`[documented]` **Microsoft retired the Bing Search APIs for external customers
on 2025-08-11** (https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement).
Existing instances were decommissioned; the replacement offered to third parties
is **Grounding with Bing Search** inside Azure AI Agents, which returns
web-derived context to an agent rather than structured results to an application.

That retirement applies to *third-party customers*. It does not tell us what
OpenAI's own arrangement is. `[documented]` OpenAI's bots page
(https://developers.openai.com/api/docs/bots, fetched 2026-08-17) documents
`OAI-SearchBot`, `GPTBot`, `ChatGPT-User` and `OAI-AdsBot` and **says nothing
about Bing or about which index backs ChatGPT search.**

`[study]` The best available external evidence remains the Seer Interactive
analysis of 500+ ChatGPT Search citations finding **87% matched Bing's top
organic results**. `[consensus]` OpenAI's VP of Engineering confirmed Bing as a
primary source at ChatGPT Search's launch.

**Honest statement**: "get into Bing and ChatGPT will cite you" is *supported by
correlation, not by vendor documentation*, and OpenAI now runs its own crawler
(`OAI-SearchBot`) whose output is presumably blended in. Both conditions are
worth satisfying because both are free: be indexed in Bing, and do not block
`OAI-SearchBot`. `[verified here]` grabient does not block it.

### 7.3 IndexNow

`[documented]` Participating engines: **Bing, Yandex, Naver, Seznam, Yep and
Amazon** (https://www.indexnow.org/faq). **Google does not participate** — it
tested IndexNow from October 2021 and chose not to adopt it. Submissions
therefore have **zero effect on Google indexing**; Google's push channels remain
sitemaps, URL Inspection, and the narrow-scope Indexing API.

Protocol: up to 10,000 URLs per POST; a key file of 8–128 characters at the
site root; per-engine daily thresholds are not published; honor `Retry-After` on
429.

`[documented]` **Cloudflare Crawler Hints** (Caching → Configuration) submits to
IndexNow automatically and free — this is `SEO-STRATEGY.md` do-first #5 and
remains the cheapest way to get IndexNow for a Workers site: one checkbox, no
code, no key file to host.

`[speculation]` The AI angle on IndexNow is thin but not zero: faster Bing
indexation plausibly means faster ChatGPT/Copilot citation of new pages, given
§7.2. Nobody has measured it. Since it costs one checkbox, the weak evidence is
sufficient.

### 7.4 The 2026-08-31 Bing API retirement — confirmed, and it is not what it sounds like

`[documented]` **Confirmed at the primary source.** https://learn.microsoft.com/en-us/bingwebmaster/
(page updated 2026-08-07) carries the banner:

> "Legacy SOAP and POX APIs will be retired on August 31, 2026. Migrate to our
> REST APIs to avoid service disruption."

Details:
- **What retires**: the *Bing **Webmaster** Tools* API's legacy SOAP and POX
  request formats. This is **not** Microsoft Advertising's SOAP API, and **not**
  the Bing Search APIs (those died 2025-08-11 — §7.2).
- **Replacement**: the same Bing Webmaster API over **JSON/HTTP (REST)**. Every
  method already exists there; **API keys, quotas, rate limits and permissions
  are unchanged**.
- **Impact on grabient**: `[verified here]` **none.** The repo contains no Bing
  Webmaster API integration at all. This is a "confirm and move on" item — if the
  owner later automates URL submission, write it against the REST endpoints from
  the start.

`[documented]` The Bing Webmaster **URL Submission API** still exists and is
free. Keys are generated per *user* (not per site) at Bing Webmaster Tools →
Settings → API Access, one key per user, usable across all verified sites; OAuth
2.0 is the recommended alternative (https://learn.microsoft.com/en-us/bingwebmaster/getting-access).
For a site of grabient's size, IndexNow via Crawler Hints covers the same need
with no key management.

### 7.5 Other engines

`[consensus]` Free effort, ranked by plausible value:

1. **Bing Webmaster Tools** — worth it, for the AI Performance report alone (§7.1)
   plus the free backlink report. ~15 minutes, import from GSC.
2. **IndexNow via Cloudflare Crawler Hints** — one checkbox; covers Bing, Yandex,
   Naver, Seznam, Yep, Amazon.
3. **Yandex / Naver / Seznam webmaster consoles** — `[speculation]` negligible
   for an English-language design tool. Skip.
4. **Brave Search** — relevant because it backs Claude's web search
   (§2.4). `[speculation]` Brave has no meaningful webmaster inclusion program;
   its index is built by its own crawler. Nothing free to do beyond being
   crawlable, which grabient is.
5. **Common Crawl / CCBot** — inclusion feeds training corpora, not citation
   (§2.4). Already allowed. No action.

---

## 8. Claims in our own docs that the evidence does not support

Listed in severity order. All `[verified here]` unless noted.

### 8.1 llms.txt opens with a factual claim that is currently false

The working-tree `apps/web/public/llms.txt` line 9 reads:

> "Every URL in this document is live."

**It is not, and will not be until the pending work deploys.** Against production
on 2026-08-17: `/{seed}.json` **404**, `/api/search.json` **404**,
`sitemap-palettes.xml` / `sitemap-searches.xml` / `sitemap-pages.xml` **404**,
and no `Access-Control-Allow-Origin` header on `.png`. The file also claims

> "All PNG and JSON endpoints send `Access-Control-Allow-Origin: *` and answer
> `OPTIONS`"

which is true of `index.ts:173,192` in the working tree and **false of
production**. And:

> "Reads are rate limited to 300 requests per 10 seconds per IP… Verified
> crawlers are exempt."

There is **no rate-limiting code in the repo**; the only possible enforcement is
the Cloudflare rule described in `SEO-STRATEGY.md` do-first #3, which that
document lists as a *pending owner action* (item #4 is the only one marked
deployed). So llms.txt currently documents a rate limit that probably does not
exist, and asserts a verified-crawler exemption that the strategy doc itself
flags as unverified ("Verify the dashboard's 'Verified Bot' field emits
`cf.client.bot` (docs conflict)").

**Why this matters more than it looks**: llms.txt's entire value proposition is
being a trustworthy machine-readable contract. A file whose first assertion is
"every URL here is live" and whose URLs 404 is worse than no file — for the ~1%
of AI retrieval bots that ever read one (§2.2), and much more importantly for
the human developer or coding agent who is handed it and tries to use it.
**Deploy before publishing, or soften the claim.**

### 8.2 "llms.txt as insurance — its only real readers (GPTBot, Claude-Code) are exactly the target audience"

`SEO-STRATEGY.md` line ~242. The premise is now measurably wrong in an
interesting way. `[study]` Ahrefs: GPTBot accounts for 4.51% of requests to
llms.txt files, ClaudeBot 0.80%, and *retrieval* bots 1.1% — of the 3% of files
that get read at all. `[study]` Evil Martians: Claude Code is a heavy consumer of
**Markdown via `Accept:` content negotiation on URLs it already has**, and made
almost no llms.txt requests.

The strategic conclusion in SEO-STRATEGY (keep it, don't treat it as a channel)
is **correct**. The *reason* should be updated: it is not that the pipe is thin
but well-aimed; it is that **the pipe is thin and pointed somewhere else**. The
demand that actually exists is for clean machine-readable representations of
*content URLs* — which is `/{seed}.json` and the MCP server, both already
written.

### 8.3 The emitted structured data includes a feature Google retired in 2024

`[verified here]` Every page emits `WebSite` with
`potentialAction: SearchAction` — the sitelinks searchbox markup, retired
globally **2024-11-21**. Also emitted sitewide: `WebApplication` (no independent
Google feature) and, on seed pages, `CreativeWork` (not a supported type at all).

Not harmful — `[documented]` unsupported markup is not penalized — but the site
currently has **zero** structured data that can earn a Google rich result, while
`SEO-STRATEGY.md` treats structured data as a solved area. It is not solved; it
is inert.

### 8.4 "`/palettes/{slug}` is generative — color expansion = a sitemap list edit"

`SEO-STRATEGY.md` line ~80. True, and that is also the problem. `[verified here]`
`/palettes/buy-cheap-viagra` returns an indexable 200 with the phrase in the
`<title>` and `<h1>` and no robots meta. Any third party can mint an unlimited
number of grabient.com URLs whose visible title they choose, and get them
crawled by linking to them. Phase 2.6 ("score-gate `/palettes/{anything}`")
addresses the *thin-content* half of this; it does not currently frame the
**brand-safety and scaled-content-abuse** half, which is the more urgent one.
See §5.

### 8.5 The end-state vision, as phrased, is not achievable

`SEO-STRATEGY.md` and the brief both state the goal as "people are using our app
in **their Figma AI agents**." `[documented]` **Figma is an MCP server, not an MCP
client**, and its docs say "Only clients listed in the Figma MCP Catalog can
connect to the Figma MCP Server." No Figma surface can call a third-party MCP
server.

The reachable version of the same outcome is better and cheaper: **the user's
coding agent holds grabient's MCP server and Figma's at the same time**, calls
`search_palettes`, then `use_figma`/`upload_assets` to place the result on the
canvas (§6.4). Restating the goal this way changes the roadmap — it removes
Figma's permission from the critical path and makes the Figma Community plugin
(Phase 3.6) a *nice-to-have* rather than the gateway.

### 8.6 Three smaller divergences between the plan and the code

- **`SEO-STRATEGY.md` Phase 3.1 says to deploy MCP as "a separate worker
  (`mcp.grabient.com` or route-scoped)… don't couple an experimental surface to
  the production worker" (critic defect 8).** `[verified here]` The code mounts
  `/mcp` on the production worker (`index.ts:1097`), with a comment explaining
  why: the 2026-07-28 revision is stateless, so there is no session and no
  Durable Object. **The code's reasoning is sound and current** — but this is a
  deliberate reversal of a critic finding, and the strategy doc should record
  that it was overruled rather than leaving the two in silent conflict.
- **Phase 2.6 proposes a score-gated `noindex` for `/palettes/{anything}`.**
  `[documented]` Google's faceted-navigation guidance ranks **robots.txt first**
  and says to "return an HTTP 404 status code when a filter combination doesn't
  return results." It does **not** recommend `noindex`. `noindex` is defensible —
  it preserves link equity flow and keeps the pages usable — but the plan should
  acknowledge it is departing from Google's stated preference, and it does not
  solve the brand-safety half at all (a noindexed `/palettes/buy-cheap-viagra`
  still renders).
- **`seo.ts:117` emits `<priority>` on every sitemap URL.** `[documented]`
  "Google ignores `<priority>` and `<changefreq>` values." Harmless, but dead
  bytes.

### 8.7 Smaller corrections

- `SEO-STRATEGY.md` says "866 seed permalinks" in several places; `[verified
  here]` `/api/palettes` reports `"total":867`, matching llms.txt. Trivial, but
  the two documents should agree.
- `SEO-STRATEGY.md` Phase 5 says to "skip FAQPage markup as an AI play" on the
  strength of the Ahrefs controlled test. Correct conclusion, now with a simpler
  reason: `[documented]` **FAQ rich results stopped appearing entirely on
  2026-05-07** and the documentation was deleted 2026-06-15. There is no longer
  a decision to make.
- `SEO-STRATEGY.md` do-first #8 justifies Bing Webmaster Tools with "ChatGPT
  search rides Bing." `[study]` That is supported by correlation (Seer: 87% of
  ChatGPT citations matched Bing top organic) but **not by any vendor
  documentation**, and OpenAI now runs its own search crawler. The stronger,
  documented justification is the **AI Performance report** (§7.1).

---

## 9. What nobody knows

Stated plainly, because the rest of the report is only useful if these are held
separate from the things that *are* known:

- **Why one indexed, snippet-eligible page is cited in an AI Overview and
  another is not.** No Google statement, no study, no credible reverse
  engineering.
- **Whether structured data affects AI citation.** One controlled study, small
  negative point estimate, on already-heavily-cited pages. Nobody has tested
  whether schema helps an *uncited* page get discovered.
- **Whether content format (lists/tables/definitions) affects citation on
  Google.** The only rigorous format experiment ran on gpt-3.5-turbo and
  Perplexity and measured share-of-answer, not retrieval.
- **AI Mode CTR.** Zero published data, and GSC will not provide it.
- **Whether internal link depth affects indexation probability.** No study with a
  stated N exists. The "3 clicks from home" rule is folklore.
- **How Google Images handles near-duplicate synthetic images.** Patent only.
  This determines whether 867 gradient PNGs are 867 images or one cluster.
- **Whether Lens / Circle to Search traffic reports under the Image search
  type.** Practitioners assume so; Google has never confirmed it.
- **Any post-2020 measurement of Google Images referral value.** It genuinely
  does not exist.

## 10. Sources to distrust

`[verified during this research]` Two widely-circulated claims collapse on
inspection and will be encountered again:

- **"Princeton GEO-bench found llms.txt earns 23% more AI citations."**
  Fabricated. The cited paper (arXiv 2311.09735) predates llms.txt by ten
  months and never mentions it.
- **"A June 2026 W3C proposal to standardize llms.txt."** The real artifact is a
  strategy-repo issue opened 2025-04-27, still labeled "Investigation," no
  assignee.

`[verified during this research]` Two reputable SEO sources differ by **570× on
Wise's page count**. Every pSEO case-study number in circulation is a
third-party tool estimate, never first-party.

`[verified during this research]` The entire "how to fix Crawled - currently not
indexed" content genre — Ahrefs, Onely, SEOTesting, Vizup — contains **no
original data with a stated sample size**. So do the crawl-tool vendors' crawl-
budget claims (Botify's "Google misses about half the pages on large websites"
traces to a 2018 SlideShare with no N).

Discount on sight: listicle domains publishing "AI Overviews Statistics 2026:
60+ Data Points." They aggregate the primaries below with no original data,
frequently mis-attributed, and several read as LLM-generated. Cite the primaries
(Google docs, Ahrefs, seoClarity, Pew, Amsive, Indexing Insight, arXiv) instead.

---

## 11. Prioritized actions

Ordered by expected value, not by effort. **Confidence** is in the causal claim,
not in whether the change is easy.

### Tier 1 — do these first

| # | Action | Kind | Expected impact | Confidence |
|---|---|---|---|---|
| 1 | **Ship the uncommitted branch**: `/{seed}.json`, `/api/search.json`, `*` CORS, the sitemap index split, per-palette names/descriptions, and the new llms.txt — **together**. §0 shows llms.txt already documents all of it as live. | [code] | **High.** It is the prerequisite for §4, §6 and half of §5. Per-palette names/descriptions are the highest-value indexation work available (§5.6), and CORS is the single header separating "invisible to Figma plugins and sandboxed agents" from "usable" (§6.4) | **High** — Google documents thin/duplicate templated pages as the indexing failure mode, and Figma's `null`-origin CORS requirement is documented verbatim |
| 2 | **Fix `/palettes/{anything}`** — but frame it as **brand safety and doorway abuse**, not thin content. Today `/palettes/buy-cheap-viagra` is an indexable 200 with the phrase in the `<title>` and `<h1>`. Google's documented preference order is robots.txt → fragments → canonical, plus "return an HTTP 404 when a filter combination doesn't return results." | [code] | **High**, mostly as risk removal. The doorway-abuse policy names "substantially similar pages that are closer to search results than a clearly defined, browseable hierarchy" almost verbatim | **High** on the policy text; **Medium** on which remedy Google prefers for a *semantic* search route with no empty state |
| 3 | **Add one real `<img src="/{seed}.png?…" alt="…">` per seed page.** Google does not index CSS backgrounds, and every gradient on the site is a CSS background (§4.1). | [code] | **Medium.** Prerequisite for any image visibility at all, including Lens. Also adds genuine unique on-page content | **High** that it's a prerequisite; **Low** that image traffic is worth much once earned (§4.5) |
| 4 | **Sign up for Bing Webmaster Tools and open the AI Performance report** (shipped 2026-02-10, free, public preview). Import from GSC. | [dashboard] | **High for measurement.** It is the **only free first-party measurement of AI citation in existence** — GSC gives impressions only, with AIO and AI Mode combined | **High** — vendor-documented feature; **Medium** that Bing indexation drives ChatGPT citation (87% correlation, no vendor confirmation) |

### Tier 2 — cheap, do soon

| # | Action | Kind | Expected impact | Confidence |
|---|---|---|---|---|
| 5 | **Structured-data cleanup**: delete the `potentialAction`/`SearchAction` block (dead since 2024-11-21); keep `WebSite` for the site name only; add `Organization` + `logo` + `sameAs` on the homepage only; replace the seed-page `CreativeWork` with `ImageObject` (`contentUrl`, `license`, `acquireLicensePage`, `creditText`). | [code] | **Low-Medium.** Today the site emits **zero** structured data that can earn a Google rich result. `ImageObject` is the only gallery type that matches what grabient produces | **High** on what's dead; **Low** that the Licensable badge moves traffic |
| 6 | **Enable Cloudflare Crawler Hints** (Caching → Configuration) — free IndexNow to Bing/Yandex/Naver/Seznam/Yep/Amazon. Already `SEO-STRATEGY.md` do-first #5. | [dashboard] | **Low-Medium**, and zero for Google (which does not participate) | **High** it works; **Low** that faster Bing indexation converts to AI citations |
| 7 | **Check GSC for the Search generative AI performance report** (2026-06-03, impressions only, rolling out to a subset), and confirm the **Search generative AI control** is set to *include*. | [dashboard] | **Measurement only.** May not appear — it requires being in the rollout and having enough impressions | **High** — both documented |
| 8 | **Write a `SKILL.md`** teaching the `curl` shape (`/{seed}.json`, `/{seed}.png`, `/api/search.json?query=`) and the offline cosine formula. ~45 clients read the format, including every agent that also talks to Figma's MCP server. | [code] | **Medium.** Broader real client support than the MCP registry, no registry/review/auth needed, and §6.1 says code-shaped instructions are how agents actually consume APIs | **Medium** — client support is documented; nobody has measured whether skills drive usage |
| 9 | **Grep the Cloudflare logs for `meta-webindexer` separately from `meta-externalagent`.** The heavy traffic reported is the *training* crawler; the citation crawler is a different bot. | [owner-manual] | **Diagnostic.** If `meta-webindexer` is absent, Meta is training on the site without indexing it for citation | **High** — Meta documents the split verbatim |
| 10 | **Correct llms.txt before or with the deploy**: either ship everything it claims, or soften "Every URL in this document is live" and remove the rate-limit paragraph until the Cloudflare rule exists. | [code] | **Low traffic impact, high credibility impact.** Its only value is being a trustworthy contract | **High** — measured |

### Tier 3 — after Tier 1 ships

| # | Action | Kind | Expected impact | Confidence |
|---|---|---|---|---|
| 11 | **Publish the MCP server and register `com.grabient/*`** via DNS TXT (`v=MCPv1; k=ed25519; p=…`). Census on 2026-08-17: **≥40,100 servers, 44% with remote entries, ~8 color/palette servers, none a searchable gradient corpus.** | [code] + [dashboard] | **Medium.** The niche is genuinely open. But the registry feeds *aggregators*, not clients — it is a listing, not a distribution channel. **You cannot unpublish** | **High** the gap exists; **Low** that a listing produces users |
| 12 | **Image sitemap** — only `<image:image>` + `<image:loc>`; the other four tags were deprecated in 2022. Gate on step 3 producing Image impressions in GSC after ~90 days. | [code] | **Low.** Gate it on measurement rather than shipping on faith | **Medium** on mechanics; **Low** on value |
| 13 | **Fix `lastmod` correctness and drop `<priority>`.** Google ignores `<priority>` and `<changefreq>`; `lastmod` is binary trust ("we either trust it or we don't"). Stamping today's date across 867 palettes burns it permanently. | [code] | **Low**, but the downside of getting it wrong is permanent | **High** — documented + Illyes on record |
| 14 | **Submit to OpenAI's plugin/apps directory** once `/mcp` is live. Free, no-auth servers are explicitly acceptable; needs identity + domain verification, tool annotations, 5 positive / 3 negative test cases. | [owner-manual] | **Medium**, and it is the one directory with a documented review path into a first-party client | **Medium** — process documented, outcome unknown |

### Explicitly do not do

- **`FAQPage` or `HowTo` markup** — FAQ rich results stopped appearing
  **2026-05-07**, docs deleted 2026-06-15; HowTo dead since 2023-09-13.
  `SEO-STRATEGY.md` already reached this conclusion; the reason is now simply
  that the features do not exist.
- **`SoftwareApplication` for a rich result** — it needs a rating you are
  prohibited from self-supplying.
- **`/.well-known/ai-plugin.json`** (dead April 2024), **`/.well-known/mcp.json`**
  (does not exist in any spec), **A2A AgentCard** (enterprise orchestration,
  wrong problem), **OpenAPI as a runtime discovery surface**, **Web Bot Auth**
  (inbound gating — the opposite of the goal), **AIPREF `Content-Usage`** (no
  RFC, no consumers), **x402** (settlement volume down 93% YTD).
- **Any structured data added *for* AI Overviews** — Google says none is needed
  and the only controlled study found a small negative effect.
- **Generating pages to host images.** That is the documented
  scaled-content-abuse tripwire, and it is the one thing in this report that
  could actively hurt the domain.
- **Treating llms.txt as a channel.** 97% of published files are never
  requested; retrieval bots are 1.1% of an already-tiny slice; no crawler probes
  for it. `SEO-STRATEGY.md`'s conclusion was right for a reason that turns out to
  be wrong (§8.2).

### The reframe worth carrying forward

The owner's stated end-state — "people are using our app in their Figma AI
agents" — **is not reachable as phrased**: Figma is an MCP server, not a client,
and its catalog is an allowlist running the other direction. The reachable
version is **the user's coding agent holding grabient's MCP server and Figma's at
the same time**: `search_palettes` → `use_figma`/`upload_assets`. That is a
distribution problem (be in the conversation), not an integration problem (get
Figma's permission) — which makes it cheaper, and makes the Figma Community
plugin a nice-to-have rather than the gateway.

And the single most useful mechanical finding for that goal: `[documented]`
agents given code execution do not want tool schemas, they want **an API they
can `curl`** (Anthropic measured 150,000 → 2,000 tokens moving in this
direction). grabient's `/{seed}.json` + the offline formula in llms.txt is
already exactly that shape. **It is 404 in production.**
