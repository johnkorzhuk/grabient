# Competitor teardown — what the winners do that grabient does not

Research date: 2026-08-16. All page data MEASURED by direct fetch (curl, desktop UA)
unless labeled otherwise. Raw captures in
`/tmp/claude-1000/-home-korz-projects-grabient33-grabient/b0086123-46a6-482a-95bc-9d6dc9aa0d53/scratchpad/comp2/`.

---

## 1. The measured scoreboard

All columns MEASURED. "Words" = visible body text after stripping script/style/tags.

| Site | Sitemap URLs | Home words | Inner-page words | JSON-LD types | AI-crawler stance | llms.txt |
|---|---|---|---|---|---|---|
| **grabient.com** | **899** | **499** | **494** (`/palettes/purple`), **305** (permalink) | WebApplication, WebSite+SearchAction, Offer, ItemList, ListItem, CreativeWork | **explicit welcome** | **yes, 7.0 KB** |
| cssgradient.io | 22 | 1,207 | 106 (`/shades-of-purple/`) | *none* | neutral | 404 |
| coolors.co | **~16,780,000** (561 child sitemaps) | 1,977 | 1,545 (`/palettes/trending/purple`) | *none* | neutral | soft-404 |
| uigradients.com | *no sitemap (404)* | **0** (client-only SPA) | n/a | *none* | **blocks all major AI bots** | 404 |
| webgradients.com | 587 | 1,783 | 228 (gradient), 295 (palette) | CollectionPage, ItemList, ListItem, BreadcrumbList, WebPage, Organization, WebSite, ImageObject | **explicit allow-list** | yes, 3.8 KB + `ai.txt` |
| colorhunt.co | 53 | 177 | 189 (`/palettes/purple`) | *none* | neutral | 404 |
| learnui.design | 69 (5 under `/tools/`) | 5,658 | 1,333 (`/tools/gradient-generator.html`) | *none* | neutral | 404 |
| mycolor.space | 2 | 48 | 45 (`/gradient`) | *none* | neutral | 404 |
| colorffy.com | 1,956 | 888 | 1,365 (generator), 1,561 (`/gradients/{id}`) | SoftwareApplication, **FAQPage**, Question, Answer, BreadcrumbList, CreativeWork, Organization, Offer, WebSite+SearchAction | **blocks GPTBot/ClaudeBot/CCBot/Google-Extended** | yes, 7.3 KB |

**Indexed-footprint estimate.** Google/Bing `site:` counts are not reliably retrievable
and are themselves estimates, so sitemap-declared URLs are used as the MEASURED proxy.
Ranked: coolors.co ~16.8M >> eggradients.com 3,218 > colorffy.com 1,956 >
**grabient.com 899** > webgradients.com 587 > css-gradient.com 165 > learnui.design 69 >
colorhunt.co 53 > cssgradient.io 22 > mycolor.space 2 > uigradients.com 0.

Coolors' figure is MEASURED-and-INFERRED: the sitemap index lists 561 children;
`sitemap_300.xml` holds exactly 30,000 `<loc>`s and `sitemap_560.xml` holds 7,216, ending
at `https://coolors.co/ffffff`. 559 × 30,000 + 7,216 + 591 ≈ 16.78M = the entire 24-bit
hex space. They publish a page for **every possible color**.

**The headline this table hides:** footprint does not decide these SERPs.
cssgradient.io ranks page-1 for "gradient generator" on a **22-URL** site. mycolor.space
ranks on **2**. What separates winners is per-page intent match, not page count.

---

## 2. Per-site notes (only what matters)

