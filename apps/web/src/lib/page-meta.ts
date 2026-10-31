import { decodePalette, type Palette, sampleStops } from "@grabient/engine";
import { type Effect, effectAddressParts, effectLookParts } from "@grabient/engine/effect.ts";
import { sentence } from "@grabient/engine/message.ts";
import { readingName, readingPhrase, readPalette } from "@grabient/engine/name.ts";
import { colorCodes, namedColor } from "@grabient/engine/named-colors.ts";
import {
  asSaved,
  DEFAULT_ANGLE,
  drawnView,
  isFixedSize,
  type Style,
  type View,
  viewSearch
} from "@grabient/engine/view.ts";
import {
  DEFAULT_LOCALE,
  isLocale,
  isPagePath,
  LOCALE_INFO,
  LOCALES,
  type Locale,
  locale,
  localizePath,
  msg,
  splitLocale,
  t
} from "@grabient/i18n";
import { queryColor } from "@grabient/search/colors.ts";
import { DEFAULT_FRAME, framePath, type RisingFrame } from "./orders.ts";

/* A page's metadata: its title, the description a search result shows under it, its canonical address, whether search
   engines index it, its share card, the same page in the other languages and its structured data. One function makes
   it on the server and in the browser, from what the page says of itself: what its address means, and the facts its
   data brought (a palette's written words, a collection's own, a search the index leaves out). Metadata made from the
   address alone would give the page a crawler renders after hydration a generic title.

   Nothing here reads a database, the network or the request. The origin every address is written in comes from
   setOriginSource on the server, and in the browser from the canonical link the server wrote. Only production's origin
   is indexed. */

/** The one origin search engines index. Staging, every Preview and local development say noindex. */
export const PRODUCTION_ORIGIN = "https://grabient.com";
/** A search result cuts a description past 160 characters, and Bing flags pages that share one or say under 110. */
export const DESCRIPTION_MAX = 160;
/** The version of everything a picture draws. A change to what any picture draws takes a new one: kept pictures are
    named by it, and a card's address carries it, so a network that keeps cards by address asks again. */
export const CARD_VERSION = "k4";
/** A share card's size, and a palette's own picture's where its address names none. */
export const CARD_SIZE = { width: 1200, height: 630 } as const;
/** A collection's sheet, square as image searches show palettes (server/images/montages.ts). */
export const SHEET_SIZE = { width: 1200, height: 1200 } as const;
/** The palette of the site's own card: what a share card shows when its address names none. */
export const DEFAULT_SEED = "kS7Q8Yy5S_SChv0";
/** Grabient's code. */
export const GITHUB_REPO = "https://github.com/johnkorzhuk/grabient";

export type Order = "popular" | "rising";
/** The view a list's address sets. What it leaves out or says `auto` for, each palette draws in its own. */
export interface ListView {
  style?: Style | "auto";
  steps?: number | "auto";
  angle?: number | "auto";
}
/** A collection's own words and counts, as its page reads them. */
export interface CollectionFacts {
  title: string;
  description: string;
  tags: readonly string[];
  count: number;
  createdAt: number;
  updatedAt: number;
  /** a private collection, its owner's alone: never indexed */
  unlisted?: boolean;
  /** the languages besides English one of Grabient's collections is translated into; its page is indexed in each */
  languages?: readonly string[];
}
/** How a palette is drawn, without a picture's size: its saved view, or the view a list's card draws it in. */
export type PaletteView = Pick<View, "style" | "steps" | "angle">;
/** What a page's data adds to its address. */
interface Facts {
  /** the server's word on a page the index leaves out: a search the vocabulary cannot read, a page past the last */
  robots?: string;
  /** the palettes the page lists, in its order, each at the address its card links (paletteAddress) */
  palettes?: readonly string[];
  /** the collections a list of collections shows, in its order */
  collections?: readonly { slug: string; title: string }[];
}
type FixedKind = keyof typeof FIXED;
/** A page as its metadata reads it. Page numbers start at 1; `limit` is the page size the address names. */
export type Page = Facts &
  (
    | { kind: FixedKind; query?: string; page?: number }
    | { kind: "home"; query?: string; page?: number; view?: ListView }
    | {
        kind: "list";
        order: Order;
        frame?: RisingFrame;
        page?: number;
        limit?: number;
        view?: ListView;
      }
    | {
        kind: "search";
        query: string;
        order: Order;
        frame?: RisingFrame;
        page?: number;
        limit?: number;
        view?: ListView;
      }
    | {
        kind: "collections";
        order: Order;
        frame?: RisingFrame;
        query?: string;
        page?: number;
        limit?: number;
        view?: ListView;
      }
    | { kind: "own-collections"; query?: string; page?: number; limit?: number }
    | {
        kind: "collection";
        /** its address without the slash: `ocean-gradients`, or `@ada/warm-sunsets` */
        slug: string;
        order: Order;
        view?: ListView;
        collection?: CollectionFacts;
      }
    | {
        /** a palette's examples, in the style its address names */
        kind: "examples";
        seed: string;
        view: View;
        effect: Effect | null;
      }
    | {
        kind: "palette";
        seed: string;
        palette: Palette;
        view: PaletteView;
        /** the effect its address plays (the fluted glass or the blob), which its card shows in its view's place */
        effect?: Effect;
        /** the view it was saved in, which its canonical address draws: none for a palette neither the gallery nor
            Grabient's collections hold */
        saved?: PaletteView;
        /** the words written for it that its colors bear out, in English, where they are written, with the view it
            was saved in, which they describe */
        written?: {
          title: string;
          description?: string;
          view: PaletteView;
        };
        /** the public collections that hold it, titled in the page's language */
        heldBy?: readonly { slug: string; title: string }[];
      }
    /** an address no page has, or an old palette's address that no map holds, as it came */
    | { kind: "notfound" | "legacy"; path: string }
  );

export interface Alternate {
  hreflang: string;
  href: string;
}
export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  image: string;
  imageAlt: string;
  themeColor?: string;
  /** the page as Markdown, for an agent that reads text: a palette's and a collection's */
  markdown?: string;
  /** the same page in each language it is indexed in, x-default last */
  alternates?: readonly Alternate[];
  structuredData: Record<string, unknown>[];
}

