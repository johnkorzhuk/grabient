import type { Env } from "@grabient/server/env.ts";
import { afterEach, describe, expect, test, vi } from "vitest";
import { decodePng } from "../../../test/png.ts";
import { cardAnswer, pngAnswer } from "./answers.ts";
import keys from "./fixtures/image-keys.json" with { type: "json" };
import { montageAnswer, montagePicture } from "./montages.ts";
import type { Keep, PictureEnv } from "./serve.ts";

const ORIGIN = "https://grabient.test";
const SEED = "kS7Q8Yy5S_SChv0";
const GRAY = "kQAAAAfwA_4";

/** An R2 bucket in memory, saying what it was asked. */
function bucket() {
  const objects = new Map<string, Uint8Array>();
  const asked: string[] = [];
  return {
    objects,
    asked,
    async get(name: string) {
      asked.push(`get ${name}`);
      const bytes = objects.get(name);
      return bytes ? { body: new Blob([bytes as Uint8Array<ArrayBuffer>]).stream() } : null;
    },
    async put(name: string, bytes: Uint8Array) {
      asked.push(`put ${name}`);
      objects.set(name, bytes);
    }
  };
}

/** A database whose k_flags holds these flags off. */
const flagsOff = (...names: string[]) => ({
  prepare: () => ({
    bind: () => ({ all: async () => ({ results: names.map(name => ({ name, enabled: 0 })) }) })
  })
});

/** A limiter that refuses these limits, saying which it was asked. */
function limiter(refuse: string[] = [], fail = false) {
  const asked: string[] = [];
  const answer = (types: string[]) => {
    const reset = Math.floor(Date.now() / 1000) + 3600;
    const results = types.map(type => ({
      type,
      success: !refuse.includes(type),
      limit: 10,
      remaining: 0,
      reset
    }));
    const refused = results.find(result => !result.success);
    return Response.json(
      { success: !refused, limit: 10, remaining: 0, reset, results },
      { status: refused ? 429 : 200 }
    );
  };
  return {
    asked,
    namespace: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (input: string | URL) => {
          if (fail) throw new Error("The limiter is down");
          const types = new URL(input).searchParams.getAll("type");
          asked.push(types.join("+"));
          return answer(types);
        }
      })
    } as unknown as DurableObjectNamespace
  };
}

function world(
  options: { off?: string[]; refuse?: string[]; deployment?: Env["DEPLOYMENT"] } = {}
) {
  const store = bucket();
  const limits = limiter(options.refuse);
  const points: string[] = [];
  const kept: Promise<unknown>[] = [];
  const env = {
    DEPLOYMENT: options.deployment ?? "staging",
    DB: flagsOff(...(options.off ?? [])) as unknown as D1Database,
    UPLOADS: store as unknown as R2Bucket,
    RATE_LIMITER: limits.namespace,
    USAGE: { writeDataPoint: (point: { blobs: string[] }) => points.push(point.blobs.join(" ")) }
  } as unknown as PictureEnv;
  const keep: Keep = work => kept.push(work);
  return { env, keep, store, limits, points, settled: () => Promise.all(kept) };
}

const get = (path: string, init: RequestInit = {}) =>
  new Request(`${ORIGIN}${path}`, {
    ...init,
    headers: { "CF-Connecting-IP": "198.51.100.7", ...init.headers }
  });
const bytes = async (response: Response) => new Uint8Array(await response.arrayBuffer());

afterEach(() => vi.restoreAllMocks());

describe("a picture's key", () => {
  test("names what is drawn: one picture has one ETag, whatever its address says beside", async () => {
    const { env, keep } = world();
    const tag = async (address: string, branded: boolean) => {
      const head = get(address.split(" ")[0], { method: "HEAD" });
      if (address.includes("montage")) {
        return (
          await montagePicture(head, env, [{ seed: SEED }, { seed: GRAY }], branded, keep)
        ).headers.get("ETag");
      }
      return (await (branded ? cardAnswer : pngAnswer)(head, env, keep)).headers.get("ETag");
    };
    for (const key of keys.keys) {
      expect([key.address, await tag(key.address, key.branded)]).toEqual([key.address, key.etag]);
    }
  });
});

