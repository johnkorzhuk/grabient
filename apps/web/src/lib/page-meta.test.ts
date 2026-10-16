import { decodePalette } from "@grabient/engine";
import { parseView } from "@grabient/engine/view.ts";
import {
  addCatalog,
  type Catalog,
  delocalizePath,
  LOCALES,
  type Locale,
  setLocaleSource,
  translate
} from "@grabient/i18n";
import { buildCatalogs } from "@grabient/i18n/vite.ts";
import { beforeEach, describe, expect, test, vi } from "vitest";
import golden from "./fixtures/page-meta.json" with { type: "json" };
import type { RisingFrame } from "./orders.ts";
import {
  clipWords,
  DESCRIPTION_MAX,
  heading,
  headOf,
  type Page,
  type PageMeta,
  type PaletteView,
  PRODUCTION_ORIGIN,
  pageMeta,
  relTo,
  setOriginSource,
  siteOrigin
} from "./page-meta.ts";

for (const [locale, file] of buildCatalogs())
  addCatalog(locale, JSON.parse(file.source) as Catalog);
let current: Locale = "en";
setLocaleSource(() => current);
beforeEach(() => {
  current = "en";
});

type Facts = {
  /** each in the view its card links: the default unless named */
  items?: ({ seed: string } & Partial<PaletteView>)[];
  collections?: { slug: string; title: string }[];
  collection?: Extract<Page, { kind: "collection" }>["collection"];
  title?: string;
  description?: string;
  /** the view a palette was saved in, which its written words describe: the address's own where words are written
      and none is named */
  saved?: PaletteView;
  heldBy?: { slug: string; title: string }[];
  staticOg?: boolean;
  robots?: string;
  path?: string;
};
const FIXED: Record<string, Page["kind"]> = {
  "/about": "about",
  "/bindings": "bindings",
  "/mcp-server": "mcp",
  "/newsletter": "newsletter",
  "/privacy": "privacy",
  "/terms": "terms",
  "/contact": "contact",
  "/login": "login",
  "/connect": "connect",
  "/settings": "settings"
};

/** A page as its route would describe it, from an address and the facts its data brought. */
function pageOf(address: string, facts: Facts = {}): Page {
  const url = new URL(address, PRODUCTION_ORIGIN);
  const query = url.searchParams.get("q") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? 1);
  const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : undefined;
  const [first, second, third] = url.pathname.split("/").slice(1);
  const common = {
    robots: facts.robots,
    palettes: facts.items?.map(item => ({
      style: "linearGradient" as const,
      steps: 7,
      angle: 90,
      ...item
    })),
    collections: facts.collections
  };
  const order = second === "rising" ? "rising" : "popular";
  const frame = third as RisingFrame | undefined;
  if (url.pathname === "/") return { kind: "home", query, page, ...common };
  if (first === "palettes" && second === "saved") return { kind: "saved", query, ...common };
  if (first === "palettes") {
    return query
      ? { kind: "search", query, order, frame, page, limit, ...common }
      : { kind: "list", order, frame, page, limit, ...common };
  }
  if (first === "collections" && second === "saved") {
    return { kind: "own-collections", query, page, limit, ...common };
  }
  if (first === "collections") {
    return { kind: "collections", order, frame, query, page, limit, ...common };
  }
  if (url.pathname in FIXED) return { kind: FIXED[url.pathname], ...common } as Page;
  if (first === "unsubscribe") return { kind: "unsubscribe" };
  const palette = decodePalette(first);
  if (palette && !second) {
    const parsed = parseView(url.searchParams);
    const view = { ...parsed, steps: Math.max(parsed.steps, palette.anchors.length) };
    const words = !!(facts.title || facts.description);
    // words are written only for a palette something saved
    const saved = facts.saved ?? (words ? view : undefined);
    const written =
      words && saved
        ? {
            title: facts.title?.replace(/ \| Grabient$/, "") ?? "",
            description: facts.description,
            view: saved
          }
        : undefined;
    return {
      kind: "palette",
      seed: first,
      palette,
      view,
      ...(saved ? { saved } : {}),
      written,
      heldBy: facts.heldBy,
      ...common
    };
  }
  if (/^[a-z0-9-]+$/.test(first) && (!second || second === "rising") && !third) {
    return { kind: "collection", slug: first, order, collection: facts.collection, ...common };
  }
  return { kind: "notfound", path: facts.path ?? address };
}

