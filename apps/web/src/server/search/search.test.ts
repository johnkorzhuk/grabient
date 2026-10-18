import { decodeSnapshot } from "@grabient/search/snapshot.ts";
import { describe, expect, test } from "vitest";
import { canonicalRedirect } from "../canonical.ts";
import {
  type SearchOptions,
  type SearchResult,
  searchOwnSeeds,
  searchPalettes,
  sitemapQueries
} from "./search.ts";
import { assets, fakeAi, fixture, galleryDb, searchEnv, searchFile } from "./testing.ts";

const round = (x: number) => (Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : x);

/* a search's answer as the fixtures hold it */
const answerOf = (result: SearchResult) => ({
  query: result.query,
  tier: result.tier,
  total: result.total,
  indexable: result.indexable,
  ...(result.partial ? { partial: true } : {}),
  ...(result.limited ? { limited: true, retryAfter: result.retryAfter } : {}),
  ...(result.unkept ? { unkept: true } : {}),
  ...(result.far ? { far: result.far } : {}),
  read: result.read,
  tags: result.items[0]?.tags ?? [],
  items: result.items.map(item => [item.kseed, round(item.score), item.style, item.steps])
});
async function run(
  env: Parameters<typeof searchPalettes>[0],
  input: string,
  options: SearchOptions
) {
  try {
    return answerOf(await searchPalettes(env, input, options));
  } catch (error) {
    return error instanceof Error
      ? { error: error.name, message: error.message }
      : { error: String(error) };
  }
}

type Golden = { input: string; options?: SearchOptions; result: unknown };

describe("the free search answers as grabient4 did", () => {
  const env = searchEnv();
  test.each(
    fixture<{ results: Golden[] }>("queries.json").results.map(
      r => [r.input.slice(0, 60), r] as const
    )
  )("%s", async (_, { input, result }) => {
    expect(await run(env, input, { limit: 24 })).toEqual(result);
  });
});

describe("what a connected app asks beside words", () => {
  const env = searchEnv();
  test.each(
    fixture<{ results: Golden[] }>("asked.json").results.map(
      r => [JSON.stringify(r.options), r] as const
    )
  )("%s", async (_, { input, options, result }) => {
    expect(await run(env, input, { limit: 24, ...options })).toEqual(result);
  });
});

describe("colors measured against palettes as they are shown", () => {
  const shipped = decodeSnapshot(searchFile("snapshot.bin"));
  const banded = galleryDb(seed =>
    (shipped.at.get(seed) ?? 1) % 3 === 0
      ? { style: "linearSwatches", steps: 5, angle: 90 }
      : { style: "linearGradient", steps: 7, angle: 90 }
  );
  const env = searchEnv({ DB: banded });
  test.each(
    fixture<{ results: Golden[] }>("colors-banded.json").results.map(r => [r.input, r] as const)
  )("%s", async (_, { input, result }) => {
    expect(await run(env, input, { limit: 24 })).toEqual(result);
  });
});

describe("the model reads what nothing free does, once per text", () => {
  const golden = fixture<{
    results: (Golden & { embedded: { model: string; texts: string[] }[] })[];
  }>("model-tier.json");
  test.each(golden.results.map(r => [r.input.slice(0, 60), r] as const))(
    "%s",
    async (_, { input, result, embedded }) => {
      const calls: { model: string; texts: string[] }[] = [];
      const env = searchEnv({ AI: fakeAi(calls) });
      expect(await run(env, input, { limit: 24 })).toEqual(result);
      expect(calls).toEqual(embedded);
    }
  );
});

describe("a list someone holds, searched", () => {
  const golden = fixture<{
    held: string[];
    results: { input: string; tier: string; found: [string, number][] }[];
  }>("own-seeds.json");
  const env = searchEnv();
  test.each(golden.results.map(r => [r.input, r] as const))(
    "%s",
    async (_, { input, tier, found }) => {
      const own = await searchOwnSeeds(env, input, golden.held);
      expect({ tier: own.tier, found: own.found.map(c => [c.seed, round(c.score)]) }).toEqual({
        tier,
        found
      });
    }
  );
});

describe("words a palette's own fields hold between them", () => {
  const env = searchEnv();
  test.each([
    ["nhl nashville", "kSPTe3fwAsOk8vq", "nhl team"],
    ["nashville hockey", "kSPTe3fwAsOk8vq", "nhl team"],
    ["hockey predators", "kSPTe3fwAsOk8vq", "nhl team"],
    ["nba lakers", "kUa4PZZb3QfsDv-Ug7_g", "nba team"],
    ["chicago hockey", "kYEQBAQ8u39u9w3yQ8Vxi5HDCwTK", "nhl team"],
    ["nfl ravens", "kSS2vGgABJkyrym", "nfl team"]
  ])("%s names its team", async (query, seed, tag) => {
    const { tier, items } = await searchPalettes(env, query);
    expect([tier, items[0]?.kseed, items[0]?.tags, items[0]?.lead]).toEqual([
      "named",
      seed,
      [tag],
      true
    ]);
  });

  test("and nothing where no palette holds them all", async () => {
    expect((await searchPalettes(env, "nhl lakers")).tier).toBe("account");
  });
});