/** What the browser's page holds of the origin, typed here so the Worker's code, which has no DOM, can read this. */
interface BrowserPage {
  document?: {
    querySelector(selector: string): { getAttribute(name: string): string | null } | null;
  };
  location?: { origin: string };
}
let originSource: () => string = () => PRODUCTION_ORIGIN;
let pageOrigin: string | undefined;
/** Where the server reads the origin: the deploy's public origin for the request it answers. */
export function setOriginSource(source: () => string): void {
  originSource = source;
}
/** The origin the page's addresses are written in. In the browser it is the one the server wrote into the first
    page's canonical link, so a page reached on another host of the deploy goes on naming the public one. */
export function siteOrigin(): string {
  const { document, location } = globalThis as BrowserPage;
  if (!document || !location) return originSource();
  if (!pageOrigin) {
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
    if (!canonical || !URL.canParse(canonical)) return location.origin;
    pageOrigin = new URL(canonical).origin;
  }
  return pageOrigin;
}

const absolute = (path: string, origin: string) => new URL(path, origin).toString();
/** A page's address in the reader's language, absolute: canonicals, breadcrumbs, the items a list names. */
const pageUrl = (path: string, origin: string) => absolute(localizePath(path, locale()), origin);
/** The site's name after a page's own title, the same in every language. A palette's name is measured for the room
    this leaves (name.ts in the engine). */
const titled = (title: string) => `${title} | Grabient`;
const untitled = (title: string) => title.replace(/ \| Grabient$/, "");
const language = () => ({ t, locale: locale() });

/** A palette's own address: its seed in the view it was saved in, where its written words show, else the default view,
    each as an address reads it, steps never under its keyframes (an eight-keyframe palette is /seed?steps=8, since
    /seed leads there). Canonicals, sitemaps and lists' structured data name it, as a list's card links it, so none of
    them names a redirect. */
export function paletteAddress(seed: string, saved?: Partial<PaletteView>): string {
  const palette = decodePalette(seed);
  return `/${seed}${palette ? viewSearch(drawnView(palette, saved)) : ""}`;
}
/** A palette's share card in a view, as its page and its sitemap entry name it. */
export const paletteCard = (seed: string, view: PaletteView) =>
  `/api/og?seed=${seed}&v=${CARD_VERSION}${viewSearch(view).replace("?", "&")}`;
/** A palette's share card where its address plays an effect: the effect's first frame, as the page shows it before it
    moves (server/images/cards.ts), named by all it depends on: its angle and its look, but not its pace. */
export function effectCard(seed: string, effect: Effect, angle: number): string {
  const turned = angle !== DEFAULT_ANGLE ? [`angle=${angle}`] : [];
  const parts = [`style=${effect.kind}`, ...turned, ...effectLookParts(effect)];
  return `/api/og?seed=${seed}&v=${CARD_VERSION}&${parts.join("&")}`;
}
/** A palette's examples page (routes/$id/examples.tsx): its address and /examples, then the style it shows, a
    gradient's view or an effect's address, as the palette's own page names them, with no size. */
export function examplesPath(
  seed: string,
  view: Pick<View, "style" | "steps" | "angle">,
  effect: Effect | null
): string {
  const query = effect
    ? `?${effectAddressParts(effect, view.angle).join("&")}`
    : viewSearch({ style: view.style, steps: view.steps, angle: view.angle });
  return `/${seed}/examples${query}`;
}

/** A palette's examples (routes/$id/examples.tsx): kept out of the index, since what it says is the palette's own page's
    and the code any palette takes; its card is the palette's in the style it shows. Its address is the palette's plus
    /examples, with the view's query or the effect's. */
function examplesPage(
  page: Extract<Page, { kind: "examples" }>,
  meta: PageMeta,
  origin: string
): string {
  const P = decodePalette(page.seed);
  const name = P ? paletteName(P, page.view) : page.seed;
  meta.title = titled(t("{name} examples", { name }));
  meta.description = t("Ways to use the {name} palette, each with the code that does it.", {
    name
  });
  meta.robots = "noindex,follow";
  meta.image = absolute(
    page.effect
      ? effectCard(page.seed, page.effect, page.view.angle)
      : paletteCard(page.seed, page.view),
    origin
  );
  meta.imageAlt = t("{name} color palette", { name });
  return examplesPath(page.seed, page.view, page.effect);
}

/** A palette's own picture beside its page, in a view: a fixed size is the file's `w` and `h`. The PNG is the one its
    page shows an image search and its sitemap entry names. */
export function paletteFile(seed: string, view: View, type: "png" | "svg"): string {
  const query = new URLSearchParams(viewSearch({ ...view, size: null }).slice(1));
  if (isFixedSize(view.size)) {
    query.set("w", String(view.size.width));
    query.set("h", String(view.size.height));
  }
  return `/${seed}.${type}${query.size ? `?${query}` : ""}`;
}

/** A list's query as its canonical writes it: the words, a page past the first and a page size other than the
    default. A page at another size lists other palettes than the same page at the default, so it keeps its size. */
function listQuery(p: { query?: string; page?: number; limit?: number }): string {
  const q = new URLSearchParams();
  if (p.query) q.set("q", p.query);
  if (p.page && p.page > 1) q.set("page", String(p.page));
  if (p.limit && p.limit !== 24) q.set("limit", String(p.limit));
  return q.size ? `?${q}` : "";
}
/** Rising read over a longer frame than the week's is the same list again, so its address stays out of the index. */
const longFrame = (frame?: RisingFrame) => !!frame && frame !== DEFAULT_FRAME;
const listPath = (base: string, order: Order, frame?: RisingFrame) =>
  order === "popular" ? base : framePath(`${base}/rising`, frame);

/** Words cut to `max` characters: after the last sentence that fits when it is longer than `sentence`, else at a word,
    marked with an ellipsis. */
export function clipWords(text: string, max = DESCRIPTION_MAX, sentence = 60): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const ends = [...cut.matchAll(/[.!?](?= )|[。！？]/g)];
  const end = ends.length ? ends[ends.length - 1].index + 1 : 0;
  if (end > sentence) return cut.slice(0, end);
  const word = cut.lastIndexOf(" ");
  return `${(word > 60 ? cut.slice(0, word) : cut.slice(0, max - 1)).replace(/[,;:、，]$/, "")}…`;
}
/** A description from a page's own words and the facts after them: the first of `forms` that fits, the fullest first.
    Where none does, the words are clipped to the room the last leaves, at a sentence where one is long enough. */
