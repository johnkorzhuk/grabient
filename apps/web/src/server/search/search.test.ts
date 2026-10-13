import { decodeSnapshot } from "@grabient/search/snapshot.ts";
import { describe, expect, test } from "vitest";
import { type SearchOptions, type SearchResult, searchOwnSeeds, searchPalettes } from "./search.ts";
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

test("without the search files a search is unavailable", async () => {
  const env = searchEnv({ ASSETS: assets(["snapshot.bin"]) });
  expect((await searchPalettes(env, "blue")).tier).toBe("unavailable");
});