test("what the words name, and a collection's palettes for the phrase it alone is called, head every order; a color's and a scene's do not", async () => {
  const env = searchEnv();
  const leads = async (query: string) => {
    const { items } = await searchPalettes(env, query, { limit: 96 });
    const led = items.filter(item => item.lead).length;
    expect(
      items.every((item, at) => item.lead === (at < led ? true : undefined)),
      query
    ).toBe(true);
    return [items[0]?.kseed, led];
  };
  expect(await leads("nashville")).toEqual(["kSPTe3fwAsOk8vq", 1]);
  expect(await leads("nhl team")).toEqual([expect.any(String), 25]);
  expect((await leads("sunset"))[1]).toBe(0);
  expect((await leads("blue"))[1]).toBe(0);
});

test("the palettes like a palette lead with the nearest its collections hold, then its nearest colors from anywhere", async () => {
  const env = searchEnv();
  const shipped = decodeSnapshot(searchFile("snapshot.bin"));
  const team = shipped.names
    .find(name => name.subject === "nhl team")!
    .members.map(row => shipped.seeds[row]);
  const { tier, items } = await searchPalettes(env, "kSPTe3fwAsOk8vq", { limit: 96 });
  expect(tier).toBe("similar");
  expect(items.slice(0, 6).every(item => item.lead && team.includes(item.kseed))).toBe(true);
  expect(items[6]?.lead).toBeUndefined();
  expect(items.map(item => item.kseed)).toContain("kSPTe3fwAsOk8vq");
  const alone = await searchPalettes(env, "kWiWqwzCq9lYquzeObz4Ma-w", { limit: 96 });
  expect([alone.tier, alone.items.some(item => item.lead)]).toEqual(["similar", false]);
});

test("names are read whole: a piece of a cut word names nothing, and a tag past the 80th character names its palettes", async () => {
  const env = searchEnv();
  for (const piece of ["h", "ear", "spo", "wallpa"])
    expect((await searchPalettes(env, piece)).tier, piece).toBe("account");
  const tagged = await searchPalettes(env, "visualization");
  expect([tagged.tier, tagged.items[0]?.tags]).toEqual(["named", ["sequential data", "heatmap"]]);
});

test("without the search files a search is unavailable", async () => {
  const env = searchEnv({ ASSETS: assets(["snapshot.bin"]) });
  expect((await searchPalettes(env, "blue")).tier).toBe("unavailable");
});

describe("grabient.com's indexed searches", () => {
  /* its sitemap of searches, as it wrote them */
  const OLD = [
    "sunset",
    "ocean",
    "forest",
    "pastel",
    "neon",
    "warm",
    "cool",
    "monochrome",
    "tea",
    "blue",
    "purple",
    "cyan",
    "rose",
    "alpine",
    "indigo",
    "charcoal-%26-chocolate",
    "synthwave",
    "teal%2C-azure%2C-navy",
    "glossy",
    "party",
    "lagoon",
    "artisan",
    "refined",
    "dark-academia",
    "punk",
    "winter",
    "prairie",
    "saffron",
    "sandstone",
    "green",
    "pink",
    "red",
    "orange",
    "yellow",
    "black",
    "gold",
    "silver",
    "teal",
    "navy",
    "mint",
    "lavender",
    "beige",
    "cream",
    "sky-blue",
    "dark-blue",
    "dark-purple",
    "sage-green",
    "hot-pink",
    "blue-purple"
  ];
  const env = searchEnv();
  const crawler = new Request("https://grabient.com/palettes", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }
  });

  test.each(OLD)(
    "/palettes/%s leads in one step to a page of its own that a crawler is shown",
    async old => {
      const to = canonicalRedirect(`/palettes/${old}`);
      expect(to).toMatch(/^\/palettes\?q=/);
      expect(canonicalRedirect(to!)).toBeNull();
      const words = new URL(to!, "https://grabient.com").searchParams.get("q")!;
      const answer = await searchPalettes(env, words, { limit: 24, request: crawler });
      expect([words, answer.tier, answer.indexable, answer.items.length > 0]).toEqual([
        words,
        expect.stringMatching(/^(?:vocabulary|named)$/),
        true,
        true
      ]);
    }
  );

  test("are listed for crawlers, all but the two that lead elsewhere", async () => {
    const listed = await sitemapQueries(env);
    const moved = ["artisan", "prairie"];
    for (const old of OLD.filter(old => !moved.includes(old))) {
      const words = new URL(
        canonicalRedirect(`/palettes/${old}`)!,
        "https://grabient.com"
      ).searchParams.get("q")!;
      expect([old, listed.includes(words)]).toEqual([old, true]);
    }
    for (const old of moved) expect(listed).not.toContain(old);
  });
});
