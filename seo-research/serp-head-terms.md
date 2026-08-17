# SERP recon: the head terms grabient already earns impressions for

Date: 2026-08-16 · Scope: the 10 queries from GSC's top-clicks list · Budget used: 14 searches, 7 page fetches

---

## Method and its limits (read this before trusting a rank number)

**MEASURED** — I ran each query through `WebSearch`, recorded the result set in order,
then fetched the most instructive competitor pages for title/heading/word-count facts.

**Caveat, stated plainly:** `WebSearch` is *not* Google. It **cannot** show AI Overviews,
People Also Ask, image packs, ads, or personalization. So the **set of competitors** per
query is reliable, but the **exact ordinal position** is directional only. For SERP
features I use published research, cited and labeled REPORTED — I do not guess.

**Independent cross-check — CTR-implied position (INFERRED).** GSC clicks ÷ impressions
gives observed CTR, which maps to an approximate Google position via the standard
position-CTR curve. Where both methods agree, confidence is high.

| Query | GSC clicks/impr | Observed CTR | CTR-implied Google pos (INFERRED) | WebSearch pos (MEASURED) | Agree? |
|---|---|---|---|---|---|
| gradient maker | 32/400 | 8.0% | ~4–5 | 4 | yes |
| gradient generator | 27/376 | 7.2% | ~5 | 4 | yes |
| grabient | 20/26 | 76.9% | 1–2 | 2 | yes |
| gradient | 13/514 | 2.5% | ~9–12 | absent (top 7) | yes |
| gradient creator | 6/61 | 9.8% | ~4 | 2 | close |
| gradient color generator | 4/30 | 13.3% | ~3–4 | 3 | yes |
| css gradient | 2/215 | 0.9% | ~15–20 | absent | yes |
| gradient background generator | 2/56 | 3.6% | ~8–10 | absent (top 10) | yes |
| gradient tool | 2/26 | 7.7% | ~5 | absent | conflict* |
| gradient picker | 2/23 | 8.7% | ~4–5 | absent | conflict* |

\* Both are tiny-volume queries (23–26 impressions over ~2 days). At that sample a
single click swings implied CTR by 4pp, so the implied position is noise. Treat
"gradient tool" and "gradient picker" as unmeasured.

**Net:** the two methods agree on 8 of 10. Grabient is genuinely a **page-1,
position-3-to-5 site** on the generator/maker/creator cluster, and genuinely
**absent or deep** on `css gradient`, `gradient background generator`, and bare
`gradient`.

---

## The single most important finding: one page wins the whole cluster

**MEASURED.** `https://cssgradient.io/` — a single root URL — appeared in **9 of the
10 SERPs I ran**, including a bonus long-tail query:

| Query | cssgradient.io position |
|---|---|
| gradient maker | 5 |
| gradient generator | 5 |
| gradient creator | 6 |
| gradient color generator | 8 |
| css gradient | 4 |
| gradient background generator | 5 |
| gradient picker | 3 |
| gradient (bare) | 2 |
| free online gradient generator css copy code | 5 |

Its title says exactly why: **"CSS Gradient – Generator, Maker, and Background"** — four
head terms concatenated into one title on one URL.

Second confirmation, from a *small* site rather than a brand:
`colordesigner.io/gradient-generator` appeared in **5 of 10** (positions 1, 1, 2, 4, 6)
on a page with only ~320 words of prose (MEASURED via fetch).

**Answer to the brief's question — one page or several?**
**One page.** "gradient maker", "gradient generator", "gradient creator", "gradient
color generator" and "gradient picker" are effectively **the same SERP** — the same
6–8 domains reshuffle across them. Building separate `/gradient-maker`,
`/gradient-creator` pages would cannibalize, not expand. The exception is
`gradient background generator` and `css gradient`, which have measurably different
result sets (see below).

---

## SERP map, per query

Positions are `WebSearch` ordinals (MEASURED). Page type is my classification (INFERRED
from fetched content or from the result title).

