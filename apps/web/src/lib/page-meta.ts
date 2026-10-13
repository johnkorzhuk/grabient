import { decodePalette, type Palette, sampleStops } from "@grabient/engine";
import { readingName, readingPhrase, readPalette } from "@grabient/engine/name.ts";
import {
  DEFAULT_ANGLE,
  DEFAULT_STEPS,
  DEFAULT_STYLE,
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
  t
} from "@grabient/i18n";

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
/** The version of what share cards draw. A change to a card's picture takes a new one, so no cache keeps the old. */
export const OG_VERSION = "k4";
/** Grabient's code. */
export const GITHUB_REPO = "https://github.com/johnkorzhuk/grabient";

export type Order = "popular" | "rising";
export type Frame = "1w" | "3m" | "1y";
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
/** What a page's data adds to its address. */
interface Facts {
  /** the server's word on a page the index leaves out: a search the vocabulary cannot read, a page past the last */
  robots?: string;
  /** the palettes the page lists, by seed, in its order */
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
    | { kind: "list"; order: Order; frame?: Frame; page?: number; limit?: number; view?: ListView }
    | {
        kind: "search";
        query: string;
        order: Order;
        frame?: Frame;
        page?: number;
        limit?: number;
        view?: ListView;
      }
    | {
        kind: "collections";
        order: Order;
        frame?: Frame;
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
        kind: "palette";
        seed: string;
        palette: Palette;
        view: Pick<View, "style" | "steps" | "angle">;
        /** the words written for it that its colors bear out, in English, where they are written */
        written?: { title?: string; description?: string };
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
  /** the page as Markdown, for an agent that reads rather than looks: a palette's and a collection's */
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

/** A palette's own address: its seed at the default view, with its stop count where its keyframes raise it past the
    default (an eight-keyframe palette is /seed?steps=8, since /seed leads there). Canonicals, sitemaps and lists'
    structured data name it, so none of them names a redirect. */
export function paletteAddress(seed: string): string {
  const steps = Math.max(DEFAULT_STEPS, decodePalette(seed)?.anchors.length ?? 0);
  return `/${seed}${viewSearch({ style: DEFAULT_STYLE, steps, angle: DEFAULT_ANGLE })}`;
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
const longFrame = (frame?: Frame) => !!frame && frame !== "1w";
const listPath = (base: string, order: Order, frame?: Frame) =>
  order === "popular" ? base : `${base}/rising${longFrame(frame) ? `/${frame}` : ""}`;

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
/** The same name inside a sentence: "Palettes like navy to lavender". */
const paletteInline = (P: Palette) => readingPhrase(readPalette(P), language());
/** What a search is for, as a page says it: its words, or the name of the palette it searches by. */
export function searchedFor(query: string): string {
  const like = decodePalette(query);
  return like ? paletteInline(like) : query;
}
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
    named: true
  },
  bindings: {
    path: "/bindings",
    title: msg("Keyboard shortcuts"),
    description: msg(
      "Every keyboard shortcut in Grabient: theme, copy URL, undo and redo, random palette, invert, reverse, steps and more. Press one on the page to change it."
    )
  },
  mcp: {
    path: "/mcp-server",
    // the protocol's name, in every language
    title: "MCP",
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
  { path: string; title: string; description: string; named?: true; robots?: string }
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
/** Whether a page's copy in each language is indexed and names the others: the language menu follows its links. */
export const translatedPage = (page: Page) =>
  TRANSLATED.has(page.kind) && !("query" in page && page.query);

const pagedTitle = (title: string, page = 1) =>
  page > 1 ? t("{title}, page {page}", { title, page }) : title;
/** A page's heading, for a reader who listens and for a crawler: what its title says, without the site's name. A
    palette's is its written title in English, else what its colors are called in its style. */
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
        (locale() === DEFAULT_LOCALE && page.written?.title) ||
        t("{name} {style}", {
          name: paletteName(page.palette, page.view),
          style: t(STYLE_WORDS[page.view.style])
        })
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
  url.searchParams.set("v", OG_VERSION);
  for (const key of ["style", "steps", "angle"] as const) {
    const value = view?.[key];
    if (value != null && value !== "auto") url.searchParams.set(key, String(value));
  }
  if (changed) url.searchParams.set("t", String(changed));
  return url.toString();
}
/** A list's card is drawn in its page's order: Rising's with its frame when that is not the week's. */
const rising = (frame?: Frame): Record<string, string> => ({
  sort: "rising",
  ...(longFrame(frame) ? { frame: frame as string } : {})
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

const SCHEMA = "https://schema.org";
const website = (origin: string) => ({
  "@type": "WebSite",
  name: "Grabient",
  url: pageUrl("/", origin)
});
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

/** What the site is, on every page: the site and its search, the app, and the organization behind it. */
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

/** A palette's page: titled by its written words in English, else by what its colors are called, and described by them
    with its colors, which no other palette shares, so two palettes described alike still read apart. */
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
  const written = locale() === DEFAULT_LOCALE ? page.written : undefined;
  const path = paletteAddress(seed);
  meta.title = titled(heading(page));
  /* every color where they all fit, else some from end to end */
  const spread = (count: number) =>
    Array.from(
      { length: count },
      (_, i) => hexes[Math.round((i * (hexes.length - 1)) / (count - 1))]
    ).join(", ");
  const counts = [...new Set([Math.min(hexes.length, 8), 5, 3])].filter(n => n <= hexes.length);
  meta.description = fitted(
    written?.description ??
      t("{name} palette with {steps, plural, one {# color} other {# colors}}.", {
        name,
        steps: view.steps
      }),
    [
      ...counts.map(
        n => (words: string) =>
          t("{words} {hexes}. Edit and export CSS, SVG, PNG or a shader.", {
            words,
            hexes: spread(n)
          })
      ),
      ...counts.map(n => (words: string) => t("{words} {hexes}.", { words, hexes: spread(n) }))
    ]
  );
  meta.image = absolute(
    `/api/og?seed=${seed}&v=${OG_VERSION}${viewSearch(view).replace("?", "&")}`,
    origin
  );
  meta.imageAlt = t("{name} color palette", { name });
  meta.themeColor = hexes[0];
  meta.markdown = absolute(`/${seed}.md${viewSearch(view)}`, origin);
  const title = untitled(meta.title);
  const held = page.heldBy ?? [];
  meta.structuredData.push(
    {
      "@context": SCHEMA,
      "@type": "CreativeWork",
      name: title,
      inLanguage: LOCALE_INFO[locale()].tag,
      url: pageUrl(path, origin),
      image: meta.image,
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
  const counted = titled(
    t("{title}: {count, plural, one {# color palette} other {# color palettes}}", {
      title: c.title,
      count: c.count
    })
  );
  meta.title = c.count > 0 && counted.length <= 62 ? counted : titled(c.title);
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
        meta.title = titled(pagedTitle(name, page.page));
        meta.description = searchDescription(page.query);
        meta.image = cardUrl("/api/og/query", { query: page.query }, page.view, origin);
        meta.imageAlt = name;
        meta.robots = "noindex,follow";
      } else {
        if ((page.page ?? 1) > 1) meta.title = titled(pagedTitle(name, page.page));
        /* the home leads with the hottest palettes, so its card is theirs */
        meta.image = cardUrl("/api/og/list", { sort: "hot" }, page.view, origin);
        meta.imageAlt = t("{name} on Grabient", { name });
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
      path = listPath("/palettes", page.order, page.frame) + listQuery(page);
      list = { name };
      meta.title = titled(pagedTitle(name, page.page));
      meta.description = searchDescription(page.query);
      const order = page.order === "rising" ? rising(page.frame) : {};
      meta.image = cardUrl("/api/og/query", { query: page.query, ...order }, page.view, origin);
      meta.imageAlt = name;
      /* the words in the popular order are the page the index keeps; Rising first is the same palettes again */
      if (page.order === "rising") meta.robots = "noindex,follow";
      break;
    }
    case "collections": {
      const name = heading(page);
      path = listPath("/collections", page.order, page.frame) + listQuery(page);
      if (page.query) {
        /* the words are whatever was typed, and the title repeats them: a page anyone can mint stays out of the index,
           and the collections it finds are reached through its links */
        const like = decodePalette(page.query);
        meta.title = titled(name);
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
    const items = page.palettes.map(seed => ({ url: pageUrl(paletteAddress(seed), origin) }));
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

/** A list's own structured data: the page, and up to 96 of what it lists. */
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
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.slice(0, 96).map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        ...item
      }))
    }
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
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
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
