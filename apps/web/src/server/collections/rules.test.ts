import { describe, expect, test, vi } from "vitest";

vi.hoisted(() => Object.assign(globalThis, { __BUILD_ID__: "b1" }));

import { CURATION_COMMENT_MAX, CURATION_REASONS, curationReasons } from "@grabient/ui/curation.ts";
import closeness from "../../features/collections/fixtures/closeness.json" with { type: "json" };
import curation from "../../features/collections/fixtures/curation-reasons.json" with {
  type: "json"
};
import fit from "../../features/collections/fixtures/fit.json" with { type: "json" };
import merges from "../../features/collections/fixtures/merge-copy.json" with { type: "json" };
import routes from "../../features/collections/fixtures/routes.json" with { type: "json" };
import validate from "../../features/collections/fixtures/validate.json" with { type: "json" };
import type { CollectionItemInput } from "../../features/collections/schema.ts";
import { cacheKey } from "../cache-keys.ts";
import { canonicalRedirect } from "../canonical.ts";
import { type CollectionContent, mergeCopy } from "./copies.ts";
import { fitOf } from "./fit.ts";
import { ownCloseness, searchTokens } from "./letters.ts";
import {
  means,
  namedFor,
  ownMeanings,
  publicMeanings,
  type Reading,
  type SearchSpace,
  strength
} from "./meaning.ts";
import { readRestoreToken, restoreToken } from "./tokens.ts";

/* grabient4's own answers (features/collections/fixtures), which the rebuild must keep. */

describe("letters", () => {
  test.each(closeness as [string, string, number][])(
    "%j answers %j at %d",
    (title, typed, rank) => {
      expect(ownCloseness({ title, tags: "[]", description: "" }, typed)).toBe(rank);
    }
  );
  test.each(validate.searchTokens as [string, string[]][])("%j reads as %j", (query, tokens) => {
    expect(searchTokens(query)).toEqual(tokens);
  });
});

test.each(fit as [number, number, number, ReturnType<typeof fitOf>][])(
  "%d up, %d down and %d from an admin",
  (up, down, adminDown, expected) => {
    expect(fitOf(up, down, adminDown)).toEqual(expected);
  }
);

describe("a saved copy's update", () => {
  /* the fixture writes each palette as `name@angle`; any five seeds stand for the names */
  const SEEDS: Record<string, string> = {
    a: "kY4mpDazO-mUuu_fuLqXU49dvVP6",
    b: "kWs2um4jE-G62O7xwb3bkk-4",
    c: "kSyQDAzZa8zgZxS",
    d: "kUzkiw66E-e4YQltnUXg",
    e: "kamzkm1gtFdWRyrLHcJuB9B6KaQgOlEGg"
  };
  const NAMES = Object.fromEntries(Object.entries(SEEDS).map(([name, seed]) => [seed, name]));
  type Short = { title: string; description: string; tags: string[]; items: string[] };
  const long = (short: Short): CollectionContent => ({
    ...short,
    items: short.items.map((key): CollectionItemInput => {
      const [name, angle] = key.split("@");
      return { seed: SEEDS[name!]!, style: "linearGradient", steps: 7, angle: Number(angle) };
    })
  });
  const short = (content: CollectionContent) => ({
    ...content,
    items: content.items.map(item => `${NAMES[item.seed]}@${item.angle}`)
  });
  test.each(merges.map(m => [m.label, m] as const))("%s", (_, m) => {
    expect(short(mergeCopy(long(m.base), long(m.source), long(m.copy)))).toEqual(m.merged);
  });
});

describe("addresses", () => {
  type Route = [
    string,
    {
      kind: string;
      canonical?: string | null;
      to?: string;
      resolvedCollection?: { canonical: string | null };
    }
  ];
  const pages = (routes as Route[]).filter(
    ([path]) => !path.startsWith("/collections/") || /saved|rising/.test(path)
  );
  test.each(pages)("%s", (address, route) => {
    const redirect = canonicalRedirect(address);
    if (route.kind === "redirect") expect(redirect).toBe(route.to);
    else if (route.kind === "query") expect(redirect).toBe(route.resolvedCollection!.canonical);
    else if (route.kind !== "notfound") expect(redirect).toBe(route.canonical ?? null);
  });

  test("an old link's order on one word stays for the loader, which knows whether a collection lives there", () => {
    expect(canonicalRedirect("/red?sort=oldest&style=angularSwatches")).toBeNull();
    expect(canonicalRedirect("/Red?sort=newest")).toBe("/red?sort=newest");
    expect(canonicalRedirect("/red?sort=hot")).toBeNull();
    expect(canonicalRedirect("/red?style=linearSwatches&x=1")).toBe("/red?style=linearSwatches");
    expect(canonicalRedirect("/red/rising?sort=hot")).toBeNull();
    expect(canonicalRedirect("/@ada_x/my-blues?sort=oldest")).toBe("/@ada_x/my-blues");
  });

  test("an address that is no collection's is left to its own rule", () => {
    expect(canonicalRedirect("/kY4mpDazO-mUuu_fuLqXU49dvVP6?style=linearSwatches")).toBeNull();
    expect(canonicalRedirect("/_abcdefg")).toBeNull();
    expect(canonicalRedirect("/about")).toBeNull();
    expect(canonicalRedirect("/collections/Bad_Slug")).toBeNull();
  });

  test("a public answer is kept by the query that decides it", () => {
    const key = (address: string) => {
      const url = new URL(address, "https://grabient.com");
      return new URL(cacheKey(url, url.pathname, "en")).searchParams;
    };
    const list = key(
      "/api/collections?q=Warm%20Sunsets&sort=popular&page=2&limit=100&junk=1&lang=ja&model=1"
    );
    expect([...list.keys()].filter(name => name !== "__build").sort()).toEqual([
      "lang",
      "limit",
      "model",
      "page",
      "q",
      "sort"
    ]);
    expect(list.get("q")).toBe("warm sunsets");
    expect(list.get("limit")).toBe("24");
    expect(key("/api/collections?sort=rising&frame=3m").get("frame")).toBe("3m");
    expect(key("/api/collections?sort=newest&lang=en").has("lang")).toBe(false);
    expect([...key("/api/collections/ocean-gradients?style=x&lang=fr").keys()].sort()).toEqual([
      "__build",
      "lang"
    ]);
    expect(key("/api/collections/suggest?q=Ocean&limit=99").get("limit")).toBe("24");
  });
});

