import { setLocaleSource } from "@grabient/i18n";
import { QueryClient } from "@tanstack/solid-query";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { heading } from "../../lib/page-meta.ts";
import { AS_SAVED } from "../list/appearance.ts";
import type { ListPlace } from "./params.ts";
import {
  collectionHead,
  listMeta,
  listPaint,
  listPlace,
  loadCollection,
  loadList,
  loadSaved,
  searchOf
} from "./route.ts";
import type { CollectionDocument, CollectionPage } from "./types.ts";

/* The collections' loaders as the server runs them, over a cache already holding what they read: the status and robots
   a page answers with, where an address that holds nothing leads, and what the frame is handed. The router and the
   reads stand aside; a redirect is the thrown object the router would act on. */

const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("@tanstack/solid-router", () => ({ redirect: (to: object) => ({ redirect: to }) }));
vi.mock("@tanstack/solid-start", () => ({
  createIsomorphicFn: () => ({ server: (run: unknown) => ({ client: () => run }) })
}));
vi.mock("@tanstack/solid-start/server", () => ({
  getRequest: () => new Request("https://grabient.test/", { headers: { Cookie: request.cookie } })
}));
vi.mock("../gallery/queries.ts", () => ({ framesQuery: () => ({ queryKey: ["frames"] }) }));
vi.mock("./queries.ts", () => ({
  collectionQuery: (slug: string) => ({ queryKey: ["collection", slug] }),
  collectionsQuery: () => ({ queryKey: ["collections"] }),
  tagsQuery: () => ({ queryKey: ["collection-tags"] })
}));

const SEEDS = [
  "kY4mpDazO-mUuu_fuLqXU49dvVP6",
  "kWs2um4jE-G62O7xwb3bkk-4",
  "kSyQDAzZa8zgZxS",
  "kUzkiw66E-e4YQltnUXg"
];
const saved = { style: "linearGradient", steps: 5, angle: 90 } as const;
const summary = (slug: string, seeds: string[]): CollectionPage["items"][number] => ({
  slug,
  title: slug,
  description: "",
  tags: [],
  visibility: "public",
  owner: { kind: "agent", name: "Grabient" },
  itemCount: seeds.length,
  createdAt: 1,
  updatedAt: 2,
  saves: 0,
  preview: seeds.map(seed => ({ seed, ...saved }))
});
const pageOf = (items: CollectionPage["items"], totalPages = 1): CollectionPage => ({
  query: "",
  sort: "popular",
  page: 1,
  limit: 24,
  total: items.length,
  totalPages,
  fetchedAt: 0,
  items
});
const place = (over: Partial<ListPlace> = {}): ListPlace => ({
  order: "popular",
  frame: "1w",
  query: "",
  page: 1,
  limit: 24,
  view: AS_SAVED,
  ...over
});

/** A cache holding what a loader reads, so no read is made. */
function cacheOf(held: Record<string, unknown>) {
  const client = new QueryClient();
  for (const [key, data] of Object.entries(held)) client.setQueryData(key.split(" "), data);
  return client;
}
const lists = (page: unknown, frames = ["1w", "3m", "1y"]) =>
  cacheOf({ frames, collections: page, "collection-tags": [] });

beforeEach(() => {
  request.cookie = "";
});

describe("a list's address read into its place", () => {
  test("keeps what it can read and takes the defaults for the rest", () => {
    const read = listPlace("rising", "3m", "?q=Warm%20%20Sunset&page=2&limit=12&steps=5");
    expect(read).toEqual({
      order: "rising",
      frame: "3m",
      query: "warm sunset",
      page: 2,
      limit: 12,
      view: { ...AS_SAVED, steps: 5 }
    });
    expect(listPlace("popular", "soon", "?page=0&limit=500")).toMatchObject({
      frame: "1w",
      query: "",
      page: 1,
      limit: 24
    });
  });
  test("comes from the router's search as the address wrote it, and from none once its route is gone", () => {
    expect(searchOf({ q: "sea", steps: 5, selection: "" })).toBe("?q=sea&steps=5&selection");
    expect(searchOf({ style: ["linearSwatches", "radialGradient"], angle: undefined })).toBe(
      "?style=linearSwatches"
    );
    expect(searchOf({})).toBe("");
    expect(searchOf(undefined)).toBe("");
  });
});

describe("a list's heading", () => {
  test("names its order, its words, the palette it was searched by, or whose it is", () => {
    const said = (over: Partial<ListPlace>) => heading(listMeta(place(over)));
    expect(said({})).toBe("Gradient and color palette collections");
    expect(said({ order: "rising", frame: "3m" })).toBe(
      "Rising gradient and color palette collections"
    );
    expect(said({ order: "rising", query: "ocean" })).toBe(
      "Ocean gradient and color palette collections"
    );
    expect(said({ query: SEEDS[0] })).toMatch(/^Collections like \S/);
    expect(said({ order: "saved" })).toBe("Your collections");
    expect(said({ order: "saved", query: "sea" })).toBe("Your collections for sea");
    expect(said({ order: "saved", query: SEEDS[0] })).toMatch(/^Your collections like \S/);
  });
});

