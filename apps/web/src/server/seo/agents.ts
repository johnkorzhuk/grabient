import { EFFECT_KINDS, EFFECT_WORDS, EFFECTS } from "@grabient/engine/effect.ts";
import { KIT_KINDS } from "@grabient/engine/kit/kinds.ts";
import { kitEffect } from "@grabient/engine/kit/registry.ts";
import { LIMITS, type LimitName } from "@grabient/server/limits/config.ts";
import { DEFAULT_FRAME, RISING_FRAMES, type RisingFrame } from "../../lib/orders.ts";
import { DEFAULT_SEED } from "../../lib/page-meta.ts";

/* What agents and programs read: the guide at /llms.txt in the llmstxt.org form (a title, a summary, then sections
   of links), the whole reference at /llms-full.txt, the MCP server's card, and the catalog at
   /.well-known/ai-catalog.json that leads to the card. The tools, protocol versions and the server's own words are the
   MCP server's, handed in, so the files never name a tool it lacks. */

/** What the files say of the MCP server. */
export interface Mcp {
  /** where it answers: /mcp */
  path: string;
  /** the protocol versions it speaks, the newest first */
  versions: readonly string[];
  /** the address of the skill it serves */
  skill: string;
  /** an ordinary account's tools, in the order it lists them */
  tools: readonly { name: string; description: string }[];
  /** who it says it is: name, title, version, description, website and icons */
  info: (origin: string) => Record<string, unknown>;
  /** its name in the MCP Registry, which its card carries too */
  registryName: string;
}

/** The card's address: the server's own, and /server-card. */
export const cardPath = (mcp: Pick<Mcp, "path">) => `${mcp.path}/server-card`;
/** A limit's number as the site counts to it. */
const allowed = (name: LimitName) => LIMITS[name].requests.toLocaleString("en-US");

/** Words in a list, the last after `last`: "a, b or c". */
const listed = (words: readonly string[], last = "or"): string =>
  words.length > 1
    ? `${words.slice(0, -1).join(", ")} ${last} ${words[words.length - 1]}`
    : words.join("");
/** Every effect's style as an address names it (effect.ts's EFFECTS): "style=glass, blob, ... or strata", in code. */
const EFFECT_STYLES = listed(EFFECTS.map((kind, i) => (i ? `\`${kind}\`` : `\`style=${kind}\``)));
/** The field effects (engine/kit) by the words a title names them by ("the zen garden", "zen garden's"), with their
    styles, with what each shows (kit/types.ts FieldAbout), all of them and any one: named as the effects beside them
    are, never by the kit's own word for them, which a reader is never told */
const kitThe = (kind: (typeof KIT_KINDS)[number]) => `the ${EFFECT_WORDS[kind]}`;
const KIT_STYLES = listed(KIT_KINDS.map((kind, i) => (i ? `\`${kind}\`` : `\`style=${kind}\``)));
const KIT_NAMED = listed(KIT_KINDS.map(kind => `${kitThe(kind)} (\`style=${kind}\`)`));
const KIT_SHOWN = listed(
  KIT_KINDS.map(kind => `${kitThe(kind)} (\`style=${kind}\`, ${kitEffect(kind).about.shows})`)
);
const KIT_WORDED = listed(KIT_KINDS.map(kind => `${EFFECT_WORDS[kind]} (\`style=${kind}\`)`));
const KIT_OWN = listed(KIT_KINDS.map(kind => `${EFFECT_WORDS[kind]}'s`));
const KIT_ALL = listed(KIT_KINDS.map(kitThe), "and");
const KIT_ANY = listed(KIT_KINDS.map(kitThe));
/** The effects that take steps of their own (effect.ts's EFFECT_KINDS `steps`: the sandstone), each with its range, as
    a sentence; none where none does. */