const summary = (meta: PageMeta) => ({
  title: meta.title,
  description: meta.description,
  canonical: meta.canonical,
  robots: meta.robots,
  image: meta.image,
  imageAlt: meta.imageAlt,
  ...(meta.themeColor ? { themeColor: meta.themeColor } : {}),
  ...(meta.markdown ? { markdown: meta.markdown } : {}),
  alternates: meta.alternates
    ? `${meta.alternates.length} (${meta.alternates.map(alt => alt.hreflang).join(" ")})`
    : null,
  structuredData: meta.structuredData.map(data => data["@type"])
});

describe("every page's metadata, as grabient.com serves it", () => {
  test.each(golden.map(row => [`${row.locale} ${row.path}`, row] as const))("%s", (_, row) => {
    current = row.locale as Locale;
    const { locale, path, facts, descriptionLength, stagingRobots, factsSent, icon, ...expected } =
      row as typeof row & { themeColor?: string; markdown?: string };
    const meta = pageMeta(pageOf(path, facts as Facts), PRODUCTION_ORIGIN);
    // the title says what the page says: an address that is no page is a page that isn't found
    if (expected.title === "Palette not found | Grabient")
      expected.title = "Page not found | Grabient";
    // no build draws cards ahead now: every palette's card is drawn once at /api/og and kept
    if ((facts as Facts).staticOg)
      expected.image = expected.image.replace(/\/og\/k4\/(\w+)\.png$/, "/api/og?seed=$1&v=k4");
    expect(summary(meta)).toEqual(expected);
    expect(meta.description.length).toBe(descriptionLength);
  });
});

describe("only grabient.com is indexed", () => {
  const hosts = [
    "https://staging.grabient.com",
    "https://seo-grabient-staging.jkorzhuk.workers.dev",
    "http://localhost:5173"
  ];
  test.each(hosts)("%s says noindex,nofollow on every page and names no other language", origin => {
    for (const row of golden) {
      current = row.locale as Locale;
      const meta = pageMeta(pageOf(row.path, row.facts as Facts), origin);
      expect([row.path, meta.robots]).toEqual([row.path, "noindex,nofollow"]);
      expect(meta.alternates).toBeUndefined();
      expect(meta.canonical.startsWith(`${origin}/`)).toBe(true);
    }
  });
});