function fitted(words: string, forms: readonly ((words: string) => string)[]): string {
  const first = (w: string) =>
    forms.map(form => form(w)).find(text => text.length <= DESCRIPTION_MAX);
  const last = forms[forms.length - 1];
  /* measured with a word in place: a right-to-left language sets the words between isolation marks */
  const room = DESCRIPTION_MAX - (last("x").length - 1);
  return first(words) ?? first(clipWords(words, Math.max(0, room), 20)) ?? clipWords(last(""));
}

/** A style as a title says it after a palette's name: "Light yellow to pink linear gradient". */
const STYLE_WORDS: Record<Style, string> = {
  linearGradient: msg("linear gradient"),
  linearSwatches: msg("linear swatches"),
  angularGradient: msg("angular gradient"),
  angularSwatches: msg("angular swatches"),
  radialGradient: msg("radial gradient"),
  radialSwatches: msg("radial swatches")
};
/** A palette by what its colors are called in the reader's language: "Vivid navy, blue and lavender". */
export const paletteName = (P: Palette, view?: Partial<Pick<View, "style" | "steps">>) =>
  readingName(readPalette(P, view?.style, view?.steps), language());
/** That name as a title says it, with the palette's style: "Vivid navy, blue and lavender linear gradient". A page
    whose palette has a title of other words says it under that title, and so does a card's tooltip. */
export const styledName = (name: string, style: Style) =>
  t("{name} {style}", { name, style: t(STYLE_WORDS[style]) });