const STEPPED = EFFECTS.filter(kind => EFFECT_KINDS[kind].steps);
const STEPS_SAID = STEPPED.length
  ? ` ${listed(
      STEPPED.map(kind => {
        const range = EFFECT_KINDS[kind].steps!;
        return `the ${EFFECT_WORDS[kind]} also takes \`steps\` (${range.least} to ${range.most}, ${range.designed} as designed), how many of its bands a sweep of the palette spans`;
      }),
      "and"
    ).replace(/^t/, "T")}.`
  : "";
/** The same effects' steps as a list's or a document's fields name them: "the sandstone's `steps`". */
const STEPS_NAMED = listed(
  STEPPED.map(kind => `the ${EFFECT_WORDS[kind]}'s \`steps\``),
  "and"
);

function guide(base: string, mcp: Mcp): string {
  // the guide shows its patterns with the palette of the site's own card
  const seed = DEFAULT_SEED;
  return `# Grabient

> Grabient is a free CSS gradient generator and color palette library at ${base}. A palette is 2 to 8 OKLCH keyframes held in a short seed, and the seed is the palette's address. An agent can search palettes by words, colors or a seed, read any palette as JSON, Markdown, CSS, SVG, PNG or a swatch file design apps import, and give a person a permanent link that opens in the editor, with no key and no sign-in. The MCP server makes, changes and saves palettes for a person signed in with a free Grabient account.

The data, Markdown and image routes are plain GET requests with CORS enabled. In the patterns below, replace \`{seed}\`, \`{slug}\` and \`{query}\`. A seed looks like \`${seed}\`. A collection's address is a slug such as \`ocean-gradients\`, and the collections list returns the real ones.

## When to use Grabient

- A person asks for a gradient, a color palette or a background: a hero section, a card, a chart ramp, a wallpaper, social art.
- A person names a color, a mood, a season or a subject instead of exact colors: warm sunset, muted earth tones, pastel, ocean. Search answers these, and collections group palettes by subject.
- A person has brand colors as hex codes. Search finds the palettes nearest them, and the MCP server makes a palette from them.
- A person wants a palette changed: lighter, darker, calmer, more vivid, warmer, cooler, reversed, or with fewer or more colors. The MCP server makes each change as a new seed with its own permanent address.
- You need the same colors every time. A seed always renders the same palette, and no model takes part in the colors.
- You need an image of a gradient at a size you choose, without a headless browser.

Grabient's colors are for screens: it has no print inks, paint or thread, and takes no colors from an image. To read many palettes use the JSON routes, not the HTML pages.

## Read one palette

- [Palette as JSON](${base}/${seed}.json): seed, keyframes, hex colors, each color's name and the contrast of text on it, CSS in hex and OKLCH, and links to its page, files and card; at an effect's address (${EFFECT_STYLES}) it adds the effect, as the Markdown does. Pattern: \`${base}/{seed}.json\`
- [Palette as Markdown](${base}/${seed}.md): the same facts as text, with the collections that hold it; at an effect's address it says how the effect plays and gives the tags that play it in the CSS's place. Pattern: \`${base}/{seed}.md\`
- [Palette as PNG](${base}/${seed}.png): the gradient alone, no logo, 1200 by 630 unless asked. Takes \`w\` and \`h\`, or \`size\` (\`1200x630\`), up to 2,400 pixels a side and 3 million pixels in all; a larger size comes smaller at the same shape. Pattern: \`${base}/{seed}.png\`
- [Palette as SVG](${base}/${seed}.svg): the gradient as a vector, 800 by 400 unless asked. Takes \`w\` and \`h\`, or \`size\`, 40 to 6000 a side. Pattern: \`${base}/{seed}.svg\`
- [Palette as an animated SVG](${base}/${seed}.svg?style=bands): bands that bloom from the center out and loop, moved by CSS alone, so it plays as an image or a CSS background. 400 by 500 unless asked; takes \`w\` and \`h\` or \`size\`, \`bands\`, \`duration\`, \`dir\` and \`reverse\`. \`style=glass\`, \`blob\`, \`silk\` or \`rosette\` moves the palette's fluted glass, blob, silk or rosette the same way, \`style=papercut\` is its papercut's first frame with soft shadows at any speed, \`style=strings\` its strings' first frame, ${KIT_STYLES} its ${KIT_OWN} first frame at any speed, and its PNG is the effect's first frame. Pattern: \`${base}/{seed}.svg?style=bands\`
- [Palette as CSS](${base}/${seed}.css): CSS that works as it is: linked or pasted into a page, it fills the page with the palette. \`w\` and \`h\` set the page's size, and \`style=bands\` plays the animated SVG, carried inside the CSS. Pattern: \`${base}/{seed}.css\`
- [Palette as a moving background](${base}/examples/background): any page's background playing the palette as fluted glass (\`style=glass\`), a blob (\`style=blob\`), silk (\`style=silk\`), a rosette (\`style=rosette\`), papercut (\`style=papercut\`), strings (\`style=strings\`), ${KIT_NAMED}, from two tags in its head: \`<link rel="stylesheet" href="${base}/{seed}.css?style=glass">\` paints the first frame in the page's first paint, and \`<script src="${base}/{seed}.js?style=glass" async></script>\` plays it from that frame with WebGL. Give both the same query. \`soft\` and \`grain\` (1 to 100) in it blur the effect over the palette's gradient (the blob takes none: its frost softens it) and lay film grain over it, in the first paint and as it plays. The page's own background stays off, or on \`html\` only, and its own CSS leaves \`html::before\` to the stylesheet, and \`html::after\` and \`body::before\` too where the query has \`soft\` or \`grain\`. With the stylesheet's rules in the page's own CSS instead of linked, the page waits on no other site to paint; the editor's Copy HTML gives the tags so, the glass's first frame as WebP. The stylesheet draws the glass's first frame as an SVG filter, light to send, which Firefox takes about a second of the page's thread to draw, in three passes; the WebP paints at once in every browser. Without the stylesheet the script paints the first frame itself as it starts. A page plays one effect. Pattern: \`${base}/{seed}.js?style=glass\`
- [Palette as ASE](${base}/${seed}.ase): Adobe Swatch Exchange, the view's colors, for Photoshop, Illustrator, InDesign, Procreate and Affinity. Pattern: \`${base}/{seed}.ase\`
- [Palette as GPL](${base}/${seed}.gpl): a GIMP palette of the view's colors, for GIMP, Inkscape, Krita and Aseprite. Pattern: \`${base}/{seed}.gpl\`
- [Palette as GRD](${base}/${seed}.grd): the view's gradient as a Photoshop gradient. Pattern: \`${base}/{seed}.grd\`
- [Palette as design tokens](${base}/${seed}.tokens.json): the view's colors as DTCG design tokens, which Figma imports as variables. Pattern: \`${base}/{seed}.tokens.json\`
- [Palette social card](${base}/api/og?seed=${seed}): 1200 by 630 with the Grabient wordmark. Pattern: \`${base}/api/og?seed={seed}\`
- [Palette in the editor](${base}/${seed}): the page to give a person. With no style in its address it plays the effect the reader last chose, the fluted glass for a new reader; with a gradient's style (\`style=linearGradient\`) it shows that gradient, and at an effect's address (${EFFECT_STYLES}) it plays that effect, its code pane holding the effect's tags, stylesheet, colors, settings, SVG and Markdown, as its files serve them. Pattern: \`${base}/{seed}\`

Every palette route takes \`style\`, \`steps\` and \`angle\`, and \`soft\` and \`grain\` (1 to 100 each): a blur along the picture's line and film grain over it, on every style and effect, the blob taking no soft.

## Find palettes

- [Search as JSON](${base}/api/search.json?query=sunset&limit=24): words, color codes (hex, rgb(), hsl(), oklch() or any form CSS writes a color in) or a seed. Pattern: \`${base}/api/search.json?query={query}&limit=24\`
- [Search page](${base}/palettes?q=sunset): the same search for a person. Pattern: \`${base}/palettes?q={query}\`
- [Search as one image](${base}/palettes/sunset.png): its sheet, the first eight palettes its page shows as rows with their hex codes. Pattern: \`${base}/palettes/{query}.png\`, or \`.svg\` for the same sheet as SVG
- [The home page as JSON](${base}/api/hot?page=1): the Hot feed, palettes and collections in one, by what was liked lately and what is new
- [The gallery as JSON](${base}/api/palettes?sort=popular&page=1&limit=24): the most liked first, or \`sort\` rising or newest

A list's page for a person (the home page, \`/palettes\`, a search, \`/collections\`, a collection's page) draws every card in the view its address names, \`style\`, \`steps\` and \`angle\`, or plays an effect on every card, each in its palette's own shape: ${EFFECT_STYLES}, with \`speed\`, \`fps\`, \`angle\` (all but the blob)${STEPPED.length ? `, ${STEPS_NAMED}` : ""}, the blob's \`frost\` and the blob's and the strings' \`bg\`. Pattern: \`${base}/palettes?q={query}&style=glass\`

## Collections

- [Collections as JSON](${base}/api/collections?sort=popular&page=1&limit=24): public collections with their titles, descriptions, tags and first palettes. Add \`q={query}\` to search them.
- [Collections page](${base}/collections): the same list for a person
- One collection as JSON: \`${base}/api/collections/{slug}\`, each palette with the title and description its collection gives it, where it gives any
- One collection as Markdown: \`${base}/{slug}.md\`
- One collection as ASE, a group to each palette: \`${base}/{slug}.ase\`
- One collection as GPL: \`${base}/{slug}.gpl\`
- One collection as GRD, a gradient to each palette: \`${base}/{slug}.grd\`
- One collection as design tokens, a group to each palette: \`${base}/{slug}.tokens.json\`
- One collection as an image, the nine palettes its page shows first: \`${base}/api/png/collection?slug={slug}\`, and \`${base}/api/og/collection?slug={slug}\` for the card with the wordmark
- One collection as a sheet, eight of its palettes as rows with their hex codes, its first and the seven that best show the rest of its colors, the picture its page shows under its cards: \`${base}/{slug}.png\`, or \`${base}/{slug}.svg\` as SVG
- One collection as CSS, a class to each palette in its order: \`${base}/{slug}.css\`
- One collection as JSON at its address, each palette as its own JSON writes it: \`${base}/{slug}.json\`
- One collection's page: \`${base}/{slug}\`

## Tools for agents

- [MCP server](${base}${mcp.path}): Streamable HTTP, JSON-RPC over POST, for a free Grabient account: the app signs the person in once through OAuth 2.1 when it is added. Tools: ${mcp.tools.map(tool => tool.name).join(", ")}. [How to connect](${base}/mcp-server).
- [MCP server card](${base}${cardPath(mcp)}): the server's name, address and protocol versions as JSON
- [Agent catalog](${base}/.well-known/ai-catalog.json): the AI Catalog entry that leads to the card

## Optional

- [Full reference](${base}/llms-full.txt): the palette model, what the routes take and return, the tools, limits and redirects
- [About Grabient](${base}/about): how the palettes are made
- [Sitemap](${base}/sitemap.xml): pages, searches, collections and palettes
`;
}

