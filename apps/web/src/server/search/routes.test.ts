import { decodeSnapshot } from "@grabient/search/snapshot.ts";
import { expect, test } from "vitest";
import { searchJsonResponse, searchKeyRules, searchStatusResponse } from "./routes.ts";
import { assets, fakeAi, fixture, refusing, searchEnv, searchFile } from "./testing.ts";

const ask = (path: string, ip = "192.0.2.77") =>
  new Request(`https://grabient.test${path}`, { headers: { "CF-Connecting-IP": ip } });

interface Http {
  path: string;
  bindings: string[] | null;
  status: number;
  retryAfter: string | null;
  body: {
    error?: string;
    query?: string;
    tier?: string;
    total?: number;
    limited?: boolean;
    indexable?: boolean;
    seeds?: string[];
  };
}

test("the search JSON answers as grabient4's did, kept at the edge only when it is a 200 for everyone", async () => {
  for (const golden of fixture<{ results: Http[] }>("http.json").results) {
    const bindings = golden.bindings ?? [];
    const env = searchEnv({
      ASSETS: assets(golden.bindings ? [] : ["snapshot.bin"]),
      ...(bindings.includes("AI") ? { AI: fakeAi() } : {}),
      ...(bindings.includes("RATE_LIMITER")
        ? { RATE_LIMITER: refusing(["searchModelBudget"]) }
        : {})
    });
    const response = await searchJsonResponse(ask(golden.path), env);
    const body = (await response.json()) as Record<string, unknown> & {
      items?: { kseed: string }[];
    };
    expect(response.status, golden.path).toBe(golden.status);
    expect(response.headers.get("Retry-After") === null ? null : "set").toBe(golden.retryAfter);
    expect(response.headers.get("Cache-Control")).toBe(
      golden.status === 200 ? "public, max-age=0, must-revalidate" : "no-store"
    );
    if (golden.body.error) {
      expect(body.error).toBe(golden.body.error);
      continue;
    }
    expect({
      query: body.query,
      tier: body.tier,
      total: body.total,
      limited: body.limited,
      indexable: body.indexable,
      seeds: body.items?.map(item => item.kseed)
    }).toEqual(golden.body);
    expect(typeof body.fetchedAt).toBe("number");
  }
});

test("a refused model read says which allowance refused, for the page to translate", async () => {
  const site = searchEnv({ AI: fakeAi(), RATE_LIMITER: refusing(["searchModelBudget"]) });
  const busy = await (
    await searchJsonResponse(ask("/api/search.json?q=zxqvyk+wqrkk"), site)
  ).json();
  expect(busy).toMatchObject({ limited: true, message: "Search is busy. Try again later." });
  const address = searchEnv({ AI: fakeAi(), RATE_LIMITER: refusing(["searchModelDaily"]) });
  const many = await (
    await searchJsonResponse(ask("/api/search.json?q=zxqvyk+wqrkk"), address)
  ).json();
  expect(many).toMatchObject({
    limited: true,
    message: "Too many searches. Try again in a moment."
  });
});

test("a crawler's answer is kept for nobody", async () => {
  const env = searchEnv({ AI: fakeAi() });
  const request = new Request("https://grabient.test/api/search.json?q=zxqvyk+wqrkk", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }
  });
  const response = await searchJsonResponse(request, env);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ tier: "account", unkept: true });
});

test("the search JSON marks with lead the palette the words name and a palette's collection-mates, and puts them first", async () => {
  const env = searchEnv();
  const items = async (path: string) =>
    (
      (await (await searchJsonResponse(ask(path), env)).json()) as {
        items: { kseed: string; lead?: boolean }[];
      }
    ).items;
  expect((await items("/api/search.json?query=nashville"))[0]).toMatchObject({
    kseed: "kSPTe3fwAsOk8vq",
    lead: true
  });
  const shipped = decodeSnapshot(searchFile("snapshot.bin"));
  const team = shipped.names[shipped.slugs.indexOf("nhl-team-swatches")].members.map(
    row => shipped.seeds[row]
  );
  const similar = await items("/api/search.json?query=kSPTe3fwAsOk8vq");
  expect(similar.slice(0, 6).map(item => [team.includes(item.kseed), item.lead])).toEqual(
    Array(6).fill([true, true])
  );
  expect(similar.slice(6).some(item => "lead" in item)).toBe(false);
});

test("a search for one color answers its codes, a search of other words none", async () => {
  const env = searchEnv();
  const color = async (path: string) =>
    (
      (await (await searchJsonResponse(ask(path), env)).json()) as {
        color?: Record<string, string>;
      }
    ).color;
  expect(await color("/api/search.json?query=burgundy")).toEqual({
    name: "burgundy",
    hex: "#900020",
    rgb: "rgb(144 0 32)",
    hsl: "hsl(347 100% 28%)",
    oklch: "oklch(41.3% 0.166 20.8)"
  });
  expect(await color("/api/search.json?query=%23800020")).toMatchObject({ hex: "#800020" });
  expect(await color("/api/search.json?query=sunset")).toBeUndefined();
});

test("the edge keys a search by what its handler reads, whichever of its addresses asked", () => {
  const [json, tags] = searchKeyRules;
  const key = (params: string, path = "/api/search.json") =>
    json.query?.(new URLSearchParams(params), path).toString();
  expect(
    json.match("/api/search.json") && json.match("/search/blue.json") && !json.match("/search")
  ).toBe(true);
  expect(json.path).toBe("/api/search.json");
  expect(key("q=Blue%20%20Sky&junk=1&limit=500")).toBe(key("query=Blue+Sky&limit=96"));
  expect(key("limit=96", "/search/blue-sky.json")).toBe(key("query=blue+sky&limit=96"));
  expect(key("limit=96", "/palettes/Blue%20Sky.json")).toBe(key("query=Blue+Sky&limit=96"));
  expect(key("q=red", "/api/palettes/search")).toBe("query=red&limit=48&sort=popular");
  expect(key("q=sunset&lang=ja")).toBe("query=sunset&limit=48&sort=popular");
  expect(key("q=kY4mpDazO-mUuu_fuLqXU49dvVP6&lang=ja")).toContain("lang=ja");
  expect(tags.match("/api/search-suggestions") && tags.match("/api/popular-searches")).toBe(true);
  expect(tags.path).toBe("/api/search-suggestions");
});

test("the status says what this isolate answers from", async () => {
  const status = await (await searchStatusResponse(searchEnv())).json();
  expect(status).toMatchObject({
    available: true,
    version: "v1",
    from: "assets",
    palettes: 7350,
    collections: 389
  });
  expect(
    await (await searchStatusResponse(searchEnv({ ASSETS: assets(["snapshot.bin"]) }))).json()
  ).toEqual({
    available: false
  });
});