describe("the curation vocabulary", () => {
  test("is grabient4's, which the agents count", () => {
    expect(CURATION_REASONS).toEqual(curation.reasons);
    expect(CURATION_COMMENT_MAX).toBe(curation.commentMax);
    expect(curationReasons(["form", "nonsense", "muddy", "form"])).toEqual(curation.kept);
  });
});

describe("a removal's token", () => {
  const env = { BETTER_AUTH_SECRET: "a secret only these tests hold, long enough" };
  const row = {
    seed: "kY4mpDazO-mUuu_fuLqXU49dvVP6",
    style: "linearGradient",
    steps: 7,
    angle: 90,
    position: 3,
    createdAt: 1000
  };
  test("puts back only what it was made for, for a day", async () => {
    const token = await restoreToken(env, "ada", "c1", row, 0);
    expect(await readRestoreToken(env, token, "ada", "c1", 1000)).toEqual(row);
    expect(await readRestoreToken(env, token, "bob", "c1", 1000)).toBeNull();
    expect(await readRestoreToken(env, token, "ada", "c2", 1000)).toBeNull();
    expect(await readRestoreToken(env, token, "ada", "c1", 86_400_001)).toBeNull();
    const [body, signature] = token.split(".");
    const forged = btoa(JSON.stringify({ u: "ada", c: "c1", r: { ...row, createdAt: 1 }, x: 9e15 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await readRestoreToken(env, `${forged}.${signature}`, "ada", "c1", 1000)).toBeNull();
    expect(await readRestoreToken(env, `${body}.x${signature}`, "ada", "c1", 1000)).toBeNull();
    expect(await readRestoreToken(env, "x".repeat(2049), "ada", "c1", 1000)).toBeNull();
  });
});

describe("what a collection means", () => {
  /* a space of two directions: purple and violet stand together, ocean apart */
  const PLACES = [
    [1, 0],
    [0.87, 0.49],
    [0, 1]
  ];
  const ROWS: Record<string, number[]> = { purple: [0], violet: [1], ocean: [2] };
  const space: SearchSpace = {
    read: async () => ({ reading: null }),
    names: words =>
      words
        .toLowerCase()
        .split(/\s+/)
        .flatMap(word => ROWS[word] ?? []),
    place: row => PLACES[row]!,
    collections: [
      { slug: "violet-gradients", subject: "violet", words: "violet gradients", members: [0, 1] },
      { slug: "ocean-gradients", subject: "ocean", words: "ocean gradients purple", members: [2] }
    ],
    standings: () => ({
      at: row => ({ score: row === 2 ? 0.9 : 0.2, harmony: "analogous" }),
      bar: 0.5
    }),
    nearest: () => [],
    standingsOf: async seeds =>
      new Map(seeds.map(seed => [seed, { score: seed === "k1" ? 0.9 : 0.1, harmony: "triadic" }]))
  };
  const purple: Reading = { vector: [1, 0], names: [[1, 0]], unread: [], filter: null };

  test("a title that says the query another way means it, and a tag that says it is a mention", () => {
    const meanings = publicMeanings(space, purple);
    const violet = meanings.get("violet-gradients")!;
    expect(violet.name).toBeCloseTo(0.87);
    expect(means(violet)).toBe(true);
    expect(namedFor(violet)).toBe(false);
    const ocean = meanings.get("ocean-gradients")!;
    expect(ocean.name).toBe(0);
    expect(ocean.tagged).toBe(1);
    expect(ocean.share).toBe(1);
    expect(strength(ocean)).toBe(1);
  });

  test("an owner's collection means the query where half its palettes answer it", async () => {
    const meanings = await ownMeanings(space, { ...purple, filter: ["triadic"] }, [
      { id: "a", title: "Ocean", tags: [], seeds: ["k1", "k2"] },
      { id: "b", title: "Violet", tags: [], seeds: ["k2"] }
    ]);
    expect(meanings.get("a")?.share).toBe(0.5);
    expect(means(meanings.get("a")!)).toBe(true);
    expect(meanings.get("b")?.share).toBe(0);
    expect(meanings.get("b")?.name).toBeCloseTo(0.87);
  });
});