function reference(base: string, mcp: Mcp, frames: readonly RisingFrame[]): string {
  const [newest, ...handshake] = mcp.versions;
  const others = frames.filter(frame => frame !== DEFAULT_FRAME).map(frame => `\`/${frame}\``);
  return `${guide(base, mcp)}
## The palette model

Seeds start with k and encode 2 to 8 OKLCH keyframes. Each keyframe is {l,c,h}: lightness 0 to 1, chroma 0 to 0.35, and hue in degrees. Hue is unwrapped: 210 then 570 describes a full clockwise turn. Adjacent keyframes may differ by at most 540 degrees. A Catmull-Rom spline joins the keyframes, lightness is clamped, and chroma is reduced at constant lightness and hue until the color fits sRGB.

The seed is the palette. Style, steps, angle and size choose how it is drawn and are never part of its identity. The default style is linearGradient, with 7 steps at 90 degrees. Steps run from 3 to 100, and never fewer than the palette has keyframes. The six styles are linearGradient, linearSwatches, radialGradient, radialSwatches, angularGradient and angularSwatches. Gradient styles interpolate the sampled stops. Swatch styles draw equal hard bands. Size is \`WxH\` in pixels; either side may be \`auto\`, which follows the other at the file's default shape. Soft (1 to 100) blurs the picture along its style's line: a gradient's stops become the blurred curve's, as more stops in its family's gradient, so every format draws it alike; on an effect it is a blur of the effect over the palette's linear gradient, its sigma 0.06 of the picture's longer side at 100, and the blob takes none. Grain (1 to 100) lays one 128-pixel tile of black and white specks over the picture, a speck a pixel, at plain alpha; files carry the tile in themselves (CSS and SVG as a data URI, the SVG as a use of one image per tile, which design tools import one to one).

A seed comes from an answer or a link: one typed or changed by hand is another palette, or none. To make a palette, a connected app calls the MCP tool compose_palette with hex colors, and a person opens the editor. Making one saves nothing.

## Routes in detail

Unknown query parameters are ignored.

| Route | Returns |
| --- | --- |
| \`/{seed}.json\` | {model, seed, kseed, name, spec, style, steps, angle, soft and grain where the view has them, classes, kinds, harmony, colors, names, contrast:{text,ratios,ends}, p3, css:{hex,oklch}, url, links}. \`name\` and \`names\` are what most people call the palette and each color. At an effect's address it adds effect:{style, ${STEPPED.length ? `${STEPPED.map(kind => `the ${EFFECT_WORDS[kind]}'s`).join(", ")} steps, ` : ""}angle, speed, fps, shape, the blob's frost and bg, the strings' bg where their address names one, colors, html, links:{page, css, js, svg, png, og}}, \`colors\` the colors the effect draws and \`html\` the two tags that play it; the fields beside it stay the palette's in its default view |
| \`/{seed}.png\` | PNG without a logo, 1200 by 630 by default. \`w\` and \`h\`, which come first, or \`size=WxH\`; up to 2,400 a side and 3,024,000 pixels, a larger size drawn smaller at its shape |
| \`/{seed}.svg\` | SVG, 800 by 400 by default. \`w\` and \`h\`, which come first, or \`size=WxH\`; 40 to 6000 a side |
| \`/{seed}.svg?style=bands\` | Animated SVG, 400 by 500 by default: bands that bloom from the center out and loop, moved by CSS alone. \`bands\` 3 to 41, odd (19); \`duration\` 0.5 to 60 seconds a loop (4.4); \`dir=in\` gathers the bloom to the center; \`reverse=1\` or \`0\` turns the palette, which otherwise puts its darker end in the dim parts; \`w\` and \`h\` or \`size\` as the SVG's |
| \`/{seed}.css\` | CSS that works as it is: linked or pasted into a page, it fills the page with the palette, with a Display-P3 version where a P3 screen shows more. Colors in OKLCH, or with \`colors=hex\`, \`rgb\` or \`hsl\`. \`w\` and \`h\`, or \`size=WxH\`, set the page's size; \`style=bands\` plays the animated SVG, carried inside the CSS, with its \`bands\`, \`duration\`, \`dir\` and \`reverse\` |
| \`/{seed}.svg?style=glass\` | The fluted glass (\`style=glass\`), the blob (\`style=blob\`), the silk (\`style=silk\`, its colors dyed into satin that drapes in swaying folds), the rosette (\`style=rosette\`, petals on a golden spiral, its rings of color rippling out from the heart), the papercut (\`style=papercut\`, its colors cut into sheets of paper stacked into a relief, each casting a soft shadow on the one below), the strings (\`style=strings\`, threads in its colors, evenly spaced on a dark ground or the one \`bg\` names, stirred into bundles, hairpins and loops), ${KIT_SHOWN}, as a moving SVG, moved by CSS alone (the silk by SMIL; the papercut holds its first frame with its shadows blurred at any speed, which a design app such as Figma imports as layers, the strings hold their first frame, each thread a stroked path, and ${KIT_ALL} hold theirs, each level a filled path): 800 by 400 by default, 500 by 500 for the blob, \`w\` and \`h\` or \`size\` as the SVG's; \`speed\` (0 its first frame) and the effect's look as the stylesheet below takes them. \`/{seed}.png?style=glass\` is its first frame |
| \`/{seed}.css?style=glass\` | A page's background: the palette's fluted glass (\`style=glass\`), blob (\`style=blob\`), silk (\`style=silk\`), rosette (\`style=rosette\`), papercut (\`style=papercut\`), strings (\`style=strings\`), ${KIT_WORDED} as its first frame, on a layer fixed behind the page (\`html::before\`), painted in the page's first paint. \`soft\` (1 to 100) blurs it by a share of the page's longer side over the palette's gradient, on a layer under it (\`html::after\`; the blob takes none, its frost softening it), and \`grain\` (1 to 100) lays film grain over it on a layer of its own (\`body::before\`), as the editor's picture shows them; the page's own CSS leaves those three to it. \`angle\` turns the glass's ribs (the blob has none: its palette lies from left to right); \`shape\` 0 to 999 picks another glass (0, the default, is the glass as designed) or other blobs (none, the palette's own). The blob also takes \`frost\` 0 to 2 (1) and \`bg\`, its ground: any CSS color, alpha included (\`bg=%23101014\`, \`bg=rgb(0 0 0 / 50%)\`, \`bg=navy\`), answered at its hex; none leaves it clear. The strings take \`bg\` too, their ground, any CSS color answered at its hex alike: none is their designed ground, the palette's darkest color made deeper, and \`bg=transparent\`, or any color wholly clear, is a clear one (\`bg=%2300000000\`). Their threads stand off any ground as off the designed one, lighter than a dark ground and darker than a light one, and off the designed one where the ground is clear. A ground with an alpha lets the page show through, in the first frame and as it plays. The silk, the rosette, the papercut, the strings, ${KIT_ALL} take \`angle\`, which turns the drape, the flower, the way the sheets climb, the strings' stirring or the design of ${KIT_ANY}, and \`shape\` 0 to 999 (0 as designed).${STEPS_SAID} Their first frame is a plain SVG of shapes and gradients, which every browser paints at once. Its rules work pasted into a page's own CSS, which then waits on no other site to paint. The glass's first frame is an SVG filter, about 5 KB compressed, which Firefox takes about a second of the page's thread to draw; the editor's Copy HTML writes it into the page as a WebP instead |
| \`/{seed}.js?style=glass\` | The script that plays the same background from its first frame with WebGL (the glass, the blob, the silk, the rosette, the papercut, the strings, ${KIT_ANY}), one for every palette: it reads the palette and the effect from its own address, so it takes the stylesheet's query, and \`speed\` (0 holds the first frame, 1 by default, up to 10) and \`fps\` (1 to 120, 60 unless asked; a screen slower than that shows its own), and plays the soft and the grain as the stylesheet paints them. Load it as a classic script: \`<script src="…" async>\`. Without WebGL, or for a reader who asks for less motion, the first frame stays, and for that reader no WebGL context is made, nor for a blob, a silk, a rosette, strings, ${KIT_ANY} held at speed 0, whose first frame is its whole picture; the papercut's stylesheet steps its shadows, and its script draws them soft, holding its own first frame on WebGL for that reader and at speed 0. A context the browser loses shows the first frame again until the browser restores it. Without the stylesheet, or its rules in the page, it paints the first frame itself. One script plays a page: a second, of any effect, does nothing. It writes no markup and no style attribute, so it runs under a strict Content Security Policy that allows the site's scripts and styles and \`img-src data:\` |
| \`/{seed}.ase\` | Adobe Swatch Exchange: a group named for the palette, an RGB color to each of the view's colors |
| \`/{seed}.gpl\` | A GIMP palette of the view's colors |
| \`/{seed}.grd\` | The view's gradient as a Photoshop gradient |
| \`/{seed}.tokens.json\` | The view's colors as design tokens (DTCG 2025.10), a color token to each |
| \`/{slug}.ase\`, \`.gpl\`, \`.grd\`, \`.tokens.json\` | A public collection's palettes in one file, each in the view it was saved in |
| \`/api/og?seed={seed}\` | 1200 by 630 card with the wordmark and each color's hex |
| \`/api/search.json?query={query}&limit=48&sort=popular\` | {query, items, tier, read, color}: 1 to 96 items, each with \`kseed\`, its view, \`likes\`, \`score\` and, on the palettes every \`sort\` puts first, \`lead\`, and no colors, which \`/{kseed}.json\` has. \`sort\` is popular, rising, newest or oldest |
| \`/api/og/query?query={query}\` | A search's image as a card with the wordmark |
| \`/api/palettes?sort=popular&page=1&limit=24\` | The gallery: {items, total, page, limit, totalPages}. \`sort\` is popular, rising, newest or oldest; with rising, \`frame\` is 1w (the default), 3m or 1y, how long a like counts |
| \`/api/collections?q={query}&sort=popular&page=1&limit=24\` | Public collections: {items, total, page, totalPages}. \`sort=rising\` takes \`frame\` as the gallery does |
| \`/api/hot?page=1\` | The home page: {page, palettes, collections}, the twenty-four hottest palettes and a page of the hot collections |
| \`/api/hot?q={query}&page=1\` | The home page searched: {page, query, palettes, collections, tier}, sixty palettes that answer the words, the ones that carry \`lead\` first and then the most liked, and a page of the collections that answer them |
| \`/\`, \`/palettes\`, \`/palettes/rising\`, \`/collections\`, \`/collections/rising\` | The home page and the lists for a person. Rising is the week's${others.length ? `, and ${others.join(" or ")} after it its other ${others.length > 1 ? "frames" : "frame"}` : ""} |
| \`/palettes?q={query}\`, \`/collections?q={query}\`, \`/?q={query}\` | Search pages for a person: palettes, collections, or both |
| \`/random\` | Redirects to a new random palette; \`/random.svg\`, \`.png\`, \`.css\` or \`.json\` to a new random palette's file, the query kept: \`/random.svg?style=bands&size=3840x2160\` |

## Search

Words, emoji, color codes and seeds are answered from a snapshot of every public palette, with no model call. Words cover colors, tones, moods, scenes, seasons and uses in 20 languages, and a few hundred emoji stand for them. Color codes find the palettes nearest those colors, in any form CSS writes a color in (hex, rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch() and color()) and as design apps write HSB, and a seed the palettes most like it, led by up to six that its public collections hold. Names no color says, such as a team or a game, are found in palettes' titles, the ones their collections give them among them, in collections' titles and tags, and in the names those collections' descriptions of a palette write, in one of them or across them (tier "named"). Other words outside the vocabulary, in any language, are read by an embedding model once per distinct query (tier "model"); past its limit the answer is tier "account" with no palettes. \`read\` says what the search made of the words: the phrases it knew, the words nothing read, and what followed no, not or without, which a search cannot leave out. A search for one color, by its name (any CSS color name, or a common one such as burgundy, taupe or sage) or by one color code alone, also answers \`color\`: its name where it has one and its hex, rgb, hsl and oklch codes, which its page shows beside its words. A search for a collection's own subject is led by that collection's palettes. The palettes a search's words name and a seed's collection-mates carry \`lead\`, and every \`sort\` puts them first.

## MCP

POST JSON-RPC 2.0 to ${base}${mcp.path} with Content-Type application/json and an access token: one request a POST, no session. Protocol ${newest}, and the initialize handshake of ${handshake.join(", ")}. Every request needs the token. Without one the server answers 401 with a WWW-Authenticate challenge that names ${base}/.well-known/oauth-protected-resource${mcp.path}, and the app signs the person in once through OAuth 2.1, identifying itself with its published client metadata document or registering itself.

A tool answers one text block of JSON. A palette in it is a card: {seed, url, title, colors, style, steps, angle, and soft and grain where it has them}, where \`colors\` are the bands a Swatches view draws (past 12, the ones nearest its own colors), and for a gradient the colors it blends between. One made, changed or inspected also has \`css\` (up to 32 steps) and a \`note\` when something needs saying, and for an app that draws no view of Grabient's, \`files\` (its PNG, SVG and CSS addresses and its card). One saved in a look of its own, such as fluted glass and its settings, also has \`look\`, its address after the seed, which its \`url\` plays and save_palette and save_collection take. The server also serves a skill, a one-page guide for a model, at \`${mcp.skill}\`. Tools:

${mcp.tools.map(tool => `- \`${tool.name}\`: ${tool.description}`).join("\n")}