describe("descriptions", () => {
  /* the site's own pages, and the later pages of its lists */
  const own = [
    "/",
    "/palettes",
    "/palettes/rising",
    "/collections",
    "/collections/rising",
    "/about",
    "/bindings",
    "/mcp-server",
    "/newsletter",
    "/contact",
    "/privacy",
    "/terms"
  ];
  const later = [
    "/?page=2",
    "/?page=3",
    "/palettes?page=2",
    "/palettes?page=12",
    "/palettes/rising?page=2",
    "/collections?page=2",
    "/collections/rising?page=2",
    "/palettes?q=blue&page=2"
  ];
  /* palettes as agents wrote them on staging: short, two sentences, one long sentence, and two given the same words */
  const twin =
    "This palette moves from dark gray to gray. It steadily lightens across a narrow lightness range, combining near-neutral color with gentle contrast.";
  const palettes: [string, Facts][] = [
    ["/kS7Q8Yy5S_SChv0", {}],
    [
      "/kUVWLxQ8zCNfDRHtP8cA",
      {
        description:
          "The Plum, crimson and ochre neon palette brings together magenta, red, and gold."
      }
    ],
    [
      "/kUYS-nyUXCl-3PT1NLqg",
      {
        description:
          "The Teal and cobalt blue color palette brings together blue and teal. The colors span a broad lightness range, combining strong color with clear contrast."
      }
    ],
    [
      "/kW8DU9dAhDG8NTZrIEFZyg_Y",
      {
        description:
          "The Cream, near-black and teal color palette brings together pale yellow, light yellow, orange, red, dark red, black, teal, and green tones."
      }
    ],
    ["/kSMQbGJYI_q4CwC", { description: twin }],
    ["/kSLAXFowI_6oDQA", { description: twin }]
  ];
  const collection = (description: string, count = 25, title = "Ocean gradients"): Facts => ({
    collection: { title, description, tags: [], count, createdAt: 0, updatedAt: 0 }
  });
  const collections: [string, Facts][] = [
    ["/ocean-gradients", collection("")],
    ["/ocean-gradients-2", collection("", 1, "Ocean gradients 2")],
    [
      "/cyan-gradients",
      collection(
        "Cyan-centered ramps combine turquoise water, clear sky blue, cool mist, and deeper blue endpoints.",
        16
      )
    ],
    [
      "/navy-and-gold",
      collection(
        "Deep navy and midnight blue run through muted teal and plum into amber, ochre, and pale gold highlights.",
        18
      )
    ],
    [
      "/liminal-hours",
      collection(
        "Twenty gradients for the in-between moments: blue hour, fog lifting, the last light on a lake, neon rain. Ordered loosely from before dawn through the deepest night.",
        21
      )
    ],
    [
      "/theater",
      collection(
        "Crimson drapery, red roses, burnished gilt, candlelit cream, jewel-toned costumes, and cabaret-dark shadows shape opulent vintage-theater palettes for dramatic gatherings."
      )
    ]
  ];
  const pages: [string, Facts][] = [
    ...own.map(path => [path, {}] as [string, Facts]),
    ...later.map(path => [path, {}] as [string, Facts]),
    ["/palettes?q=blue", {}],
    ["/palettes?q=warm+sunset", {}],
    ...palettes,
    ...collections
  ];
  const describe = (path: string, facts: Facts = {}) =>
    pageMeta(pageOf(path, facts), PRODUCTION_ORIGIN).description;

  test("every page in every language fits 160 characters and says what no other page says; in English at least 120", () => {
    for (const locale of LOCALES) {
      current = locale;
      const seen = new Map<string, string>();
      for (const [path, facts] of pages) {
        const text = describe(path, facts);
        expect(text.length, `${locale} ${path}: ${text}`).toBeLessThanOrEqual(DESCRIPTION_MAX);
        expect(seen.get(text), `${locale}: ${path} says what another page says`).toBeUndefined();
        seen.set(text, path);
        if (locale === "en") expect(text.length, `${path}: ${text}`).toBeGreaterThanOrEqual(120);
      }
    }
  });

  test("every language says each of the site's own pages whole", () => {
    for (const path of own) {
      const english = describe(path);
      for (const locale of LOCALES) {
        const text = translate(locale, english);
        expect(text.length, `${locale} ${path}: ${text}`).toBeLessThanOrEqual(DESCRIPTION_MAX);
      }
    }
  });

  test("a palette says its words, then its colors from end to end", () => {
    const [first, second] = ["/kSMQbGJYI_q4CwC", "/kSLAXFowI_6oDQA"].map(path =>
      describe(path, { description: twin })
    );
    for (const text of [first, second]) {
      expect(text.startsWith("This palette moves from dark gray to gray. #")).toBe(true);
    }
    expect(first).not.toBe(second);
    expect(describe(...palettes[1])).toMatch(
      /^The Plum, crimson and ochre neon palette brings together magenta, red, and gold\. (#[0-9a-f]{6}, )+#[0-9a-f]{6}\. Edit and export CSS, SVG, PNG or a shader\.$/
    );
    const own = describe("/kS7Q8Yy5S_SChv0");
    expect(own).toMatch(
      /^.+ palette with 7 colors\. (#[0-9a-f]{6}, )+#[0-9a-f]{6}\. Edit and export CSS, SVG, PNG or a shader\.$/
    );
    const hexes = own.match(/#[0-9a-f]{6}/g)!;
    expect([hexes[0], hexes.at(-1)]).toEqual(["#f6e4e0", "#46070b"]);
  });

  test("a collection says its words, then what it holds while that fits; one with none, its title", () => {
    const by = (path: string) => describe(...collections.find(([at]) => at === path)!);
    expect(by("/cyan-gradients")).toBe(
      "Cyan-centered ramps combine turquoise water, clear sky blue, cool mist, and deeper blue endpoints. 16 color palettes and CSS gradients."
    );
    expect(by("/liminal-hours")).toBe(
      "Twenty gradients for the in-between moments: blue hour, fog lifting, the last light on a lake, neon rain. 21 color palettes and CSS gradients."
    );
    expect(by("/ocean-gradients")).toBe(
      "Ocean gradients: 25 color palettes and CSS gradients on Grabient. Open any palette to edit it, then copy CSS or export SVG and PNG."
    );
    expect(by("/theater").endsWith("…")).toBe(true);
  });

  test("a list's later pages each say which page they are", () => {
    expect(describe("/palettes?page=2")).toBe(`${describe("/palettes")} Page 2.`);
    expect(describe("/collections/rising")).not.toBe(describe("/collections"));
  });

  test("words are cut after a sentence or a word, never inside one", () => {
    const words = "One sentence that is long enough to stand on its own. ".repeat(4);
    expect(clipWords(words)).toBe(
      "One sentence that is long enough to stand on its own. One sentence that is long enough to stand on its own."
    );
    const run = "word ".repeat(40);
    expect(clipWords(run)).toBe(`${"word ".repeat(32).trim()}…`);
    expect(clipWords("x".repeat(200))).toBe(`${"x".repeat(159)}…`);
  });
});

describe("a palette's written words", () => {
  const facts: Facts = {
    title: "Pastel candy vertical bands | Grabient",
    description:
      "Soft candy colors stand in vertical bands, from blush through lilac to a pale mint.",
    saved: { style: "linearSwatches", steps: 9, angle: 90 }
  };
  const named = (address: string) => {
    const page = pageOf(address, facts);
    const meta = pageMeta(page, PRODUCTION_ORIGIN);
    const work = meta.structuredData.find(data => data["@type"] === "CreativeWork");
    return {
      heading: heading(page),
      title: meta.title,
      description: meta.description,
      name: work?.name,
      alternateName: work?.alternateName
    };
  };

  test("name and describe its page while it is drawn as it was saved, at any angle, what its colors call it beside them", () => {
    expect(named("/kS7Q8Yy5S_SChv0?style=linearSwatches&steps=9&angle=45").heading).toBe(
      "Pastel candy vertical bands"
    );
    const own = named("/kS7Q8Yy5S_SChv0?style=linearSwatches&steps=9");
    expect(own).toMatchObject({
      heading: "Pastel candy vertical bands",
      title: "Pastel candy vertical bands | Grabient",
      name: "Pastel candy vertical bands",
      alternateName: expect.stringMatching(/^\S.* linear swatches$/)
    });
    expect(own.description).toMatch(/^Soft candy colors stand in vertical bands/);
  });

  test.each([
    ["another style", "/kS7Q8Yy5S_SChv0?style=radialSwatches&steps=9"],
    ["other steps", "/kS7Q8Yy5S_SChv0?style=linearSwatches&steps=10"],
    ["the default view", "/kS7Q8Yy5S_SChv0"]
  ])("give way to what its colors call it in %s", (_, address) => {
    const other = named(address);
    expect(other.heading).not.toMatch(/candy/i);
    expect(other.title).toBe(`${other.heading} | Grabient`);
    expect(other.name).toBe(other.heading);
    expect(other.alternateName).toBeUndefined();
    expect(other.description).toMatch(/^.+ palette with \d+ colors\. #/);
  });

  test("stand at the one address its page names from every view: the view it was saved in", () => {
    const own = "https://grabient.com/kS7Q8Yy5S_SChv0?style=linearSwatches&steps=9";
    for (const address of [
      "/kS7Q8Yy5S_SChv0",
      "/kS7Q8Yy5S_SChv0?style=radialSwatches&steps=9&angle=30",
      "/kS7Q8Yy5S_SChv0?style=linearSwatches&steps=9&angle=45",
      "/kS7Q8Yy5S_SChv0?style=linearSwatches&steps=9"
    ]) {
      const meta = pageMeta(pageOf(address, facts), PRODUCTION_ORIGIN);
      const work = meta.structuredData.find(data => data["@type"] === "CreativeWork");
      expect([address, meta.canonical, work?.url]).toEqual([address, own, own]);
    }
    const there = pageOf("/kS7Q8Yy5S_SChv0?style=linearSwatches&steps=9", facts);
    expect(pageMeta(there, PRODUCTION_ORIGIN).title).toBe("Pastel candy vertical bands | Grabient");
  });

  test("name its page in English alone", () => {
    current = "fr";
    expect(named("/kS7Q8Yy5S_SChv0?style=linearSwatches&steps=9").heading).not.toMatch(/candy/i);
  });
});

describe("a palette's own address", () => {
  const canonical = (address: string) => pageMeta(pageOf(address), PRODUCTION_ORIGIN).canonical;

  test("is its default view where nothing saved it, its stop count never under its keyframes", () => {
    expect(canonical("/kS7Q8Yy5S_SChv0?style=radialSwatches&steps=9&angle=30")).toBe(
      "https://grabient.com/kS7Q8Yy5S_SChv0"
    );
    expect(canonical("/kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ?style=linearSwatches")).toBe(
      "https://grabient.com/kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ?steps=8"
    );
  });

  test("is the address a list's card links, which the list's structured data names", () => {
    const meta = pageMeta(
      pageOf("/palettes", {
        items: [
          { seed: "kS7Q8Yy5S_SChv0", style: "linearSwatches", steps: 9, angle: 45 },
          { seed: "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ" }
        ]
      }),
      PRODUCTION_ORIGIN
    );
    const list = meta.structuredData.find(data => data["@type"] === "CollectionPage") as {
      mainEntity: { itemListElement: { url: string }[] };
    };
    expect(list.mainEntity.itemListElement.map(item => item.url)).toEqual([
      "https://grabient.com/kS7Q8Yy5S_SChv0?style=linearSwatches&steps=9&angle=45",
      "https://grabient.com/kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ?steps=8"
    ]);
  });
});

describe("structured data", () => {
  const typesOf = (meta: PageMeta) => meta.structuredData.map(data => data["@type"]);

  test("says the app is free on the home alone", () => {
    expect(typesOf(pageMeta(pageOf("/"), PRODUCTION_ORIGIN))).toEqual(["WebApplication"]);
    for (const address of ["/?page=2", "/?q=blue", "/palettes", "/about", "/kS7Q8Yy5S_SChv0"]) {
      const types = typesOf(pageMeta(pageOf(address), PRODUCTION_ORIGIN));
      expect([address, types.includes("WebApplication")]).toEqual([address, false]);
    }
  });

  test("names the site a page is part of by its one WebSite", () => {
    current = "ja";
    const meta = pageMeta(
      pageOf("/palettes", { items: [{ seed: "kS7Q8Yy5S_SChv0" }] }),
      PRODUCTION_ORIGIN
    );
    const list = meta.structuredData.find(data => data["@type"] === "CollectionPage");
    expect(list?.isPartOf).toEqual({ "@id": "https://grabient.com/#website" });
    // another language's list names none of the palettes' pages, which are indexed in English alone
    expect(list?.mainEntity).toBeUndefined();
    current = "en";
    const english = pageMeta(
      pageOf("/palettes", { items: [{ seed: "kS7Q8Yy5S_SChv0" }] }),
      PRODUCTION_ORIGIN
    );
    expect(
      english.structuredData.find(data => data["@type"] === "CollectionPage")?.mainEntity
    ).toMatchObject({
      numberOfItems: 1
    });
    const work = pageMeta(pageOf("/kS7Q8Yy5S_SChv0"), PRODUCTION_ORIGIN).structuredData.find(
      data => data["@type"] === "CreativeWork"
    );
    expect(work?.isPartOf).toEqual([{ "@id": "https://grabient.com/#website" }]);
  });
});

describe("a link's rel", () => {
  const ja = (languages: string[]): Facts => ({
    collection: {
      title: "Ocean",
      description: "",
      tags: [],
      count: 3,
      createdAt: 0,
      updatedAt: 0,
      languages
    }
  });
  /* addresses as the site's links write them, in a language, with the facts a collection's page reads */
  const links: [string, Facts?][] = [
    ["/"],
    ["/?q=blue"],
    ["/?page=2"],
    ["/palettes"],
    ["/palettes?page=2"],
    ["/palettes/rising"],
    ["/palettes/rising/3m"],
    ["/palettes?q=blue"],
    ["/palettes?q=kS7Q8Yy5S_SChv0&style=linearSwatches"],
    ["/palettes/rising?q=blue"],
    ["/palettes/saved"],
    ["/collections"],
    ["/collections/rising"],
    ["/collections/rising/1y"],
    ["/collections?q=blue"],
    ["/collections/saved"],
    ["/kS7Q8Yy5S_SChv0?style=linearSwatches&steps=9"],
    ["/ocean-gradients"],
    ["/ocean-gradients/rising"],
    ["/about"],
    ["/bindings"],
    ["/mcp-server"],
    ["/newsletter"],
    ["/privacy"],
    ["/terms"],
    ["/contact"],
    ["/login"],
    ["/connect"],
    ["/settings"],
    ["/unsubscribe/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    ["/ja"],
    ["/ja/?page=2"],
    ["/ja/palettes"],
    ["/ja/palettes/rising"],
    ["/ja/palettes?q=blue"],
    ["/ja/collections"],
    ["/ja/kS7Q8Yy5S_SChv0"],
    ["/ja/ocean-gradients", ja(["ja", "de"])],
    ["/ja/ocean-gradients", ja([])],
    ["/de/ocean-gradients", ja(["ja"])],
    ["/ja/ocean-gradients/rising", ja(["ja"])],
    ["/ja/about"],
    ["/ja/privacy"],
    ["/ja/terms"],
    ["/ja/newsletter"],
    ["/ja/settings"]
  ];

  test("is nofollow exactly where production keeps the page it leads to out of the index", () => {
    for (const [address, facts] of links) {
      const { locale, path } = delocalizePath(address);
      current = locale;
      const { robots } = pageMeta(pageOf(path, facts), PRODUCTION_ORIGIN);
      expect([address, relTo(address, facts?.collection?.languages)]).toEqual([
        address,
        robots.startsWith("index") ? undefined : "nofollow"
      ]);
    }
  });

  test("leads a crawler past a page's files, and to a collection whose languages are not known", () => {
    for (const file of [
      "/kS7Q8Yy5S_SChv0.png?steps=9",
      "/kS7Q8Yy5S_SChv0.json",
      "/ocean-gradients.md"
    ])
      expect([file, relTo(file)]).toEqual([file, "nofollow"]);
    expect(relTo("/ja/ocean-gradients")).toBeUndefined();
    expect(relTo("/ja/@ada/warm-sunsets")).toBe("nofollow");
  });
});

describe("a page's limit and its canonical", () => {
  test("a list at another page size names that size; the default size names none", () => {
    const canonical = (address: string) => pageMeta(pageOf(address), PRODUCTION_ORIGIN).canonical;
    expect(canonical("/palettes?page=2&limit=48")).toBe(
      "https://grabient.com/palettes?page=2&limit=48"
    );
    expect(canonical("/palettes?page=2&limit=24")).toBe("https://grabient.com/palettes?page=2");
    expect(canonical("/palettes?q=blue&limit=96")).toBe(
      "https://grabient.com/palettes?q=blue&limit=96"
    );
    expect(canonical("/collections?page=2&limit=12")).toBe(
      "https://grabient.com/collections?page=2&limit=12"
    );
  });
});

describe("the head a route gives", () => {
  test("names every tag once, with the site's structured data before the page's", () => {
    const head = headOf(pageMeta(pageOf("/kS7Q8Yy5S_SChv0"), PRODUCTION_ORIGIN));
    const named = head.meta.flatMap(tag =>
      "name" in tag ? [tag.name] : "property" in tag ? [tag.property] : []
    );
    expect(new Set(named).size).toBe(named.length);
    expect(named).toEqual(
      expect.arrayContaining(["description", "robots", "og:url", "og:image:alt", "twitter:card"])
    );
    const data = head.meta.find(tag => "script:ld+json" in tag) as {
      "script:ld+json": { "@type": string }[];
    };
    expect(data["script:ld+json"].map(item => item["@type"])).toEqual([
      "WebSite",
      "Organization",
      "CreativeWork",
      "BreadcrumbList"
    ]);
    expect(head.links).toEqual([
      { rel: "canonical", href: "https://grabient.com/kS7Q8Yy5S_SChv0" },
      {
        rel: "alternate",
        type: "text/markdown",
        href: "https://grabient.com/kS7Q8Yy5S_SChv0.md",
        title: "This page as Markdown"
      }
    ]);
  });

  test("names the page in every language where each is indexed", () => {
    current = "ja";
    const head = headOf(pageMeta(pageOf("/palettes"), PRODUCTION_ORIGIN));
    const alternates = head.links.filter(link => "hreflang" in link);
    expect(alternates).toHaveLength(17);
    expect(alternates[7]).toEqual({
      rel: "alternate",
      hreflang: "ja",
      href: "https://grabient.com/ja/palettes"
    });
    expect(alternates.at(-1)).toEqual({
      rel: "alternate",
      hreflang: "x-default",
      href: "https://grabient.com/palettes"
    });
  });
});

describe("the origin a page's addresses name", () => {
  test("on the server, the deploy's own for the request", () => {
    setOriginSource(() => "https://staging.grabient.com");
    expect(siteOrigin()).toBe("https://staging.grabient.com");
    expect(pageMeta(pageOf("/about")).canonical).toBe("https://staging.grabient.com/about");
  });

  test("in the browser, the one the server wrote into the first page's canonical link, wherever the page is read", () => {
    let canonical: string | null = null;
    vi.stubGlobal("location", { origin: "https://www.grabient.com" });
    vi.stubGlobal("document", {
      querySelector: () => (canonical ? { getAttribute: () => canonical } : null)
    });
    try {
      // a page with no canonical yet names its own origin, and nothing is remembered
      expect(siteOrigin()).toBe("https://www.grabient.com");
      canonical = "https://grabient.com/ja/palettes";
      expect(siteOrigin()).toBe("https://grabient.com");
      canonical = "https://elsewhere.test/";
      expect(siteOrigin()).toBe("https://grabient.com");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

test("every kind of page, in every language, fits its description in 160 characters", () => {
  const P = decodePalette("kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ")!;
  const facts = {
    title: "A collection whose title runs long enough to fill a search result's line",
    description: "Every gradient a long winter night shows. ".repeat(6),
    tags: ["night", "winter"],
    count: 100,
    createdAt: 1,
    updatedAt: 2
  };
  const kinds = new Set<Page["kind"]>();
  const pages: Page[] = [
    { kind: "home" },
    { kind: "home", page: 999_999 },
    { kind: "home", query: "warm sunset gradients with a long tail of words", page: 12 },
    { kind: "home", query: "kS7Q8Yy5S_SChv0" },
    { kind: "list", order: "popular", page: 1_000_000 },
    { kind: "list", order: "rising", frame: "1y", page: 2 },
    { kind: "search", query: "x".repeat(100), order: "rising", frame: "3m", page: 40 },
    { kind: "search", query: "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ", order: "popular" },
    { kind: "saved", query: "red", page: 3 },
    { kind: "collections", order: "popular", page: 10_000 },
    { kind: "collections", order: "rising", frame: "1y", query: "y".repeat(100) },
    { kind: "collections", order: "popular", query: "kS7Q8Yy5S_SChv0" },
    { kind: "own-collections", query: "blue", page: 2 },
    { kind: "collection", slug: "winter", order: "popular" },
    { kind: "collection", slug: "winter", order: "rising", collection: facts },
    {
      kind: "collection",
      slug: "winter",
      order: "popular",
      collection: { ...facts, description: "" }
    },
    {
      kind: "collection",
      slug: "@ada/winter",
      order: "popular",
      collection: { ...facts, unlisted: true }
    },
    {
      kind: "palette",
      seed: "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ",
      palette: P,
      view: { style: "radialSwatches", steps: 100, angle: 360 }
    },
    {
      kind: "palette",
      seed: "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ",
      palette: P,
      view: { style: "linearGradient", steps: 8, angle: 90 },
      written: {
        title: "Winter",
        description: facts.description,
        view: { style: "linearGradient", steps: 8, angle: 90 }
      }
    },
    ...(
      [
        "about",
        "bindings",
        "mcp",
        "newsletter",
        "privacy",
        "terms",
        "contact",
        "login",
        "connect",
        "unsubscribe",
        "settings"
      ] as const
    ).map(kind => ({ kind })),
    { kind: "notfound", path: `/${"z".repeat(300)}` },
    { kind: "legacy", path: "/_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKa" }
  ];
  for (const locale of LOCALES) {
    current = locale;
    for (const page of pages) {
      kinds.add(page.kind);
      const meta = pageMeta(page, PRODUCTION_ORIGIN);
      const label = `${locale} ${page.kind}: ${meta.description}`;
      expect(meta.description.length, label).toBeLessThanOrEqual(DESCRIPTION_MAX);
      expect(meta.title.length, label).toBeGreaterThan(0);
      // a later page keeps its own words before it says which page it is
      if ("page" in page && (page.page ?? 1) > 1) {
        const first = pageMeta({ ...page, page: 1 }, PRODUCTION_ORIGIN).description;
        const bare = (text: string) => text.replace(/[\u2068\u2069]/g, "");
        expect(bare(meta.description).startsWith(bare(first).slice(0, 20)), label).toBe(true);
      }
    }
  }
  expect(kinds.size).toBe(21);
});