describe("what a list hands the frame", () => {
  const items = [
    summary("a", SEEDS.slice(0, 3)),
    summary("b", []),
    summary("c", SEEDS.slice(3)),
    ...Array.from({ length: 5 }, (_, i) => summary(`d${i}`, SEEDS.slice(0, 2)))
  ];
  test("is the first two palettes of each collection, eight at most, as its cards draw them", () => {
    const painted = listPaint(items, { ...AS_SAVED, style: "linearSwatches", angle: 0 });
    expect(painted.map(p => p.seed)).toEqual([
      SEEDS[0],
      SEEDS[1],
      SEEDS[3],
      SEEDS[0],
      SEEDS[1],
      SEEDS[0],
      SEEDS[1],
      SEEDS[0]
    ]);
    expect(painted.every(p => p.style === "linearSwatches" && p.angle === 0)).toBe(true);
    expect(listPaint([], AS_SAVED)).toEqual([]);
  });
  test("draws each palette in its own view where the list sets none, never under its keyframes", () => {
    const [six, three] = listPaint([summary("a", [SEEDS[0]!, SEEDS[2]!])], AS_SAVED);
    expect(six).toEqual({ seed: SEEDS[0], style: "linearGradient", steps: 6, angle: 90 });
    expect(three).toEqual({ seed: SEEDS[2], ...saved });
  });
});

describe("a public list's loader", () => {
  test("hands the frame the page's first palettes", async () => {
    const loaded = await loadList(lists(pageOf([summary("a", SEEDS)])), place());
    expect(loaded).toEqual({
      paint: [expect.objectContaining({ seed: SEEDS[0] }), expect.anything()]
    });
  });
  test("answers 404, out of the index, for a page past the list's end", async () => {
    const page = pageOf([], 2);
    expect(await loadList(lists(page), place({ page: 3 }))).toEqual({
      status: 404,
      robots: "noindex,follow",
      paint: []
    });
    expect(await loadList(lists(page), place({ page: 2 }))).toEqual({ paint: [] });
    // an empty list's first page is the list
    expect(await loadList(lists(pageOf([], 0)), place())).toEqual({ paint: [] });
  });
  test("says no cache keeps a search whose words were read in part", async () => {
    const page = { ...pageOf([summary("ocean-depths", SEEDS)]), unkept: true };
    expect(await loadList(lists(page), place({ query: "quetzalcoatl marsh" }))).toMatchObject({
      unkept: true
    });
    expect(await loadList(lists(pageOf([])), place())).not.toHaveProperty("unkept");
  });
  test("renders its page for a read that failed, with nothing to hand on", async () => {
    expect(await loadList(lists({ failed: "No answer." }), place())).toEqual({});
  });
  test("leads Rising in a frame turned off to the week's, its words and view kept", async () => {
    const at = place({
      order: "rising",
      frame: "3m",
      query: "sea",
      view: { ...AS_SAVED, steps: 5 }
    });
    await expect(loadList(lists(pageOf([]), ["1w", "1y"]), at)).rejects.toEqual({
      redirect: { href: "/collections/rising?q=sea&steps=5", statusCode: 302 }
    });
    // Popular reads no frame, so one turned off changes nothing for it
    expect(await loadList(lists(pageOf([]), ["1w"]), place({ frame: "3m" }))).toEqual({
      paint: []
    });
  });
});

describe("Saved's loader", () => {
  const cache = () => cacheOf({ frames: ["1w"], "collection-tags": [] });
  test("says a request with no session's cookie is signed out, so the server draws the way in", async () => {
    expect(await loadSaved(cache())).toEqual({ signedOut: true });
    request.cookie = "theme=dark; other_token=1";
    expect(await loadSaved(cache())).toEqual({ signedOut: true });
  });
  test("leaves a request with a session's cookie to the browser, which asks who it is", async () => {
    request.cookie = "theme=dark; __Secure-better-auth.session_token=abc.def";
    expect(await loadSaved(cache())).toEqual({ signedOut: false });
    request.cookie = "better-auth.session_token=abc";
    expect(await loadSaved(cache())).toEqual({ signedOut: false });
  });
});