## Redirects and old addresses

Addresses from the earlier Grabient keep working. A seed that starts with an underscore redirects to its keyframe seed when the stored migration knows it. \`/palettes/{words}\` redirects to \`/palettes?q={words}\`. \`/{seed}/edit\` redirects to \`/{seed}\`.

## Limits

A read a cache holds is never counted. Past a limit the answer is HTTP 429 with Retry-After, and an MCP tool says the limit and the wait in words.

- A list or a search: ${allowed("listMiss")} a minute for an address.
- Words outside the vocabulary: ${allowed("searchModel")} new queries a minute and ${allowed("searchModelDaily")} a day, for an address or for an account through MCP.
- A PNG: ${allowed("imageRender")} a minute for an address. One of more pixels than 1200 by 630 shares ${allowed("largeImageDaily")} a day with the whole site. SVG, CSS, JSON and Markdown are never counted against these.
- MCP tool calls: ${allowed("mcpAccount")} a minute and ${allowed("mcpAccountDaily")} a day for an account.
- A search takes 100 characters and answers 96 palettes at most.

Other work no cache holds is counted too: any other page and a search's pictures, ${allowed("renderMiss")} a minute for an address, and the suggestions for searches and collections, ${allowed("suggestMiss")}; and for the whole site, ${allowed("pageRender")} pages and ${allowed("dataMiss")} reads of the lists' and searches' data in ten minutes. Crawlers Cloudflare verifies are never counted against these. Past them the site may answer a page with HTTP 503 and Retry-After, the app's frame, which a browser draws the page into; data with HTTP 429; and a search's share card with a redirect to the site's card.
`;
}