describe("a share card", () => {
  test("is drawn once, kept in R2 under its version and key, and read from there after", async () => {
    const { env, keep, store, points, settled } = world();
    const first = await cardAnswer(get(`/api/og?seed=${SEED}`), env, keep);
    expect([first.status, first.headers.get("X-Cache"), first.headers.get("Content-Type")]).toEqual(
      [200, "MISS", "image/png"]
    );
    expect(first.headers.get("Cache-Control")).toBe("public, max-age=86400");
    expect(first.headers.get("CDN-Cache-Control")).toBe("max-age=604800");
    expect(first.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const drawn = await bytes(first);
    await settled();
    const name = `cards/k4/${first.headers.get("ETag")?.slice(10, -1)}.png`;
    expect([...store.objects.keys()]).toEqual([name]);
    const again = await cardAnswer(get(`/api/og?seed=${SEED}&v=k4&t=9`), env, keep);
    expect([again.status, again.headers.get("X-Cache")]).toEqual([200, "HIT"]);
    expect(await bytes(again)).toEqual(drawn);
    expect(points).toEqual(["image card drawn", "image card cache"]);
    expect((await decodePng(drawn)).width).toBe(1200);
  });

  test("answers HEAD and a matching If-None-Match without reading R2 or drawing", async () => {
    const { env, keep, store, points } = world();
    const head = await cardAnswer(get(`/api/og?seed=${SEED}`, { method: "HEAD" }), env, keep);
    expect([head.status, (await head.arrayBuffer()).byteLength]).toEqual([200, 0]);
    const tag = head.headers.get("ETag") ?? "";
    const unchanged = await cardAnswer(
      get(`/api/og?seed=${SEED}`, { headers: { "If-None-Match": `W/${tag}, "other"` } }),
      env,
      keep
    );
    expect([unchanged.status, unchanged.headers.get("ETag")]).toEqual([304, tag]);
    expect([store.asked, points]).toEqual([[], []]);
  });

  test("on a Preview is drawn and never kept: a Preview may draw differently under the same version", async () => {
    const { env, keep, store, settled } = world({ deployment: "preview" });
    expect((await cardAnswer(get(`/api/og?seed=${SEED}`), env, keep)).status).toBe(200);
    await settled();
    expect(store.asked).toEqual([]);
  });

  test("whose palette is no palette is 404", async () => {
    const { env, keep } = world();
    const answer = await cardAnswer(get("/api/og?seed=broken"), env, keep);
    expect([answer.status, await answer.json()]).toEqual([404, { error: "Invalid palette seed." }]);
  });
});

describe("a palette's picture", () => {
  test("is kept by the browser a month and never in R2", async () => {
    const { env, keep, store, points, settled } = world();
    const answer = await pngAnswer(get(`/api/png?seed=${SEED}&size=256x1`), env, keep);
    expect([
      answer.status,
      answer.headers.get("Cache-Control"),
      answer.headers.get("CDN-Cache-Control")
    ]).toEqual([200, "public, max-age=2592000", "max-age=604800"]);
    const strip = await decodePng(await bytes(answer));
    expect([strip.width, strip.height]).toEqual([256, 1]);
    await settled();
    expect([store.asked, points]).toEqual([[], ["image png drawn"]]);
  });
});

describe("with drawing turned off", () => {
  test("a card R2 holds is served, any other card is the site's card, and a palette's picture is its SVG", async () => {
    const on = world();
    await cardAnswer(get(`/api/og?seed=${SEED}`), on.env, on.keep);
    await on.settled();
    const off = world({ off: ["share-images"] });
    for (const [name, png] of on.store.objects) off.store.objects.set(name, png);
    const kept = await cardAnswer(get(`/api/og?seed=${SEED}`), off.env, off.keep);
    expect([kept.status, kept.headers.get("X-Cache")]).toEqual([200, "HIT"]);
    const card = await cardAnswer(get(`/api/og?seed=${SEED}&steps=11`), off.env, off.keep);
    expect([
      card.status,
      card.headers.get("Location"),
      card.headers.get("CDN-Cache-Control")
    ]).toEqual([302, `${ORIGIN}/grabient.png`, "no-store"]);
    const png = await pngAnswer(get(`/api/png?seed=${SEED}`), off.env, off.keep);
    expect([png.status, png.headers.get("Location"), png.headers.get("CDN-Cache-Control")]).toEqual(
      [302, `${ORIGIN}/${SEED}.svg?size=1200x630`, "no-store"]
    );
    expect(off.points).toEqual(["image card cache", "image card refused", "image png refused"]);
    expect(off.limits.asked).toEqual([]);
  });

  test("`all` turns it off too, and a montage is refused before its palettes are read", async () => {
    const { env, keep } = world({ off: ["all"] });
    const read = vi.fn(async () => [{ seed: SEED }]);
    const card = await montageAnswer(get("/api/og/list"), env, true, "list:popular:1w", read, keep);
    const picture = await montageAnswer(
      get("/api/png/collection?slug=x"),
      env,
      false,
      "collection:x:popular",
      read,
      keep
    );
    expect([card.status, picture.status, read.mock.calls.length]).toEqual([302, 503, 0]);
  });
});

describe("the allowances", () => {
  test("count the address's minute here, then the site's day, and the site's card stands in when the day is spent", async () => {
    const { env, keep, limits } = world({ refuse: ["imageRenderDaily"] });
    const card = await cardAnswer(get(`/api/og?seed=${SEED}&steps=12`), env, keep);
    expect([card.status, card.headers.get("Location")]).toEqual([302, `${ORIGIN}/grabient.png`]);
    expect(limits.asked).toEqual(["imageRenderDaily"]);
    const png = await pngAnswer(get(`/api/png?seed=${SEED}&w=333`), env, keep);
    expect([png.status, await png.text()]).toEqual([429, "Too many new images. Try again later."]);
    expect(Number(png.headers.get("Retry-After"))).toBeGreaterThan(3000);
    // A day this isolate saw spent refuses without asking again.
    expect(limits.asked).toEqual(["imageRenderDaily"]);
  });

  test("give the crawlers Cloudflare verifies and the apps that preview a posted link days of their own", async () => {
    const { env, keep, limits } = world({ refuse: ["imageRenderDaily"] });
    // everyone's day is spent, and a search engine's card is still drawn
    const crawler = get(`/api/og?seed=${SEED}&steps=14`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
      }
    });
    Object.defineProperty(crawler, "cf", {
      value: { verifiedBotCategory: "Search Engine Crawler" }
    });
    expect((await cardAnswer(crawler, env, keep)).status).toBe(200);
    // so is the card of a link posted on Discord, which Cloudflare does not verify
    const discord = get(`/api/og?seed=${SEED}&steps=15`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)" }
    });
    expect((await cardAnswer(discord, env, keep)).status).toBe(200);
    // a request that only claims a search engine's name counts against everyone's day
    const claimed = await cardAnswer(
      get(`/api/og?seed=${SEED}&steps=16`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }
      }),
      env,
      keep
    );
    expect([claimed.status, claimed.headers.get("Location")]).toEqual([
      302,
      `${ORIGIN}/grabient.png`
    ]);
    expect(limits.asked).toEqual(["imageVerifiedDaily", "imagePreviewDaily", "imageRenderDaily"]);
  });

  test("count a picture larger than a card against its own day first, and a strip as any small picture", async () => {
    const large = world({ refuse: ["largeImageDaily"] });
    const big = await pngAnswer(get(`/api/png?seed=${SEED}&size=8000x4000`), large.env, large.keep);
    expect([big.status, large.limits.asked]).toEqual([429, ["largeImageDaily"]]);
    const strip = await pngAnswer(get(`/api/png?seed=${SEED}&size=256x1`), large.env, large.keep);
    expect([strip.status, large.limits.asked]).toEqual([
      200,
      ["largeImageDaily", "imageRenderDaily"]
    ]);
  });

  test("fail closed: a limiter that cannot answer, or production without one, draws nothing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const down = world();
    down.env.RATE_LIMITER = limiter([], true).namespace;
    expect(
      (await cardAnswer(get(`/api/og?seed=${SEED}&steps=13`), down.env, down.keep)).status
    ).toBe(503);
    const bare = world({ deployment: "production" });
    bare.env.RATE_LIMITER = undefined;
    const refused = await pngAnswer(get(`/api/png?seed=${SEED}&w=41`), bare.env, bare.keep);
    expect([refused.status, await refused.text()]).toEqual([503, "Image temporarily unavailable"]);
  });

  test("a drawing that fails is a refusal, counted and logged", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { env, keep, points } = world();
    vi.spyOn(Math, "hypot").mockImplementation(() => {
      throw new Error("no geometry");
    });
    const answer = await cardAnswer(get(`/api/og?seed=${SEED}&style=radialGradient`), env, keep);
    expect([answer.status, points]).toEqual([503, ["image card failed"]]);
    expect(error).toHaveBeenCalledWith("Palette PNG render failed", expect.any(Error));
  });
});