describe("a collection page's loader", () => {
  const doc: CollectionDocument = {
    ...summary("ocean-depths", []),
    title: "Ocean depths",
    description: "Deep water.",
    tags: ["ocean"],
    itemCount: 3,
    items: SEEDS.slice(0, 3).map((kseed, i) => ({
      kseed,
      ...saved,
      likes: i,
      createdAt: 10 - i,
      position: i,
      rising: i === 1 ? 5 : 0
    }))
  };
  const at = (slug: string, order: "popular" | "rising" = "popular", searchStr = "") => ({
    slug,
    order,
    searchStr,
    publicHref: `/${slug}`
  });
  const holding = (slug: string, found: unknown) => cacheOf({ [`collection ${slug}`]: found });

  test("says the collection's own words and hands the frame its palettes in the address's order and view", async () => {
    const cache = holding("ocean-depths", { doc, fetchedAt: 0 });
    const popular = await loadCollection(cache, at("ocean-depths", "popular", "?angle=45"));
    expect(popular.facts).toEqual({
      title: "Ocean depths",
      description: "Deep water.",
      tags: ["ocean"],
      count: 3,
      createdAt: 1,
      updatedAt: 2
    });
    expect(popular.paint?.map(p => p.seed)).toEqual([SEEDS[2], SEEDS[1], SEEDS[0]]);
    expect(popular.paint?.every(p => p.angle === 45)).toBe(true);
    const rising = await loadCollection(cache, at("ocean-depths", "rising"));
    expect(rising.paint?.map(p => p.seed)).toEqual([SEEDS[1], SEEDS[0], SEEDS[2]]);
    expect(rising.status).toBeUndefined();
  });
  test("names the languages one of Grabient's reads in, and its head each language's copy", async () => {
    const cache = holding("ocean-depths", { doc, languages: ["ja", "de"], fetchedAt: 0 });
    const loaded = await loadCollection(cache, at("ocean-depths"));
    expect(loaded.facts).toMatchObject({ title: "Ocean depths", languages: ["ja", "de"] });
    const named = (found: typeof loaded) =>
      collectionHead(cache, { slug: "ocean-depths", order: "popular", search: {} }, found)
        .links.filter(link => "hreflang" in link)
        .map(link => [link.hreflang, link.href]);
    expect(named(loaded)).toEqual([
      ["en", "https://grabient.com/ocean-depths"],
      ["ja", "https://grabient.com/ja/ocean-depths"],
      ["de", "https://grabient.com/de/ocean-depths"],
      ["x-default", "https://grabient.com/ocean-depths"]
    ]);
    // one in English alone names no other language
    expect(named({ facts: { ...loaded.facts!, languages: undefined } })).toEqual([]);
  });
  test("names a private collection unlisted in what its page says of it", async () => {
    const hidden = { ...doc, visibility: "private" as const };
    const loaded = await loadCollection(
      holding("@ada/blues", { doc: hidden, fetchedAt: 0 }),
      at("@ada/blues")
    );
    expect(loaded.facts).toMatchObject({ unlisted: true });
  });
  test("renders a private one's page as a 404, saying whether anyone here can be its owner", async () => {
    const cache = holding("@ada/blues", { doc: null, private: true, fetchedAt: 0 });
    expect(await loadCollection(cache, at("@ada/blues"))).toEqual({
      status: 404,
      robots: "noindex,follow",
      signedOut: true
    });
    request.cookie = "better-auth.session_token=abc";
    expect(await loadCollection(cache, at("@ada/blues"))).toMatchObject({
      status: 404,
      signedOut: false
    });
  });
  test("renders a 404 for an account's address that holds nothing", async () => {
    const cache = holding("@ada/nothing", { doc: null, fetchedAt: 0 });
    expect(await loadCollection(cache, at("@ada/nothing"))).toMatchObject({ status: 404 });
  });
  test("leads a one-segment address that holds nothing to the palette search for its words", async () => {
    const cache = holding("warm-sunsets", { doc: null, fetchedAt: 0 });
    await expect(
      loadCollection(cache, at("warm-sunsets", "popular", "?steps=5&selection"))
    ).rejects.toEqual({
      redirect: { href: "/palettes?q=warm+sunsets&steps=5&selection", statusCode: 301 }
    });
    await expect(loadCollection(cache, at("warm-sunsets", "rising"))).rejects.toEqual({
      redirect: { href: "/palettes/rising?q=warm+sunsets", statusCode: 301 }
    });
  });
  test("leads an old link's newer order to Rising's search for its words, in one step", async () => {
    const cache = holding("red", { doc: null, fetchedAt: 0 });
    await expect(
      loadCollection(cache, at("red", "popular", "?sort=oldest&style=angularSwatches"))
    ).rejects.toEqual({
      redirect: { href: "/palettes/rising?q=red&style=angularSwatches", statusCode: 301 }
    });
    await expect(loadCollection(cache, at("red", "popular", "?sort=hot"))).rejects.toEqual({
      redirect: { href: "/palettes?q=red", statusCode: 301 }
    });
  });
  test("leads in the reader's language", async () => {
    setLocaleSource(() => "ja");
    try {
      await expect(
        loadCollection(holding("red", { doc: null, fetchedAt: 0 }), at("red"))
      ).rejects.toEqual({ redirect: { href: "/ja/palettes?q=red", statusCode: 301 } });
    } finally {
      setLocaleSource(() => "en");
    }
  });
  test("leads an old link's order on a collection's address to the collection's own", async () => {
    await expect(
      loadCollection(
        holding("ocean-depths", { doc, fetchedAt: 0 }),
        at("ocean-depths", "popular", "?sort=newest&steps=5")
      )
    ).rejects.toEqual({ redirect: { href: "/ocean-depths?steps=5", statusCode: 301 } });
  });
  test("renders its page for a read that failed", async () => {
    const cache = holding("ocean-depths", { failed: "No answer." });
    expect(await loadCollection(cache, at("ocean-depths"))).toEqual({});
  });
});