/** The same name inside a sentence: "Palettes like navy to lavender". */
const paletteInline = (P: Palette) => readingPhrase(readPalette(P), language());
/** A search's subject as a title says it: its words without the nouns the title adds itself. */
function subjectOf(query: string): string {
  const bare = query
    .replace(/\b(?:colou?r\s+)?(?:gradients?|palettes?|swatches)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const subject = bare || query;
  return subject[0].toLocaleUpperCase(locale()) + subject.slice(1);
}

/** The lists' titles, which page one keeps exactly as grabient.com ranks under them. */
const LISTS = {
  home: {
    title: msg("Grabient — CSS Gradient Generator & Color Palettes"),
    paged: msg("Hot palettes and collections"),
    description: msg(
      "Make CSS gradients and explore popular color palettes. Edit colors, steps, angle and style, then copy CSS or export SVG and PNG."
    )
  },
  popular: {
    title: msg("Popular gradient palettes | Grabient"),
    paged: msg("Popular gradient palettes"),
    description: msg(
      "The most liked CSS gradients and color palettes on Grabient. Edit colors, steps, angle and style, then copy CSS or export SVG and PNG."
    )
  },
  rising: {
    title: msg("Rising gradient palettes | Grabient"),
    paged: msg("Rising gradient palettes"),
    description: msg(
      "CSS gradients and color palettes gaining likes now. Edit colors, steps, angle and style, then copy CSS or export SVG and PNG."
    )
  }
};
/** About's share cards, one a day: build-icons.ts draws this many (public/about-1.png on), and the UTC day picks one,
    round again every ABOUT_CARDS days. About's page is kept five minutes at the edge, so a new day's card shows within
    minutes of midnight UTC. */
export const ABOUT_CARDS = 7;
const DAY_MS = 86_400_000;
/** The share cards build-icons.ts draws into public/ (About's and the side menu's pages'), their version in their
    addresses, so a link preview that kept an earlier drawing fetches the new one: raise it when they are drawn anew. */
const SHARE_CARDS = 2;
const shareCard = (file: string) => `/${file}?v=${SHARE_CARDS}`;
export const aboutCard = (now = Date.now()) =>
  shareCard(`about-${(Math.floor(now / DAY_MS) % ABOUT_CARDS) + 1}.png`);
/** The pages whose words are fixed: where each is, its title and description, and how the index takes it. An account's
    own pages hold an app's request or name an account in their addresses, which no metadata repeats. Privacy, Terms
    and the newsletter, whose issues are English, are indexed in English alone. */
const FIXED = {
  about: {
    path: "/about",
    title: msg("About Grabient"),
    description: msg(
      "How Grabient makes gradients from 2 to 8 keyframes in OKLCH: the formula, steps, hue past 360°, colors a screen can't show and the seed in each URL."
    ),
    named: true,
    /* the day's card: a palette Random drew beside its Color space scene (scripts/build-icons.ts) */
    image: aboutCard,
    imageAlt: msg("A color palette's path through the OKLCH color space")
  },
  bindings: {
    path: "/bindings",
    title: msg("Keyboard shortcuts"),
    /* its share card (scripts/page-cards.ts) */
    image: shareCard("bindings.png"),
    description: msg(
      "Every keyboard shortcut in Grabient: theme, copy URL, undo and redo, random palette, invert, reverse, steps and more. Press one on the page to change it."
    )
  },
  mcp: {
    path: "/mcp-server",
    // the protocol's name, in every language
    title: "MCP",
    /* its share card (scripts/page-cards.ts) */
    image: shareCard("mcp-server.png"),
    description: msg(
      "Connect an AI app like Claude, ChatGPT or Cursor to your Grabient account. It can search, make and save palettes and collections for you."
    )
  },
  newsletter: {
    path: "/newsletter",
    title: msg("Newsletter"),
    description: msg(
      "Grabient's newsletter, about once a month: rising palettes, featured collections and new features. Read every issue here, or sign up to get it by email."
    )
  },
  privacy: {
    path: "/privacy",
    title: msg("Privacy policy"),
    description: msg(
      "What Grabient collects when you browse, sign in and save palettes, who can see it, who it's shared with, how long it's kept and how to delete it."
    )
  },
  terms: {
    path: "/terms",
    title: msg("Terms of service"),
    description: msg(
      "The terms for using Grabient: your account, the palettes you make and export, what you post, acceptable use, the source code and names, and liability."
    )
  },
  contact: {
    path: "/contact",
    title: msg("Contact"),
    /* its share card (scripts/page-cards.ts) */
    image: shareCard("contact.png"),
    description: msg(
      "Tell Grabient what's broken or what you need. Send a message with the contact form, and leave your email only if you want a reply."
    )
  },
  login: {
    path: "/login",
    title: msg("Sign in"),
    description: msg("Sign in to save your favorite color palettes."),
    robots: "noindex,follow"
  },
  connect: {
    path: "/connect",
    title: msg("Connect an app"),
    description: msg("Allow an app to use your Grabient account."),
    robots: "noindex,nofollow"
  },
  unsubscribe: {
    path: "/unsubscribe",
    title: msg("Unsubscribe"),
    description: msg("Stop the Grabient newsletter."),
    robots: "noindex,nofollow"
  },
  settings: {
    path: "/settings",
    title: msg("Settings"),
    /* its share card (scripts/page-cards.ts) */
    image: shareCard("settings.png"),
    description: msg("Manage your Grabient account."),
    robots: "noindex,nofollow"
  },
  saved: {
    path: "/palettes/saved",
    title: msg("Saved palettes"),
    description: msg("Your saved Grabient palettes."),
    robots: "noindex,nofollow"
  }
} satisfies Record<
  string,
  {
    path: string;
    title: string;
    description: string;
    named?: true;
    robots?: string;
    /** a share image of its own, or the one for now, and its alt; without one, the alt names the page */
    image?: string | (() => string);
    imageAlt?: string;
  }
>;
/* The pages whose words are the site's own and translated, so each language's copy is indexed and names the others. A
   palette's, a search's and a collection's words are their writers', in English: in another language those pages are
   for reading, out of the index, until their words are translated too. One of Grabient's collections that an admin's
   app translated is indexed in each language it reads in. */
const TRANSLATED = new Set<Page["kind"]>([
  "home",
  "list",
  "collections",
  "about",
  "bindings",
  "mcp",
  "contact"
]);
/** Whether a page's copy in each language is indexed and names the others. */
export const translatedPage = (page: Page) =>
  TRANSLATED.has(page.kind) && !("query" in page && page.query);

/** Whether production indexes the page a link of the site's leads to, as far as its address says: what pageMeta
    decides from a page's kind, language, order, words and page number. A collection reads in English and in
    `languages`, the others its facts name; where those are unknown it is taken as read in every one, as most of
    Grabient's are. What only a page's data knows, a search the vocabulary cannot read or a page past the last, the page
    says itself. Files are no pages to index. */
export function indexedAddress(address: string, languages?: readonly string[]): boolean {
  const url = new URL(address, PRODUCTION_ORIGIN);
  const { locale: language, path } = splitLocale(url.pathname);
  if (!isPagePath(path)) return false;
  const english = language === DEFAULT_LOCALE;
  const words = !!url.searchParams.get("q");
  const [first = "", second, third] = path.slice(1).split("/");
  if (path === "/") return !words && !(Number(url.searchParams.get("page")) > 1);
  if (first === "palettes" || first === "collections") {
    if (second === "saved" || (third !== undefined && third !== DEFAULT_FRAME)) return false;
    /* a search is the palettes' own, in English and in the popular order: the rest repeat it. A search by a palette
       is none, as pageMeta says */
    const byPalette = !!decodePalette(url.searchParams.get("q") ?? "");
    return !words || (first === "palettes" && !second && english && !byPalette);
  }
  const fixed = (Object.keys(FIXED) as FixedKind[]).find(
    kind => path === FIXED[kind].path || path.startsWith(`${FIXED[kind].path}/`)
  );
  if (fixed) return !("robots" in FIXED[fixed]) && (english || TRANSLATED.has(fixed));
  if (decodePalette(first)) return english && !second;
  /* a collection: one under an account is its owner's alone, and its Rising order is its page again */
  if (first.startsWith("@") || second) return false;
  return english || !languages || languages.includes(language);
}
/** A link's rel: nofollow where production keeps the page it leads to out of the index (indexedAddress). */
export const relTo = (href: string, languages?: readonly string[]): string | undefined =>
  indexedAddress(href, languages) ? undefined : "nofollow";

const pagedTitle = (title: string, page = 1) =>
  page > 1 ? t("{title}, page {page}", { title, page }) : title;
/** The longest title a result shows whole, the site's name included. */
const TITLE_MAX = 70;
/** A list's title: its name, the page past the first and the site's name, the name cut at a word to the room when the
    words someone typed run longer, so the page and the site's name stay. */
function listTitle(name: string, page = 1): string {
  const whole = titled(pagedTitle(name, page));
  if (whole.length <= TITLE_MAX) return whole;
  const room = Math.max(0, TITLE_MAX - (whole.length - name.length) - 1);
  const cut = name.slice(0, room);
  /* a cut that a space follows ends on a word already */
  const word = name[room] === " " ? room : cut.lastIndexOf(" ");
  return titled(
    pagedTitle(
      `${(word > room / 2 ? cut.slice(0, word) : cut).replace(/[\s,;:、，]+$/u, "")}…`,
      page
    )
  );
}
/** A description led by a color's hex and RGB, the codes a search for the color asks for, cut to the room. In a
    right-to-left language the codes are isolated, as a sentence's values are, so "#ff00aa" never reads "ff00aa#". */
function coded(hex: string, description: string): string {
  const c = colorCodes(hex);
  if (!c) return description;
  const codes = `${c.hex}, ${c.rgb}.`;
  return clipWords(
    `${LOCALE_INFO[locale()].dir === "rtl" ? `\u2068${codes}\u2069` : codes} ${description}`
  );
}
/** The words written for a palette as its page wears them: in English, and while it is drawn as it was saved, the one
    view they describe. Drawn any other way, its colors name it. */
const ownWords = (page: Extract<Page, { kind: "palette" }>) =>
  locale() === DEFAULT_LOCALE && page.written && asSaved(page.palette, page.view, page.written.view)
    ? page.written
    : undefined;

/** A page's heading, for a reader who listens and for a crawler: what its title says, without the site's name. A
    palette's is its written title in English while it is drawn as it was saved, else what its colors are called in
    its style. */
export function heading(page: Page): string {
  const query = "query" in page ? page.query : undefined;
  const like = query ? decodePalette(query) : null;
  const say = (byPalette: string, byWords: string, plain: string) =>
    like
      ? t(byPalette, { name: paletteInline(like) })
      : query
        ? t(byWords, { subject: subjectOf(query), query })
        : t(plain);
  switch (page.kind) {
    case "home":
      return say(
        msg("Palettes like {name}"),
        msg("{subject} palettes and collections"),
        LISTS.home.paged
      );
    case "list":
      return t(LISTS[page.order].paged);
    case "palette":
      return (
        ownWords(page)?.title || styledName(paletteName(page.palette, page.view), page.view.style)
      );
    case "search":
      return say(msg("Palettes like {name}"), msg("{subject} gradients and color palettes"), "");
    case "saved":
      return say(
        msg("Saved palettes like {name}"),
        msg("Saved palettes for {query}"),
        msg("Saved palettes")
      );
    case "own-collections":
      return say(
        msg("Your collections like {name}"),
        msg("Your collections for {query}"),
        msg("Your collections")
      );
    case "collections":
      return say(
        msg("Collections like {name}"),
        msg("{subject} gradient and color palette collections"),
        page.order === "rising"
          ? msg("Rising gradient and color palette collections")
          : msg("Gradient and color palette collections")
      );
    default:
      return "";
  }
}

/** A card's address: its own parameters, then the cards' version, the view the page's address sets and when what it
    draws last changed, so a network that keeps cards by address asks again after a change. */
function cardUrl(
  path: string,
  params: Record<string, string>,
  view: ListView | undefined,
  origin: string,
  changed?: number
): string {
  const url = new URL(path, origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("v", CARD_VERSION);
  for (const key of ["style", "steps", "angle"] as const) {
    const value = view?.[key];
    if (value != null && value !== "auto") url.searchParams.set(key, String(value));
  }
  if (changed) url.searchParams.set("t", String(changed));
  return url.toString();
}
/** A list's card is drawn in its page's order: Rising's with its frame when that is not the week's. */
const rising = (frame?: RisingFrame): Record<string, string> => ({
  sort: "rising",
  ...(frame && longFrame(frame) ? { frame } : {})
});
/** One collection's card, as its page and the sitemap name it. */
export const collectionCard = (
  slug: string,
  origin: string,
  updatedAt?: number,
  order: Order = "popular",
  view?: ListView
) =>
  cardUrl(
    "/api/og/collection",
    { slug, ...(order === "rising" ? { sort: "rising" } : {}) },
    view,
    origin,
    updatedAt
  );

/** One collection's sheet: its first palettes as rows with their hex codes, which its page shows under its cards and
    the sitemap and its structured data name for image searches; by when it changed, as its card is. A path unless an
    origin is given. */
export const collectionSheet = (slug: string, updatedAt?: number, origin?: string) => {
  const path = `/${slug}.png${updatedAt ? `?t=${updatedAt}` : ""}`;
  return origin ? new URL(path, origin).toString() : path;
};

const SCHEMA = "https://schema.org";
/** The site, as a page that is part of it names it: by the one WebSite every page describes. */
const website = (origin: string) => ({ "@id": `${absolute("/", origin)}#website` });
const breadcrumbs = (origin: string, trail: readonly (readonly [string, string])[]) => ({
  "@context": SCHEMA,
  "@type": "BreadcrumbList",
  itemListElement: trail.map(([name, path], i) => ({
    "@type": "ListItem",
    position: i + 1,
    name,
    item: pageUrl(path, origin)
  }))
});
const iso = (time: number) => {
  const date = new Date(time);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
};

/** The app the home is, which is free: what a search engine may show for the site. */
const webApplication = (origin: string) => ({
  "@context": SCHEMA,
  "@type": "WebApplication",
  name: "Grabient",
  url: pageUrl("/", origin),
  description: t(
    "CSS gradient generator and color palette finder. Browse and edit gradient palettes, then export them as CSS, SVG, PNG or a shader."
  ),
  applicationCategory: "DesignApplication",
  operatingSystem: "Web",
  inLanguage: LOCALE_INFO[locale()].tag,
  browserRequirements: t("Requires JavaScript"),
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }
});

/** What the site is, on every page: the site and its search, and the organization behind it. */
export function siteStructuredData(origin: string): Record<string, unknown>[] {
  const site = absolute("/", origin);
  return [
    {
      "@context": SCHEMA,
      "@type": "WebSite",
      "@id": `${site}#website`,
      name: "Grabient",
      url: site,
      description: t(
        "A free CSS gradient generator and color palette finder for designers and developers."
      ),
      publisher: { "@id": `${site}#organization` },
      inLanguage: LOCALES.map(l => LOCALE_INFO[l].tag),
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${pageUrl("/palettes", origin)}?q={search_term_string}`
        },
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@context": SCHEMA,
      "@type": "Organization",
      "@id": `${site}#organization`,
      name: "Grabient",
      url: site,
      logo: absolute("/icon-512.png", origin),
      sameAs: [GITHUB_REPO, "https://www.producthunt.com/products/grabient"]
    }
  ];
}

/** The same page in each language and the English as x-default: hreflang, and the pages' sitemap. */
export function alternatesOf(
  path: string,
  origin: string,
  locales: readonly Locale[] = LOCALES
): Alternate[] {
  return [
    ...locales.map(l => ({
      hreflang: LOCALE_INFO[l].hreflang,
      href: absolute(localizePath(path, l), origin)
    })),
    { hreflang: "x-default", href: absolute(path, origin) }
  ];
}

/** What a search page says it holds. */
function searchDescription(query: string): string {
  const like = decodePalette(query);
  return like
    ? t(
        "Color palettes and CSS gradients like {name}. Edit any of them, then copy CSS or export SVG and PNG.",
        { name: paletteInline(like) }
      )
    : t(
        "Explore {subject} gradients and color palettes, matched by color and mood. Edit any of them, then copy CSS or export SVG and PNG.",
        { subject: subjectOf(query).toLowerCase() }
      );
}

/** `count` of a palette's colors evenly from its first to its last, every one where it has no more. */
const spread = (hexes: readonly string[], count: number) =>
  (count >= hexes.length
    ? hexes
    : Array.from(
        { length: count },
        (_, i) => hexes[Math.round((i * (hexes.length - 1)) / (count - 1))]
      )
  ).join(", ");
/** What a palette's page says of it to a search: its written words while they are its own (ownWords), else what its
    colors are called, then its colors from end to end, every one where they all fit. */
function describe(
  page: Extract<Page, { kind: "palette" }>,
  name: string,
  hexes: readonly string[]
): string {
  const counts = [...new Set([Math.min(hexes.length, 8), 5, 3])].filter(n => n <= hexes.length);
  return fitted(
    ownWords(page)?.description ??
      t("{name} palette with {steps, plural, one {# color} other {# colors}}.", {
        name,
        steps: page.view.steps
      }),
    [
      ...counts.map(
        n => (words: string) =>
          t("{words} {hexes}. Edit and export CSS, SVG, PNG or a shader.", {
            words,
            hexes: spread(hexes, n)
          })
      ),
      ...counts.map(
        n => (words: string) => t("{words} {hexes}.", { words, hexes: spread(hexes, n) })
      )
    ]
  );
}
/** What a palette's page says of it under its picture, to its reader and to a crawler alike: its written words while
    they are its own, as many sentences as a description holds, then how it is drawn (its style, how many colors and
    the angle a linear or angular one turns to), its colors from end to end, every one up to eight, and what the editor
    makes of it. Its title names it. */
export function paletteFacts(page: Extract<Page, { kind: "palette" }>): string {
  const { palette: P, view } = page;
  const hexes = sampleStops(P, view.steps).map(stop => stop.hex);
  const facts = {
    style: t(STYLE_WORDS[view.style]),
    steps: view.steps,
    /* with its sign, so a right-to-left sentence keeps them together */
    angle: `${Math.round(view.angle)}°`,
    hexes: spread(hexes, hexes.length > 8 ? 5 : hexes.length)
  };
  const said = sentence(
    view.style.startsWith("radial")
      ? t(
          "{style}, {steps, plural, one {# color} other {# colors}}: {hexes}. Edit and export CSS, SVG, PNG or a shader.",
          facts
        )
      : t(
          "{style}, {steps, plural, one {# color} other {# colors}} at {angle}: {hexes}. Edit and export CSS, SVG, PNG or a shader.",
          facts
        ),
    locale()
  );
  const written = ownWords(page)?.description;
  return written ? `${clipWords(written)} ${said}` : said;
}

/** A palette's page: titled by its written words in English while it is drawn as it was saved, else by what its colors
    are called, and described by them with its colors, which no other palette shares, so two palettes described alike
    still read apart. */
function palettePage(
  page: Extract<Page, { kind: "palette" }>,
  meta: PageMeta,
  origin: string
): string {
  const { seed, palette: P, view } = page;
  const reading = readPalette(P, view.style, view.steps);
  const name = readingName(reading, language());
  const style = t(STYLE_WORDS[view.style]);
  const hexes = sampleStops(P, view.steps).map(stop => stop.hex);
  const written = ownWords(page);
  const path = paletteAddress(seed, page.saved);
  meta.title = titled(heading(page));
  meta.description = describe(page, name, hexes);
  meta.image = absolute(
    page.effect ? effectCard(seed, page.effect, view.angle) : paletteCard(seed, view),
    origin
  );
  meta.imageAlt = t("{name} color palette", { name });
  meta.themeColor = hexes[0];
  meta.markdown = absolute(`/${seed}.md${viewSearch(view)}`, origin);
  const title = untitled(meta.title);
  const held = page.heldBy ?? [];
  /* a written title is the page's name; what its colors call it stays beside it, for a search in colors */
  const called = written?.title
    ? t("{name} {style}", { name: paletteName(page.palette, page.view), style })
    : undefined;
  meta.structuredData.push(
    {
      "@context": SCHEMA,
      "@type": "CreativeWork",
      name: title,
      ...(called ? { alternateName: called } : {}),
      inLanguage: LOCALE_INFO[locale()].tag,
      url: pageUrl(path, origin),
      /* the page's subject, so a search's thumbnail for it is its picture drawn plain; the share card carries words */
      mainEntityOfPage: pageUrl(path, origin),
      image: absolute(paletteFile(seed, view, "png"), origin),
      description: t(
        "{name} {style} with {steps, plural, one {# color} other {# colors}}: {hexes}. Edit it and copy or download CSS, SVG, PNG or shader code.",
        { name, style, steps: view.steps, hexes: hexes.join(", ") }
      ),
      /* what a search engine may read the page as: its colors, what they are called, what kind of palette it is */
      keywords: [...hexes, ...new Set(reading.names.map(color => t(color))), ...reading.kinds].join(
        ", "
      ),
      isPartOf: [
        website(origin),
        ...held.map(c => ({
          "@type": "CollectionPage",
          name: c.title,
          url: pageUrl(`/${c.slug}`, origin)
        }))
      ]
    },
    breadcrumbs(origin, [
      ["Grabient", "/"],
      ...(held.length
        ? ([
            [t("Collections"), "/collections"],
            [held[0].title, `/${held[0].slug}`]
          ] as const)
        : []),
      [title, path]
    ])
  );
  return path;
}

/** A collection's page: titled with its count while that fits a result's title, described by its own words and then
    what it holds while that fits, or by its title when it has no words. */
function collectionPage(
  page: Extract<Page, { kind: "collection" }>,
  meta: PageMeta,
  origin: string
): Record<string, unknown> | undefined {
  const c = page.collection;
  meta.title = titled(t("Palette collection"));
  meta.description = t("A collection of color palettes on Grabient.");
  /* the rising order is the same palettes as the collection's own page */
  if (page.order === "rising") meta.robots = "noindex,follow";
  if (!c) return undefined;
  /* a collection of one color, by its address, says the color's hex after its title */
  const color = namedColor(page.slug);
  const title = color ? `${c.title} (${color.hex})` : c.title;
  const counted = titled(
    t("{title}: {count, plural, one {# color palette} other {# color palettes}}", {
      title,
      count: c.count
    })
  );
  meta.title = c.count > 0 && counted.length <= 62 ? counted : listTitle(title);
  const count = c.count;
  meta.description = c.description
    ? fitted(c.description, [
        words =>
          t(
            "{words} {count, plural, one {# color palette} other {# color palettes}} and CSS gradients. Open any palette to edit and export it.",
            { words, count }
          ),
        words =>
          t(
            "{words} {count, plural, one {# color palette} other {# color palettes}} and CSS gradients.",
            { words, count }
          ),
        words => words
      ])
    : fitted(c.title, [
        title =>
          t(
            "{title}: {count, plural, one {# color palette} other {# color palettes}} and CSS gradients on Grabient. Open any palette to edit it, then copy CSS or export SVG and PNG.",
            { title, count }
          )
      ]);
  if (color) meta.description = coded(color.hex, meta.description);
  meta.image = collectionCard(page.slug, origin, c.updatedAt, page.order, page.view);
  meta.imageAlt = t("{title}: a collection of color palettes", { title: c.title });
  meta.markdown = absolute(`/${page.slug}.md`, origin);
  if (c.unlisted) meta.robots = "noindex,follow";
  meta.structuredData.push(
    breadcrumbs(origin, [
      ["Grabient", "/"],
      [t("Collections"), "/collections"],
      [c.title, `/${page.slug}`]
    ])
  );
  return {
    ...(c.tags.length ? { keywords: c.tags.join(", ") } : {}),
    /* the page's own picture of its palettes is its image; the share card stays its link's preview */
    ...(c.count > 0 ? { image: collectionSheet(page.slug, c.updatedAt, origin) } : {}),
    ...(iso(c.createdAt) ? { datePublished: iso(c.createdAt) } : {}),
    ...(iso(c.updatedAt) ? { dateModified: iso(c.updatedAt) } : {})
  };
}

/** A page's metadata in the reader's language, at the site's origin. */
export function pageMeta(page: Page, origin = siteOrigin()): PageMeta {
  const meta: PageMeta = {
    title: t(LISTS.home.title),
    description: t(LISTS.home.description),
    canonical: "",
    robots: "index,follow",
    image: absolute("/grabient.png", origin),
    imageAlt: t("Grabient gradient palette generator"),
    structuredData: []
  };
  /* the canonical address without the language: each page writes its own, its words and its page included */
  let path = "/";
  /* a list's name and what its structured data adds, where it lists palettes */
  let list: { name: string; more?: Record<string, unknown> } | undefined;
  switch (page.kind) {
    case "palette":
      path = palettePage(page, meta, origin);
      break;
    case "examples":
      path = examplesPage(page, meta, origin);
      break;
    case "collection": {
      path = `/${page.slug}${page.order === "rising" ? "/rising" : ""}`;
      const more = collectionPage(page, meta, origin);
      if (page.collection) list = { name: page.collection.title, more };
      break;
    }
    case "home": {
      const name = heading(page);
      path = `/${listQuery(page)}`;
      list = { name };
      if (page.query) {
        /* the home searched says what the palette list's search says, and that one is the page the index keeps */
        meta.title = listTitle(name, page.page);
        meta.description = searchDescription(page.query);
        meta.image = cardUrl("/api/og/query", { query: page.query }, page.view, origin);
        meta.imageAlt = name;
        meta.robots = "noindex,follow";
      } else {
        /* a later page leads with the same hottest palettes as the first: the first is the page the index keeps */
        if ((page.page ?? 1) > 1) {
          meta.title = titled(pagedTitle(name, page.page));
          meta.robots = "noindex,follow";
        }
        /* the home leads with the hottest palettes, so its card is theirs */
        meta.image = cardUrl("/api/og/list", { sort: "hot" }, page.view, origin);
        meta.imageAlt = t("{name} on Grabient", { name });
        if ((page.page ?? 1) === 1) meta.structuredData.push(webApplication(origin));
      }
      break;
    }
    case "list": {
      const name = heading(page);
      path = listPath("/palettes", page.order, page.frame) + listQuery(page);
      list = { name };
      meta.title =
        (page.page ?? 1) > 1 ? titled(pagedTitle(name, page.page)) : t(LISTS[page.order].title);
      meta.description = t(LISTS[page.order].description);
      const order = page.order === "popular" ? { sort: "popular" } : rising(page.frame);
      meta.image = cardUrl("/api/og/list", order, page.view, origin);
      meta.imageAlt = t("{name} on Grabient", { name });
      if (longFrame(page.frame)) meta.robots = "noindex,follow";
      break;
    }
    case "search": {
      const name = heading(page);
      const color = queryColor(page.query);
      path = listPath("/palettes", page.order, page.frame) + listQuery(page);
      list = { name };
      meta.title = listTitle(
        color?.name
          ? t("{subject} gradients and color palettes", {
              subject: `${subjectOf(page.query)} (${color.hex})`
            })
          : name,
        page.page
      );
      meta.description = color
        ? coded(color.hex, searchDescription(page.query))
        : searchDescription(page.query);
      const order = page.order === "rising" ? rising(page.frame) : {};
      meta.image = cardUrl("/api/og/query", { query: page.query, ...order }, page.view, origin);
      meta.imageAlt = name;
      /* the words in the popular order are the page the index keeps; Rising first is the same palettes again. A search
         by a palette is a page every palette mints, which the index never keeps, as its answer says (load.ts) */
      if (page.order === "rising" || decodePalette(page.query)) meta.robots = "noindex,follow";
      break;
    }
    case "collections": {
      const name = heading(page);
      path = listPath("/collections", page.order, page.frame) + listQuery(page);
      if (page.query) {
        /* the words are whatever was typed, and the title repeats them: a page anyone can mint stays out of the index,
           and the collections it finds are reached through its links */
        const like = decodePalette(page.query);
        meta.title = listTitle(name);
        meta.description = like
          ? t(
              "Collections of gradients and color palettes like {name}, by people and Grabient agents.",
              { name: paletteInline(like) }
            )
          : t(
              "Collections of gradients and color palettes for {query}, by people and Grabient agents.",
              { query: page.query }
            );
        meta.robots = "noindex,follow";
      } else {
        meta.title = titled(pagedTitle(name, page.page));
        meta.description =
          page.order === "rising"
            ? t(
                "Collections of gradients and color palettes gaining likes now, from people and Grabient agents. Open any palette to edit and export it."
              )
            : t(
                "Collections of gradients and color palettes by color, theme and use, from people and Grabient agents. Open any palette to edit and export it."
              );
        if (longFrame(page.frame)) meta.robots = "noindex,follow";
      }
      const order = page.order === "rising" ? rising(page.frame) : { sort: "popular" };
      const words: Record<string, string> = page.query ? { q: page.query } : {};
      meta.image = cardUrl("/api/og/collections", { ...order, ...words }, page.view, origin);
      meta.imageAlt = t("Collections of gradients and color palettes on Grabient");
      break;
    }
    case "own-collections":
      path = `/collections/saved${listQuery(page)}`;
      meta.title = titled(t("Your collections"));
      meta.description = t("Your Grabient collections.");
      meta.robots = "noindex,nofollow";
      break;
    case "notfound":
    case "legacy":
      /* the address as it came, unless it is no page at all (a crafted //host/…), which would name another site */
      path = isPagePath(page.path) ? page.path : "/";
      meta.title = titled(page.kind === "legacy" ? t("Palette not found") : t("Page not found"));
      meta.description = t("This page doesn't exist. Browse Grabient for color palettes.");
      meta.robots = "noindex,follow";
      break;
    default: {
      const fixed: (typeof FIXED)[FixedKind] = FIXED[page.kind];
      path = fixed.path;
      meta.title = "named" in fixed ? t(fixed.title) : titled(t(fixed.title));
      meta.description = t(fixed.description);
      if ("robots" in fixed) meta.robots = fixed.robots;
      if ("image" in fixed) {
        meta.image = absolute(
          typeof fixed.image === "function" ? fixed.image() : fixed.image,
          origin
        );
        meta.imageAlt =
          "imageAlt" in fixed
            ? t(fixed.imageAlt)
            : t("{name} on Grabient", { name: t(fixed.title) });
      }
    }
  }
  meta.canonical = pageUrl(path, origin);
  /* a list's later pages hold other palettes under the same words, so each says which page it is */
  const number = "page" in page ? (page.page ?? 1) : 1;
  meta.description =
    number > 1
      ? fitted(meta.description, [
          description => t("{description} Page {page}.", { description, page: number })
        ])
      : clipWords(meta.description);
  if (page.robots) meta.robots = page.robots;
  if (list && page.palettes) {
    /* a palette's page is indexed in English alone: another language's list names none of them */
    const items =
      locale() === DEFAULT_LOCALE
        ? page.palettes.map(address => ({ url: pageUrl(address, origin) }))
        : [];
    meta.structuredData.push(listOf(meta, origin, list.name, items, list.more));
  }
  if (page.kind === "collections" && page.collections) {
    const items = page.collections.map(c => ({
      name: c.title,
      url: pageUrl(`/${c.slug}`, origin)
    }));
    meta.structuredData.push(listOf(meta, origin, untitled(meta.title), items));
  }
  if (origin !== PRODUCTION_ORIGIN) meta.robots = "noindex,nofollow";
  /* the same page in every language where each is indexed; elsewhere another language's copy is for reading alone */
  const indexed = !meta.robots.startsWith("noindex");
  const readsIn =
    page.kind === "collection" ? (page.collection?.languages ?? []).filter(isLocale) : [];
  if (translatedPage(page)) {
    if (indexed) meta.alternates = alternatesOf(path, origin);
  } else if (readsIn.length && (locale() === DEFAULT_LOCALE || readsIn.includes(locale()))) {
    if (indexed) meta.alternates = alternatesOf(path, origin, [DEFAULT_LOCALE, ...readsIn]);
  } else if (locale() !== DEFAULT_LOCALE && indexed) meta.robots = "noindex,follow";
  return meta;
}

/** A list's own structured data: the page, and up to 96 of what it lists where it names any. */
function listOf(
  meta: PageMeta,
  origin: string,
  name: string,
  items: readonly { url: string; name?: string }[],
  more: Record<string, unknown> = {}
) {
  return {
    "@context": SCHEMA,
    "@type": "CollectionPage",
    name,
    inLanguage: LOCALE_INFO[locale()].tag,
    url: meta.canonical,
    description: meta.description,
    image: meta.image,
    ...more,
    isPartOf: website(origin),
    ...(items.length
      ? {
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: items.length,
            itemListElement: items.slice(0, 96).map((item, i) => ({
              "@type": "ListItem",
              position: i + 1,
              ...item
            }))
          }
        }
      : {})
  };
}

