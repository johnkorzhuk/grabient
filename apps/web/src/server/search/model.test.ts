import { describe, expect, test } from "vitest";
import { modelQuery } from "./model.ts";
import { searchPalettes } from "./search.ts";
import { fakeAi, galleryDb, refusing, searchEnv } from "./testing.ts";

const visitor = (ip = "203.0.113.5", init: RequestInit = {}) =>
  new Request("https://grabient.test/palettes?q=x", {
    ...init,
    headers: { "CF-Connecting-IP": ip, ...init.headers }
  });

/* a database whose flags say these features are off */
function flagsOff(...names: string[]): D1Database {
  const db = galleryDb();
  const prepare = db.prepare.bind(db);
  return {
    ...db,
    prepare: (sql: string) =>
      /FROM k_flags/.test(sql)
        ? {
            bind: () => ({ all: async () => ({ results: names.map(name => ({ name })) }) }),
            all: async () => ({ results: names.map(name => ({ name })) })
          }
        : prepare(sql)
  } as unknown as D1Database;
}

describe("a model read is bought only within its allowances", () => {
  test("the address by the minute and the day, then the visitors' day, in that order", async () => {
    const asked: string[] = [];
    const calls: { model: string; texts: string[] }[] = [];
    const env = searchEnv({ AI: fakeAi(calls), RATE_LIMITER: refusing([], asked) });
    expect(await modelQuery(env, "zxqvyk wqrkk", { request: visitor() })).toHaveProperty("vector");
    expect(asked).toEqual(["searchModelDaily", "searchModelBudget"]);
    expect(calls).toHaveLength(1);
  });

  test("a vector kept is read again with nothing counted", async () => {
    const asked: string[] = [];
    const calls: { model: string; texts: string[] }[] = [];
    const env = searchEnv({ AI: fakeAi(calls), RATE_LIMITER: refusing([], asked) });
    await modelQuery(env, "zxqvyk wqrkk", { request: visitor() });
    await modelQuery(env, "  ZXQVYK   wqrkk!", { request: visitor("203.0.113.6") });
    expect(calls).toHaveLength(1);
    expect(asked).toHaveLength(2);
  });

  test("a connected app counts under its account and the apps' day, and is never a crawler", async () => {
    const asked: string[] = [];
    const env = searchEnv({ AI: fakeAi(), RATE_LIMITER: refusing([], asked) });
    const bot = visitor("203.0.113.7", { headers: { "User-Agent": "GPTBot" } });
    expect(
      await modelQuery(env, "zxqvyk", { request: bot, payer: { app: "user-1" } })
    ).toHaveProperty("vector");
    expect(asked).toEqual(["searchModelDaily", "searchModelApps"]);
  });

  test("a signed-in account pays from its own allowance and the site's day of account searches", async () => {
    const asked: string[] = [];
    const env = searchEnv({ AI: fakeAi(), RATE_LIMITER: refusing(["searchModelBudget"], asked) });
    const result = await searchPalettes(env, "zxqvyk wqrkk", {
      request: visitor(),
      payer: { account: "user-2" }
    });
    expect(result.tier).toBe("model");
    expect(asked).toEqual(["searchAccount", "searchAccountDaily", "searchBudget"]);
  });

  test("a refusal says when to try again, and buys nothing", async () => {
    const calls: { model: string; texts: string[] }[] = [];
    const env = searchEnv({ AI: fakeAi(calls), RATE_LIMITER: refusing(["searchModelDaily"]) });
    const answer = await modelQuery(env, "zxqvyk", { request: visitor() });
    expect(answer).toMatchObject({
      limited: true,
      message: "Too many searches. Try again in a moment."
    });
    expect(answer && "retryAfter" in answer && answer.retryAfter >= 1).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test("a limiter that cannot answer buys nothing, and the search answers as with no model", async () => {
    const broken = {
      idFromName: (n: string) => n,
      get: () => ({ fetch: async () => new Response(null, { status: 500 }) })
    };
    const calls: { model: string; texts: string[] }[] = [];
    const env = searchEnv({
      AI: fakeAi(calls),
      RATE_LIMITER: broken as unknown as DurableObjectNamespace
    });
    const result = await searchPalettes(env, "zxqvyk wqrkk", { request: visitor() });
    expect(result.tier).toBe("account");
    expect(result.limited).toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});

describe("never bought", () => {
  const nothing = async (
    env: Parameters<typeof modelQuery>[0],
    query: string,
    request?: Request
  ) => {
    const calls: { model: string; texts: string[] }[] = [];
    const answer = await modelQuery({ ...env, AI: fakeAi(calls) }, query, { request });
    return { answer, calls: calls.length };
  };

  test("for a HEAD request, a crawler, or no word left", async () => {
    const env = searchEnv();
    expect(await nothing(env, "zxqvyk", visitor("203.0.113.8", { method: "HEAD" }))).toEqual({
      answer: null,
      calls: 0
    });
    expect(
      await nothing(env, "zxqvyk", visitor("203.0.113.9", { headers: { "User-Agent": "bingbot" } }))
    ).toEqual({
      answer: null,
      calls: 0
    });
    expect(await nothing(env, "the of", visitor())).toEqual({ answer: null, calls: 0 });
  });

  test("while an admin has turned search by meaning off", async () => {
    expect(await nothing(searchEnv({ DB: flagsOff("model-search") }), "zxqvyk", visitor())).toEqual(
      { answer: null, calls: 0 }
    );
    expect(await nothing(searchEnv({ DB: flagsOff("all") }), "zxqvyk", visitor())).toEqual({
      answer: null,
      calls: 0
    });
  });
});

test("a person's bought vector is read by a crawler after them", async () => {
  const calls: { model: string; texts: string[] }[] = [];
  const env = searchEnv({ AI: fakeAi(calls) });
  await modelQuery(env, "zxqvyk", { request: visitor() });
  const crawler = visitor("203.0.113.10", { headers: { "User-Agent": "Googlebot" } });
  expect(await modelQuery(env, "zxqvyk", { request: crawler })).toHaveProperty("vector");
  expect(calls).toHaveLength(1);
});

test("the second embedder answers when the first fails, into the same space", async () => {
  const calls: string[] = [];
  const ai = {
    run: async (model: string, input: { text: string[] }) => {
      calls.push(model);
      if (model.includes("gemma")) throw new Error("down");
      return fakeAi().run(model as never, input as never);
    }
  } as unknown as Ai;
  const answer = await modelQuery(searchEnv({ AI: ai }), "zxqvyk", { request: visitor() });
  expect(answer).toHaveProperty("vector");
  expect(calls).toEqual(["@cf/google/embeddinggemma-300m", "@cf/baai/bge-m3"]);
});

test("a hundred-character query reaches the model whole", async () => {
  const calls: { model: string; texts: string[] }[] = [];
  const words = "zxqv ".repeat(20).trim();
  await modelQuery(searchEnv({ AI: fakeAi(calls) }), words, { request: visitor() });
  expect(calls[0].texts).toEqual([words]);
});