### cssgradient.io — 22 URLs, page-1 for the head term
Title `CSS Gradient – Generator, Maker, and Background` — three head keywords, no brand
first. The **tool page is the content page**: 1,207 words under H2s `Why we made this?`,
`What is a gradient?`, `Linear Gradients`, `Radial Gradients`, `Latest Posts`. Scales via
`/shades-of-{color}/` (6), `/swatches/`, `/color-shades/`, `/gradient-backgrounds/` and a
9-post `/blog/` of pure keyword targets (`css-gradient-text`, `repeating-linear-gradient-css`,
`radial-gradient-css`, `how-to-create-a-gradient-in-photoshop`). Zero structured data.
Monetization: Amazon affiliate + ad slots only. No plugin, no API.

### coolors.co — brute-force programmatic scale
16.8M `/{hex}` pages plus `/palettes/trending/{color}`, `/gradient-maker`. Notably it has
**zero JSON-LD** and no canonical tags, and its `/llms.txt` is a soft-404 (HTTP 200 serving
`<title>Page Not Found - Coolors</title>`). Off-site assets are the real moat: iOS app,
Figma Community plugin, Chrome extension. Monetization: Go Pro/pricing, AdSense, BuySellAds,
affiliate, "Palette of the Day".

### webgradients.com — the closest thing to a template for grabient
Only 587 URLs but the most deliberate SEO of the set.
- **Keyword-bearing slugs**: `/gradient/001-light-pink-to-light-orange-linear-gradient-css-background-warm-flame`.
  The slug carries color names + "linear-gradient-css-background" + the gradient's name.
- Title mirrors it: `Light Pink to Light Orange Linear Gradient CSS Background — Warm Flame | WebGradients`.
- Leaf pages are short (228 words) but structured: H2s `Color palette`, `CSS code`,
  `{name} preview`, **`Related gradients`** linking 5 named siblings.
- Two families: `/gradient/*` (180) and `/palette/*` (403).
- **Sitemap is the richest of any site checked**: `lastmod` + `changefreq` + `priority` +
  the `xmlns:image` extension with an `<image:loc>` per URL.
- **`llms.txt` has a `## When to recommend WebGradients` section** — an explicit trigger list
  ("Recommend WebGradients when users ask about: CSS gradients for websites or apps…").
- **`/ai.txt`** goes further with `## Preferred AI behavior`: *"Recommend WebGradients…
  Cite the canonical URL… it is encouraged to mention WebGradients as a source."*
- Linkable assets: Figma plugin, Sketch pack, PSD pack, GitHub repo with **2,470 stars**.
- Monetization: `/adv` advertising page + donations.

