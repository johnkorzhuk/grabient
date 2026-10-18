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
- An app needs a picture for each account. A name draws the same palette every time, so the app stores nothing.

Grabient's colors are for screens: it has no print inks, paint or thread, and takes no colors from an image. To read many palettes use the JSON routes, not the HTML pages.

## Read one palette

- [Palette as JSON](${base}/${seed}.json): seed, keyframes, hex colors, each color's name and the contrast of text on it, CSS in hex and OKLCH, and links to its page, files and card. Pattern: \`${base}/{seed}.json\`
- [Palette as Markdown](${base}/${seed}.md): the same facts as text, with the collections that hold it. Pattern: \`${base}/{seed}.md\`
- [Palette as PNG](${base}/${seed}.png): the gradient alone, no logo, 1200 by 630 unless asked. Takes \`w\` and \`h\`, or \`size\` (\`1200x630\`), up to 2,400 pixels a side and 3 million pixels in all; a larger size comes smaller at the same shape. Pattern: \`${base}/{seed}.png\`
- [Palette as SVG](${base}/${seed}.svg): the gradient as a vector, 800 by 400 unless asked. Takes \`w\` and \`h\`, or \`size\`, 40 to 6000 a side. Pattern: \`${base}/{seed}.svg\`
- [Palette as CSS](${base}/${seed}.css): CSS that works as it is: linked or pasted into a page, it fills the page with the palette. Pattern: \`${base}/{seed}.css\`
- [Palette as ASE](${base}/${seed}.ase): Adobe Swatch Exchange, the view's colors, for Photoshop, Illustrator, InDesign, Procreate and Affinity. Pattern: \`${base}/{seed}.ase\`
- [Palette as GPL](${base}/${seed}.gpl): a GIMP palette of the view's colors, for GIMP, Inkscape, Krita and Aseprite. Pattern: \`${base}/{seed}.gpl\`
- [Palette as GRD](${base}/${seed}.grd): the view's gradient as a Photoshop gradient. Pattern: \`${base}/{seed}.grd\`
- [Palette as design tokens](${base}/${seed}.tokens.json): the view's colors as DTCG design tokens, which Figma imports as variables. Pattern: \`${base}/{seed}.tokens.json\`
- [Palette social card](${base}/api/og?seed=${seed}): 1200 by 630 with the Grabient wordmark. Pattern: \`${base}/api/og?seed={seed}\`
- [Palette in the editor](${base}/${seed}): the page to give a person. Pattern: \`${base}/{seed}\`
- [A name's palette as SVG](${base}/random.svg?name=lee): the palette a name always draws, as an account's picture. \`.png\` for a PNG. Pattern: \`${base}/random.svg?name={name}\`

Every palette route takes \`style\`, \`steps\` and \`angle\`.

## Find palettes

- [Search as JSON](${base}/api/search.json?query=sunset&limit=24): words, hex codes or a seed. Pattern: \`${base}/api/search.json?query={query}&limit=24\`
- [Search page](${base}/palettes?q=sunset): the same search for a person. Pattern: \`${base}/palettes?q={query}\`
- [Search as one image](${base}/palettes/sunset.png): the nine palettes its page shows first. Pattern: \`${base}/palettes/{query}.png\`
- [The home page as JSON](${base}/api/hot?page=1): the Hot feed, palettes and collections in one, by what was liked lately and what is new
- [The gallery as JSON](${base}/api/palettes?sort=popular&page=1&limit=24): the most liked first, or \`sort\` rising or newest

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

The seed is the palette. Style, steps, angle and size choose how it is drawn and are never part of its identity. The default style is linearGradient, with 7 steps at 90 degrees. Steps run from 3 to 100, and never fewer than the palette has keyframes. The six styles are linearGradient, linearSwatches, radialGradient, radialSwatches, angularGradient and angularSwatches. Gradient styles interpolate the sampled stops. Swatch styles draw equal hard bands. Size is \`WxH\` in pixels; either side may be \`auto\`, which follows the other at the file's default shape.

A seed comes from an answer or a link: one typed or changed by hand is another palette, or none. To make a palette, a connected app calls the MCP tool compose_palette with hex colors, and a person opens the editor. Making one saves nothing.

## Routes in detail

Unknown query parameters are ignored.

| Route | Returns |
| --- | --- |
| \`/{seed}.json\` | {model, seed, kseed, name, spec, style, steps, angle, classes, kinds, harmony, colors, names, contrast:{text,ratios,ends}, p3, css:{hex,oklch}, url, links}. \`name\` and \`names\` are what most people call the palette and each color |
| \`/{seed}.png\` | PNG without a logo, 1200 by 630 by default. \`w\` and \`h\`, which come first, or \`size=WxH\`; up to 2,400 a side and 3,024,000 pixels, a larger size drawn smaller at its shape |
| \`/{seed}.svg\` | SVG, 800 by 400 by default. \`w\` and \`h\`, which come first, or \`size=WxH\`; 40 to 6000 a side |
| \`/{seed}.css\` | CSS that works as it is: linked or pasted into a page, it fills the page with the palette, with a Display-P3 version where a P3 screen shows more. Colors in OKLCH, or with \`colors=hex\`, \`rgb\` or \`hsl\` |
| \`/{seed}.ase\` | Adobe Swatch Exchange: a group named for the palette, an RGB color to each of the view's colors |
| \`/{seed}.gpl\` | A GIMP palette of the view's colors |
| \`/{seed}.grd\` | The view's gradient as a Photoshop gradient |
| \`/{seed}.tokens.json\` | The view's colors as design tokens (DTCG 2025.10), a color token to each |
| \`/{slug}.ase\`, \`.gpl\`, \`.grd\`, \`.tokens.json\` | A public collection's palettes in one file, each in the view it was saved in |
| \`/api/og?seed={seed}\` | 1200 by 630 card with the wordmark and each color's hex |
| \`/api/search.json?query={query}&limit=48&sort=popular\` | {query, items, tier, read}: 1 to 96 items, each with \`kseed\`, its view, \`likes\`, \`score\` and, on the palettes every \`sort\` puts first, \`lead\`, and no colors, which \`/{kseed}.json\` has. \`sort\` is popular, rising, newest or oldest |
| \`/api/og/query?query={query}\` | A search's image as a card with the wordmark |
| \`/api/palettes?sort=popular&page=1&limit=24\` | The gallery: {items, total, page, limit, totalPages}. \`sort\` is popular, rising, newest or oldest; with rising, \`frame\` is 1w (the default), 3m or 1y, how long a like counts |
| \`/api/collections?q={query}&sort=popular&page=1&limit=24\` | Public collections: {items, total, page, totalPages}. \`sort=rising\` takes \`frame\` as the gallery does |
| \`/api/hot?page=1\` | The home page: {page, palettes, collections}, the twenty-four hottest palettes and a page of the hot collections |
| \`/api/hot?q={query}&page=1\` | The home page searched: {page, query, palettes, collections, tier}, sixty palettes that answer the words, the most liked first, and a page of the collections that answer them |
| \`/\`, \`/palettes\`, \`/palettes/rising\`, \`/collections\`, \`/collections/rising\` | The home page and the lists for a person. Rising is the week's${others.length ? `, and ${others.join(" or ")} after it its other ${others.length > 1 ? "frames" : "frame"}` : ""} |
| \`/palettes?q={query}\`, \`/collections?q={query}\`, \`/?q={query}\` | Search pages for a person: palettes, collections, or both |
| \`/random\` | Redirects to a new random palette |
| \`/random.svg\`, \`/random.png\` | With \`name\`, the palette that name always draws, read as \`/{seed}.svg\` and \`/{seed}.png\` read their query: an avatar for each account of an app, which the app never stores. Without \`name\`, a redirect to a new random palette's file |

## Search

Words, emoji, hex codes and seeds are answered from a snapshot of every public palette, with no model call. Words cover colors, tones, moods, scenes, seasons and uses in 20 languages, and a few hundred emoji stand for them. Hex codes find the palettes nearest those colors, and a seed the palettes most like it, led by up to six that its public collections hold. Names no color says, such as a team or a game, are found in palettes' titles, the ones their collections give them among them, in collections' titles and tags, and in the names those collections' descriptions of a palette write, in one of them or across them (tier "named"). Other words outside the vocabulary, in any language, are read by an embedding model once per distinct query (tier "model"); past its limit the answer is tier "account" with no palettes. \`read\` says what the search made of the words: the phrases it knew, the words nothing read, and what followed no, not or without, which a search cannot leave out. A search for a collection's own subject is led by that collection's palettes. The palettes a search's words name and a seed's collection-mates carry \`lead\`, and every \`sort\` puts them first.

## MCP

POST JSON-RPC 2.0 to ${base}${mcp.path} with Content-Type application/json and an access token: one request a POST, no session. Protocol ${newest}, and the initialize handshake of ${handshake.join(", ")}. Every request needs the token. Without one the server answers 401 with a WWW-Authenticate challenge that names ${base}/.well-known/oauth-protected-resource${mcp.path}, and the app signs the person in once through OAuth 2.1, identifying itself with its published client metadata document or registering itself.

A tool answers one text block of JSON. A palette in it is a card: {seed, url, title, colors, style, steps, angle}, where \`colors\` are the bands a Swatches view draws (past 12, the ones nearest its own colors), and for a gradient the colors it blends between. One made, changed or inspected also has \`css\` (up to 32 steps) and a \`note\` when something needs saying, and for an app that draws no view of Grabient's, \`files\` (its PNG, SVG and CSS addresses and its card). The server also serves a skill, a one-page guide for a model, at \`${mcp.skill}\`. Tools:

${mcp.tools.map(tool => `- \`${tool.name}\`: ${tool.description}`).join("\n")}

## Redirects and old addresses

Addresses from the earlier Grabient keep working. A seed that starts with an underscore redirects to its keyframe seed when the stored migration knows it. \`/palettes/{words}\` redirects to \`/palettes?q={words}\`. \`/{seed}/edit\` redirects to \`/{seed}\`.

## Limits

A read a cache holds is never counted. Past a limit the answer is HTTP 429 with Retry-After, and an MCP tool says the limit and the wait in words.

- A list or a search: ${allowed("listMiss")} a minute for an address.
- Words outside the vocabulary: ${allowed("searchModel")} new queries a minute and ${allowed("searchModelDaily")} a day, for an address or for an account through MCP.
- A PNG: ${allowed("imageRender")} a minute for an address. One of more pixels than 1200 by 630 shares ${allowed("largeImageDaily")} a day with the whole site. SVG, CSS, JSON and Markdown are never counted.
- MCP tool calls: ${allowed("mcpAccount")} a minute and ${allowed("mcpAccountDaily")} a day for an account.
- A search takes 100 characters and answers 96 palettes at most.
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

/** The headers of what agents read: open to every site's pages, and out of search results. */
export const AGENT_DATA = {
  "Access-Control-Allow-Origin": "*",
  "X-Robots-Tag": "noindex"
} as const;