/** A route's `head` for its metadata. Its tags take the place of the root's where both name one. */
export function headOf(meta: PageMeta) {
  return {
    meta: [
      { title: meta.title },
      { name: "description", content: meta.description },
      { name: "robots", content: meta.robots },
      { name: "theme-color", content: meta.themeColor ?? "#0c0c0e" },
      { property: "og:title", content: meta.title },
      { property: "og:description", content: meta.description },
      { property: "og:url", content: meta.canonical },
      { property: "og:image", content: meta.image },
      { property: "og:image:secure_url", content: meta.image },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: String(CARD_SIZE.width) },
      { property: "og:image:height", content: String(CARD_SIZE.height) },
      { property: "og:image:alt", content: meta.imageAlt },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: meta.title },
      { name: "twitter:description", content: meta.description },
      { name: "twitter:image", content: meta.image },
      { name: "twitter:image:alt", content: meta.imageAlt },
      {
        "script:ld+json": [
          ...siteStructuredData(new URL(meta.canonical).origin),
          ...meta.structuredData
        ]
      }
    ],
    links: [
      { rel: "canonical", href: meta.canonical },
      ...(meta.alternates ?? []).map(alt => ({
        rel: "alternate",
        hreflang: alt.hreflang,
        href: alt.href
      })),
      ...(meta.markdown
        ? [
            {
              rel: "alternate",
              type: "text/markdown",
              href: meta.markdown,
              title: t("This page as Markdown")
            }
          ]
        : [])
    ]
  };
}

/** A route's `head` for a page, at the site's origin: `head: () => pageHead({ kind: "about" })`. */
export const pageHead = (page: Page) => headOf(pageMeta(page));