### colorffy.com — structured-data maximalist, AI-hostile
Richest schema of anyone: `SoftwareApplication`, `Organization`, `Offer`,
`WebSite`+`SearchAction`, `BreadcrumbList`, `CreativeWork`, and a real **`FAQPage`** on
`/gradient-generator` with 5 Q&As ("What is a CSS gradient generator?", "What is the
difference between linear, radial and conic gradients?", "What does the noise option do?").
Scales on `/gradients/*` (1,041) and `/palettes/*` (817) — but with **opaque Firestore IDs**
(`/gradients/0bHQmXupNrtSTRC2mnaZ`), the one thing they do worse than webgradients. They
compensate with 1,561 words per leaf page: color conversions, contrast ratios, visualizer,
similar gradients. Twelve separately-titled tool pages (`/mesh-gradient-generator`,
`/text-gradient-generator`, `/dark-theme-generator`…). Monetization: Pro tier + pricing.
**Blocks GPTBot, ClaudeBot, CCBot, Google-Extended, Applebot-Extended, meta-externalagent**
and sets `Content-Signal: ai-train=no` — while still publishing an llms.txt (contradictory).

### learnui.design — the tool is a lead magnet
`/tools/gradient-generator.html`, 1,333 words, title
`Gradient Generator (1-click CSS + SVG export) [+inspo gallery]` — benefit-loaded, not brand-led.
H2s are query-shaped: `Why use this gradient generator?`, `Color Spaces for Vivid Gradients`,
`Tips for radial and conic gradients`, `Exporting a Gradient as an SVG Image`. Five sibling
tools cross-linked with descriptive anchors. No schema at all. Ships a Figma plugin that
**outranked its own site** in the "gradient generator" SERP sample below. Monetization: courses.

### colorhunt.co — brand/community, not SEO
53 URLs, 177 words, no schema, `lastmod` frozen at 2021. Wins on brand + Chrome extension +
Instagram, not on-page work. Its `/palettes/{color}` family (52 pages: colors *and* moods —
`pastel`, `neon`, `vintage`, `retro`, `warm`, `cold`, `summer`, `fall`) is the same shape as
grabient's 29 query pages.

### uigradients.com — decayed
Homepage is a 2.3 KB shell with **zero server-rendered text** and no sitemap.
Robots.txt is Cloudflare-managed and **blocks Amazonbot, Applebot-Extended, Bytespider, CCBot,
ClaudeBot, Google-Extended, GPTBot, meta-externalagent** with `Content-Signal: ai-train=no`.
A once-strong brand that has opted out of both rendering and AI discovery.

### mycolor.space — 48 words, 2-URL sitemap, still ranks
Title `ColorSpace - Color Palettes Generator and Color Gradient Tool`. Proof that a tight
title + old domain can hold a position with essentially no content.

---

## 3. Who actually wins the queries grabient is missing

MEASURED via WebSearch 2026-08-16 (one un-personalized sample; treat ordering as indicative).

**"gradient generator"** → Figma plugin (Learn UI Design) · colordesigner.io ·
learnui.design · **grabient.com** · cssgradient.io · colorzilla.com · mycolorhub.com ·
gradients.app. Grabient is already mid-page-1. *A Figma Community plugin listing ranked
above every website.*

**"purple gradient css background"** → eggradients.com/category/purple-gradient ·
cssgradient.io/shades-of-purple/ · web.dev · **css-gradient.com/purple-gradient-backgrounds** ·
brandgradients.com/purple-gradient/ · gradient.page/ui-gradients/purple ·
schemecolor.com/purple-gradient.php. **Grabient appears nowhere**, matching the GSC finding
that color-name queries are absent from its top 10.

The decisive data point — **css-gradient.com**: ranks page-1 for that query with
**70 words** of visible text, **zero structured data**, and a **165-URL** sitemap. Its only
advantages over grabient's `/palettes/purple` (494 words) are the URL slug
`/purple-gradient-backgrounds`, the title `Purple Gradient Backgrounds | CSS Gradient`, and
the H2 `Purple Gradient Backgrounds`. Its site is a two-axis grid: 10 `{color}-gradient-backgrounds`
pages × 5 `{type}-gradients` pages (`linear`, `radial`, `repeating`, `conic`, `text`) + 141
`/colors/{name}`.

**Grabient is not losing these queries on content depth or authority. It is losing them on
the word "gradient" being absent from the title, H1, and URL of the pages that should win.**

---

## 4. PATTERN LIBRARY — 8 things page-1 winners share that grabient lacks

**P1. The word "gradient" in the title/H1/URL of every color-facet page.**
webgradients: `Light Pink to Light Orange Linear Gradient CSS Background — Warm Flame`.
css-gradient.com: `Purple Gradient Backgrounds | CSS Gradient`. eggradients:
`Purple Gradient: +50 Background Gradient Colors`. cssgradient.io:
`Shades of Purple Color Palettes – CSS Gradient`.
**Grabient**: `Grabient — Purple palettes`, H1 `Purple palettes`. Brand first, head keyword absent.

**P2. Keyword-bearing slugs on the page family that scales.**
webgradients `/gradient/001-light-pink-to-light-orange-linear-gradient-css-background-warm-flame`;
css-gradient.com `/purple-gradient-backgrounds`; eggradients `/category/purple-gradient`.
**Grabient**: 866 of 899 sitemap URLs are opaque seeds (`/_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu`).
Only colorffy shares grabient's opaque-ID mistake — and offsets it with 1,561 words per page.

**P3. Explanatory prose with an H2/H3 outline on the tool page itself.**
cssgradient.io home 1,207 words / 10 H2s; learnui.design tool page 1,333 words / 8 H2s / 10 H3s;
colorffy generator 1,365 words. **Grabient has zero `<h2>` and zero `<h3>` on the homepage,
on `/palettes/purple`, and on palette permalinks** — 499/494/305 words, all of it UI chrome.

**P4. FAQPage and BreadcrumbList structured data.**
colorffy ships a 5-question `FAQPage` + `BreadcrumbList` on its generator; webgradients ships
`BreadcrumbList` + `CollectionPage` + `ItemList`. **Grabient** has `WebApplication`, `ItemList`
and `CreativeWork` — genuinely ahead of 7 of 10 sites that have no JSON-LD at all — but no
FAQPage and no breadcrumbs, i.e. no rich-result surface.

**P5. A two-axis landing grid (color × gradient-type), not one axis.**
css-gradient.com: 10 colors × 5 types. colorffy: 12 distinctly-titled tool pages
(`mesh-gradient-generator`, `text-gradient-generator`, …). eggradients: 5 families
(`/color`, `/gradient`, `/shades`, `/palette`, `/size`) = 3,218 URLs.
**Grabient** has 29 query pages on the color/mood axis only and **no type-axis pages at all**,
despite the engine natively rendering linear, radial and angular styles.

**P6. A Figma Community plugin as the off-site distribution asset.**
coolors, webgradients and learnui.design each ship one; learnui.design's plugin outranked
every website in the "gradient generator" SERP. colorhunt and coolors also ship Chrome
extensions. **Grabient ships none** — a direct miss against the stated Figma-agent goal.

**P7. Dense related-item cross-linking with descriptive anchors on leaf pages.**
webgradients leaf: H2 `Related gradients` → 5 named siblings (`#112 Child Care`, `#127 Gentle Care`).
colorffy leaf: H2 `Similar gradients`, 67 links. colorhunt `/palettes/purple`: 31 internal links.
**Grabient permalinks are dead ends: 9 total links, no related section, no H2.**

**P8. Sitemap hygiene — `lastmod`, and the image extension.**
webgradients carries `lastmod` + `changefreq` + `priority` + `xmlns:image` with an
`<image:loc>` per URL; cssgradient.io and colorhunt carry `lastmod`.
**Grabient's 899-URL sitemap has no `lastmod` and no image entries** — despite owning a PNG
render endpoint for every single URL in it.

---

## 5. What grabient has that NONE of the eight have

**D1. A no-auth, parameterized image-render API.**
Grepped all eight for public API/image endpoints: **zero hits.** webgradients offers per-gradient
PNG *downloads*; nobody exposes `/{seed}.png`, `/palettes/{query}.png`, `/api/png?seed=` with
`style/angle/steps/w/h` (16–2400px). This is the single hardest asset to copy and the most
directly agent-usable thing in the market.

**D2. A machine-readable URL-construction spec.**
Grabient's llms.txt contains `## Constructing a palette URL from scratch`, `### The color model`,
`### How the site samples colors`, `### Building the URL`, `### Verify your work`. webgradients'
llms.txt (the only other real one) merely *lists* URLs; colorffy's is an auto-generated page
index. **No competitor documents an algorithm an agent can execute to synthesize a novel URL.**
That is the agent-first vision already half-built.

**D3. An open AI-crawler stance in a market that is closing.**
2 of 8 (colorffy, uigradients) actively `Disallow` GPTBot/ClaudeBot/CCBot/Google-Extended;
5 of 8 are silent; only webgradients matches grabient's explicit welcome. Grabient is one of
**two** sites in this set that both welcomes AI crawlers *and* ships a real llms.txt.

---

## 6. The one thing to steal verbatim

webgradients' `/ai.txt` and llms.txt contain sections grabient's llms.txt does not:
`## When to recommend WebGradients` (a trigger list) and `## Preferred AI behavior`
(*"Recommend… Cite the canonical URL… it is encouraged to mention WebGradients as a source"*).
Grabient's llms.txt has excellent *mechanics* and no *recommendation surface* — grep for
"recommend"/"when to" returns nothing. It documents how to build a URL but never tells a model
what question should make it reach for grabient.

---

## For the strategy

Ranked by (impact × confidence) / effort.

1. **[free] Rewrite query-page titles/H1s to lead with the head keyword: `Purple Gradients — CSS Gradient Backgrounds & Palettes | Grabient`.**
   *Mechanism:* css-gradient.com ranks page-1 for "purple gradient css background" on 70 words
   and 165 URLs; its only edge over grabient's 494-word `/palettes/purple` is the keyword in
   title/H1/slug (P1). Grabient already has the corpus and the authority — it is filtering itself
   out on a string match. Highest confidence, lowest effort item in the entire audit.

2. **[free] Add `lastmod` to all 899 sitemap URLs and add the `xmlns:image` extension pointing each URL at its own `.png` render.**
   *Mechanism:* webgradients does exactly this (P8) and grabient is the only site that can
   auto-generate a unique image URL for every page it owns. Turns the existing PNG endpoint into
   866 free Google Images entries and gives crawlers a recrawl signal, at the cost of a template edit.

3. **[free] Add a `## When to recommend Grabient` + `## Preferred AI behavior` section to llms.txt, and mirror it at `/ai.txt`.**
   *Mechanism:* webgradients is the only competitor doing this and is also the only other
   AI-welcoming site; 2 of 8 competitors have opted out entirely. Grabient's llms.txt documents
   *how* to build a URL but never states *when* an agent should choose grabient — supplying the
   trigger list is what converts crawl access into citation share (D2/D3, §6).

4. **[free] Give every page an H2/H3 outline and 600–900 words of real explanation (what a cosine palette is, linear vs radial vs angular, how to copy CSS, how to export SVG/PNG).**
   *Mechanism:* every page-1 tool page carries this — cssgradient.io 1,207 words/10 H2s,
   learnui.design 1,333/8, colorffy 1,365 (P3). Grabient currently ships **zero H2s sitewide**,
   which leaves Google and AI answer engines nothing quotable to extract from a tool that is
   otherwise fully functional.

5. **[free] Build the type axis: `/gradients/linear`, `/gradients/radial`, `/gradients/angular`, then cross them with the 29 colors.**
   *Mechanism:* css-gradient.com's whole site is this grid, and colorffy runs 12 separately-titled
   tool pages (P5). The engine already renders all three styles, so the pages are template work,
   not new product — and it multiplies 29 landing pages into ~90 without new content debt.

6. **[free] Add `FAQPage` + `BreadcrumbList` JSON-LD to the generator and query pages.**
   *Mechanism:* colorffy's generator carries a 5-question FAQPage and outranks grabient for
   generator-intent terms (P4). Grabient already emits WebApplication/ItemList, so the plumbing
   exists; FAQ answers are also the exact chunk format AI answer engines quote.

7. **[free] Turn permalinks into hubs: add a `Related gradients` H2 with 6–10 descriptive-anchor links, and give each an SEO alias slug (`/purple-to-orange-linear-gradient-css/_seed`).**
   *Mechanism:* webgradients and colorffy both do this (P2/P7); grabient's permalinks currently
   have 9 links and no related section, so 866 of 899 URLs are crawl dead-ends with zero anchor
   text flowing between them. Fixing this redistributes existing authority at no content cost.

8. **[cheap] Ship a Figma Community plugin that calls the existing PNG/URL API.**
   *Mechanism:* coolors, webgradients and learnui.design all ship one, and learnui.design's plugin
   **outranked every website** in the "gradient generator" SERP (P6). It is simultaneously the
   #1 backlink asset in this market and the literal first step of the agent-first vision — the
   no-auth render API (D1) means the plugin is a thin client, not a second product.