### 1. "gradient maker" — 32 clicks/400 impr (grabient's biggest click source)
1 miro.com/tools/gradient-generator/ · *Color Gradient Generator | CSS-Tailwind-SVG Gradient Maker* · tool (SaaS brand)
2 coolors.co/gradient-maker · *Create a Gradient - Coolors* · tool
3 coolors.co/gradient-palette · *Create a Gradient palette - Coolors* · tool
4 **grabient.com/** · *Grabient — Gradient Generator & Color Palettes* · tool
5 cssgradient.io/ · *CSS Gradient – Generator, Maker, and Background* · tool + content hub
6 colordesigner.io/gradient-generator · *Gradient Generator | Color Designer* · tool hub
7 figma.com/gradient-generator/ · *Free Gradient Generator — Create Custom Gradients | Figma* · tool (SaaS brand)
8 meshgradient.com/ · *Mesh | Create beautiful mesh gradients* · tool

Coolors takes **two** of the top 3 with sibling URLs — a domain-authority effect, not a
page-quality one.

### 2. "gradient generator" — 27 clicks/376 impr
1 figma.com/community/plugin/… · *Gradient Generator · Learn UI Design | Figma* · plugin listing
2 colordesigner.io/gradient-generator · tool hub
3 learnui.design/tools/gradient-generator.html · *Gradient Generator (1-click CSS + SVG export) [+inspo gallery]* · tool, 1,200–1,400 words
4 **grabient.com/** · tool
5 cssgradient.io/ · tool + content hub
6 colorzilla.com/gradient-editor/ · *Ultimate CSS Gradient Generator - ColorZilla.com*
7 mycolorhub.com/ · *AI Gradient Generator | My Color Hub*
8 gradients.app/en

### 3. "gradient creator" — 6 clicks/61 impr
1 miro · 2 **grabient.com/** · 3 coolors.co/gradient-maker · 4 colordesigner.io ·
5 figma.com/gradient-generator/ · 6 cssgradient.io/ · 7 meshgradient.com · 8 gradients.app ·
9 apps.apple.com (GradientCreator iOS)

**No page in this SERP has "creator" in its title.** Google is treating *creator* as a
pure synonym of *maker/generator*. Grabient at #2 here with zero exact-match text
confirms the cluster is semantic, not lexical.

### 4. "gradient color generator" — 4 clicks/30 impr
1 colordesigner.io/gradient-generator · 2 miro · 3 **grabient.com/** ·
4 mycolor.space/gradient (*ColorSpace - CSS Gradient Color Generator*) · 5 colorzilla ·
6 figma · 7 mycolorhub · 8 cssgradient.io · 9 gradients.app

Grabient's best relative showing. Highest observed CTR of the non-brand terms (13.3%).

### 5. "css gradient" — 2 clicks/215 impr · **grabient absent**
1 gradientmagic.com (gallery) · 2 **MDN `linear-gradient()`** · 3 **W3Schools CSS gradients** ·
4 cssgradient.io/ · 5 mycolor.space/gradient · 6 colorzilla.com/gradient-editor/ ·
7 **MDN `<gradient>` type**

**Mixed intent.** Three of the top 7 are reference documentation. Grabient has no
documentation-shaped asset, which is why 215 impressions convert at 0.9%. Not the same
SERP as the generator cluster.

### 6. "gradient background generator" — 2 clicks/56 impr · **grabient absent from top 10**
1 fffuel.co/ffflux/ · 2 mdigi.tools/gradient-generator/ · 3 creative-tim (Tailwind) ·
4 magicpattern.design/tools/mesh-gradients · 5 cssgradient.io/ · 6 neat.firecms.co ·
7 mycolor.space/gradient · 8 noiseandgradient.com · 9 coolors.co/gradient-maker

**Distinct SERP.** Winners are *image-output* tools (SVG fluid, mesh, animated 3D, noise
texture), not CSS-code tools. Intent is "give me a background asset", not "a code snippet".

### 7. "gradient tool" — 2 clicks/26 impr · **grabient absent**
1–4 are **software docs**: Adobe Photoshop gradient tool, paint.net, Adobe gradient fill,
Clip Studio. Then 5 learnui.design · 6 magier.com listicle · 7 gifgit.com.

**Wrong intent entirely** — "gradient tool" means *the Photoshop tool named Gradient*.
26 impressions is the whole opportunity. **Do not chase this.**

### 8. "gradient picker" — 2 clicks/23 impr · **grabient absent**
1 colordesigner.io/gradient-generator · 2 colorspicker.net · 3 cssgradient.io ·
4 coolors.co/gradient-maker · 5 gradients.app · 6 medium.com (keyword-stuffed post) · 7 github.com

Low volume, weak field. Winnable but worth little alone — it comes free with the cluster page.

### 9. "gradient" (bare) — 13 clicks/514 impr · **grabient absent from top 7**
1 Wikipedia (disambiguation) · **2 cssgradient.io/** · 3 Wolfram MathWorld ·
4 Wikipedia gradient-domain · 5 Merriam-Webster · 6 Khan Academy · 7 Wikipedia color gradient

**Dominated by the math/dictionary meaning.** cssgradient.io at #2 is the *only*
design-tool result, earned through raw topical authority on the exact-match token. The
largest impression pool in the set (514/day) but mostly the wrong intent; realistic
ceiling is one design-tool slot, already occupied.

### 10. "grabient" (brand) — 20 clicks/26 impr, 77% CTR
1 uiuxjobsboard.com/resources/gradient-tools/grabient · **third-party directory**
2 **grabient.com/**
3 producthunt.com/products/grabient
4 dribbble.com/tags/grabient
5 awwwards.com/inspiration/grabient-gradient-generator
6 evernote.design/post/grabient/
7 github.com/johnkorzhuk/grabient
8–10 Wikipedia noise (Grabit, Graber, Grab surname)

**A directory page outranks the brand's own homepage on its own brand name** (MEASURED).
77% CTR means users still find it, but the brand SERP is diluted, there are no
sitelinks visible, and positions 3–7 are all stale third-party profiles. The 2017-era
Product Hunt / Awwwards / Dribbble footprint is real link equity that mostly points at
old content.

---

## Title-pattern analysis: what winners do that grabient does not

**MEASURED** (titles as returned in SERPs; H1s and word counts from direct fetches).

| Domain / URL | Title | Head term at start? | Brand position | H1 | Prose words |
|---|---|---|---|---|---|
| cssgradient.io/ | CSS Gradient – Generator, Maker, and Background | **yes** | none in title | "CSS Gradient" | ~1,200–1,400 |
| colordesigner.io/gradient-generator | Gradient Generator \| Color Designer | **yes** | last | "Gradient Generator" | ~320 |
| miro.com/tools/gradient-generator/ | Color Gradient Generator \| CSS-Tailwind-SVG Gradient Maker | **yes** | none in title | "Gradient Generator" | ~800–900 |
| learnui.design/tools/gradient-generator.html | Gradient Generator (1-click CSS + SVG export) [+inspo gallery] | **yes** | none | "Gradient Generator – CSS & SVG Export" | ~1,200–1,400 |
| figma.com/gradient-generator/ | Free Gradient Generator — Create Custom Gradients \| Figma | **yes** (+"Free") | last | — | — |
| colorzilla.com/gradient-editor/ | Ultimate CSS Gradient Generator - ColorZilla.com | near-start | last | — | — |
| coolors.co/gradient-maker | Create a Gradient - Coolors | no | last | "Gradient Maker" | minimal |
| **grabient.com/** | **Grabient — Gradient Generator & Color Palettes** | **no — brand first** | **first** | **"Popular palettes"** | **~50–75** |

Three concrete divergences, all MEASURED:

1. **Brand-first title.** Every top-3 finisher except Coolors (which has domain
   authority to spare) leads with the head term. Grabient spends its first 9
   characters on a brand nobody searches except 26 times a day.
2. **H1 does not match the query.** Grabient's H1 is literally `Popular palettes`
   (MEASURED, `<h1 id="list-h1">`). Not one competitor's H1 omits the head term.
   There are **zero `<h2>` elements** on the homepage.
3. **~50–75 words of prose vs 320–1,400.** Note carefully: colordesigner.io ranks #1
   and #2 on only ~320 words. So the winning variable is **not** word count — it is
   *having the head term in title + H1 + a hub of internally-linked sibling pages*.
   colordesigner.io links to 12 sibling color tools; cssgradient.io links to
   `/shades-of-blue/`, `/shades-of-red/`, `/gradient-backgrounds/`, `/swatches/` and a
   blog cluster.

Grabient's schema is actually fine — it ships `WebSite` + `WebApplication` JSON-LD
with a `SearchAction` (MEASURED). No `FAQPage`. Miro ships a 5-question FAQ.

---

## SERP features

I **cannot** observe AI Overviews, PAA, or image packs with the available tooling — I
am not guessing. Published research, REPORTED:

- **AI Overviews barely touch this query family.** Semrush's study of 600k+ US desktop
  keywords (Nov 2025–Apr 2026) found AI Overviews on *commercial*-intent SERPs grew
  71% over six months while **transactional**-intent SERPs **fell 5%**.
  <https://www.semrush.com/blog/ai-overviews-commercial-search-study/>
  Corroborating: transactional/navigational queries sit "below 20%" AIO presence, with
  one estimate of 4.9% for transactional overall.
  <https://serps.io/blog/ai-overview-prevalence-by-industry>
  **INFERRED:** "gradient maker/generator/creator" are transactional ("take me to the
  tool"), so classic blue-link ranking still carries almost all the value here. This is
  a *safe* place to invest — unlike informational SEO, it is not being eaten.

- **`css gradient` and bare `gradient` are the AIO-exposed ones.** Those two skew
  informational (MDN, W3Schools, Wikipedia, Wolfram in the top 7 — MEASURED), and
  informational is where AIO presence is highest. **INFERRED:** effort spent chasing
  `css gradient` (215 impr/day, 0.9% CTR) has the worst risk-adjusted return of the ten.

- **Image packs are growing and grabient is invisible in them.** Image Pack appearances
  within the top 10 rose **48.5%** from 2024 to 2026, and when triggered the pack sits
  at position 1 **>40%** of the time.
  <https://www.seoclarity.net/blog/how-to-rank-in-google-image-pack-serp-feature>
  **MEASURED corroboration:** the "purple gradient" SERP I ran returned Vecteezy,
  Unsplash, Pinterest, Adobe Stock and Freepik in the top 10 — an unmistakable visual-intent
  signal. Grabient has an unbranded PNG render API (`/{seed}.png`, `/palettes/{q}.png`)
  and **866 palette permalinks**, i.e. a large native image corpus that is currently
  earning nothing because those PNGs are not embedded as indexable `<img>` with alt
  text on crawlable pages.

- **PAA proxy.** Miro's on-page FAQ is almost certainly reverse-engineered from PAA
  (MEASURED from fetch): *What is a gradient generator? · What is the difference between
  Linear, Radial, and Conic gradients? · How do I use color stops in this tool? · Can I
  use these gradients directly in my web development projects? · Does the tool include
  starting templates?* Grabient answers none of these in text.

---

## The color-name gap (not in the brief, but it is the biggest one)

**MEASURED.** The brief notes color-name queries are absent from GSC's top 10. I ran
"purple gradient" to find out why. The top 10:

`colorkit.co/gradients/purple/` · `vecteezy.com/free-vector/purple-gradient` ·
`schemecolor.com/purple-gradient.php` · `pinterest.com` ·
**`cssgradient.io/shades-of-purple/`** · `unsplash.com/s/photos/purple-gradient` ·
`icolorpalette.com/gradients/purple-gradients/` ·
`css-gradient.com/purple-gradient-backgrounds` · `magnific.com` · `stock.adobe.com`

Grabient's competing page is `grabient.com/palettes/purple`, titled
**"Grabient — Purple palettes"** (MEASURED via curl). Compare:

- Every ranking competitor has the word **gradient** in the URL *and* the title.
- Grabient's URL says `/palettes/` and its title says "palettes" — **the word "gradient"
  appears nowhere on the page that is supposed to win "purple gradient"**.
- Grabient's meta description *does* say "CSS gradient", so the intent exists; the
  title and URL just don't express it.

This is a pure vocabulary mismatch across **29 query pages + 866 permalinks** — the
largest single body of content on the site, currently pointed at a word users don't
search. Also note `cssgradient.io/shades-of-purple/` ranking here: it is the *same*
hub strategy paying off a second time.

---

## Per-query verdicts

| Query | Top-3 winnable? | What separates top-3 from grabient | Single highest-leverage change |
|---|---|---|---|
| gradient maker | **Yes** | Coolors/Miro have domain authority; grabient has no "maker" text anywhere | Put "Maker" in the title |
| gradient generator | **Yes** | Exact-match H1; 320–1,400 words; sibling-tool hub | Change H1 from "Popular palettes" to "Gradient Generator" |
| gradient creator | **Yes — closest** | Nothing lexical; already #2 | Ship the title/H1 fix, coast to #1 |
| gradient color generator | **Yes** | colordesigner's tool-hub internal linking | Same cluster page |
| gradient picker | Yes, low value | Weak field | Comes free with cluster page |
| css gradient | **No** (top-3), maybe top-8 | Half the SERP is MDN/W3Schools docs | Only worth a docs-shaped page later |
| gradient background generator | **No** without new output | Winners produce *images* (mesh/SVG/noise), not CSS | Would need a PNG/SVG background page — grabient already has the render API |
| gradient tool | **No — wrong intent** | Photoshop/Paint.NET docs own it | Ignore |
| gradient (bare) | **No** | Wikipedia/Wolfram/Merriam-Webster | Ignore |
| grabient (brand) | **Yes — should be #1** | A directory page outranks the homepage | Fix brand SERP (below) |

---

## For the strategy

Ranked by (impact x confidence) / effort. Every item is a code change in this repo or a
free action.

1. **[free] Rewrite the homepage title to lead with the head terms, brand last:**
   `Gradient Generator & Maker — Create CSS Gradients | Grabient`.
   *Mechanism:* all four measured top-3 finishers lead with the head term and put brand
   last or omit it; grabient spends its title's most-weighted position on a 26-impression
   brand word, and carries **no** "maker" token at all despite "gradient maker" being its
   single biggest click source (32/day).

2. **[free] Change the homepage `<h1>` from "Popular palettes" to "Gradient Generator"
   and add `<h2>`s** (the page currently has zero H2s — MEASURED).
   *Mechanism:* every competitor's H1 contains the head term; grabient's H1 currently
   targets a word ("palettes") that appears in none of the ten queries. This is the
   cheapest title/H1 alignment available and it is a one-line change in `src/pages.ts`.

3. **[free] Rename the query-page pattern to say "gradient":** title
   `Purple Gradients — CSS Gradient Palettes | Grabient`, and add `/gradients/{query}`
   as the canonical path (301 `/palettes/{q}` → it, or serve both and canonicalize).
   *Mechanism:* all 5 non-stock winners for "purple gradient" carry "gradient" in URL and
   title; grabient's 29 query pages + 866 permalinks — its largest content asset —
   currently express the word "palettes" instead, which nobody searches.

4. **[free] Build one cluster page, not several.** cssgradient.io ranks in 9/10 of these
   SERPs from a single URL; colordesigner.io in 5/10 from one URL with only ~320 words.
   Add ~400–600 words below the tool covering *maker / creator / picker / linear vs radial
   vs conic / color stops*, plus a `FAQPage` JSON-LD using Miro's five questions.
   *Mechanism:* "maker", "generator", "creator", "color generator" and "picker" are one
   SERP with the same 6–8 domains reshuffling — separate pages would cannibalize; a single
   page carrying all the synonyms is the measured winning shape.

5. **[free] Turn the 866 palette permalinks into image-pack inventory:** embed the existing
   unbranded PNG endpoints as real `<img>` with descriptive alt text ("purple to indigo CSS
   gradient"), add `width`/`height`, and add an image sitemap.
   *Mechanism:* image packs are up 48.5% since 2024 and sit at position 1 over 40% of the
   time when triggered ([seoClarity](https://www.seoclarity.net/blog/how-to-rank-in-google-image-pack-serp-feature)),
   and the measured "purple gradient" SERP is half stock-photo sites — grabient already
   generates exactly this asset type and currently exposes none of it to image search.

6. **[free] Fix the brand SERP:** a third-party directory (`uiuxjobsboard.com`) outranks
   grabient.com for "grabient". Add `Organization` JSON-LD with `sameAs` pointing at the
   Product Hunt / Awwwards / GitHub / Dribbble profiles, and refresh those profiles to
   point at current URLs.
   *Mechanism:* `sameAs` consolidates entity signals onto the official domain and is the
   standard lever for sitelinks; the 2017-era third-party footprint is real link equity
   currently aimed at stale pages.

7. **[cheap] Add `lastmod` to sitemap.xml and split it** (tool page / query pages /
   permalinks). Currently 899 URLs with **no** `lastmod` (MEASURED).
   *Mechanism:* with 866 near-identical permalinks and no freshness signal, crawl budget
   spreads evenly across low-value URLs; `lastmod` plus segmentation lets the query pages —
   the ones that can actually rank — get recrawled after the title rewrite lands.

8. **[free] Deprioritize `css gradient`, `gradient tool`, and bare `gradient` entirely.**
   *Mechanism:* measured SERPs show MDN/W3Schools own `css gradient`, Adobe/Paint.NET docs
   own `gradient tool` (it means the Photoshop tool), and Wikipedia/Wolfram own `gradient`
   (it means the calculus operator). These are also the three most AI-Overview-exposed of
   the ten, since AIO presence is highest on informational intent and **falling** on
   transactional ([Semrush](https://www.semrush.com/blog/ai-overviews-commercial-search-study/)) —
   so the generator cluster is both more winnable and more durable.

---

## Sources

- <https://cssgradient.io/> · <https://coolors.co/gradient-maker> · <https://miro.com/tools/gradient-generator/>
- <https://colordesigner.io/gradient-generator> · <https://www.learnui.design/tools/gradient-generator.html>
- <https://grabient.com/> · <https://grabient.com/sitemap.xml> · <https://grabient.com/palettes/purple>
- <https://www.semrush.com/blog/ai-overviews-commercial-search-study/>
- <https://serps.io/blog/ai-overview-prevalence-by-industry>
- <https://www.seoclarity.net/blog/how-to-rank-in-google-image-pack-serp-feature>