const base = (origin: string) => origin.replace(/\/$/, "");
/** The guide (/llms.txt), or the whole reference (/llms-full.txt), which begins with it and names the lists' Rising
    frames an admin has left on. */
export const llmsText = (
  origin: string,
  mcp: Mcp,
  full = false,
  frames: readonly RisingFrame[] = RISING_FRAMES
) => (full ? reference(base(origin), mcp, frames) : guide(base(origin), mcp));

/** The MCP server's card (SEP-2127): who it is, where it answers and the protocol versions it speaks, and no tools. */
export function serverCard(origin: string, mcp: Mcp) {
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    ...mcp.info(base(origin)),
    name: mcp.registryName,
    remotes: [
      {
        type: "streamable-http",
        url: base(origin) + mcp.path,
        supportedProtocolVersions: mcp.versions
      }
    ]
  };
}

/** The AI Catalog: one entry, which leads to the card. Agentic Resource Discovery reads the same document, so the
    entry has the name, tools and sample requests it asks for. The publisher is the site's domain, whichever host
    serves it. */
export function aiCatalog(origin: string, mcp: Mcp) {
  return {
    specVersion: "1.0",
    entries: [
      {
        identifier: "urn:air:grabient.com:mcp:palettes",
        displayName: "Grabient palettes",
        description:
          "Search, make and change color palettes and CSS gradients, keep them, and browse collections of them, with a free Grabient account.",
        type: "application/mcp-server-card+json",
        url: base(origin) + cardPath(mcp),
        tags: ["color", "palette", "gradient", "css", "design"],
        capabilities: mcp.tools.map(tool => tool.name),
        representativeQueries: [
          "find a warm sunset gradient for a landing page",
          "show me ocean color palettes with their hex codes",
          "make a gradient from my brand colors",
          "make this palette lighter and give me the CSS",
          "save this palette to my Grabient account"
        ]
      }
    ]
  };
}
