import { setFlag } from "@grabient/server/flags/flags.ts";
import { afterEach, describe, expect, it } from "vitest";
import { cardAnswer, pngAnswer } from "../src/server/images/answers.ts";
import golden from "../src/server/images/fixtures/pictures.json" with { type: "json" };
import { get, testEnv, unique, watchLimits } from "./helpers.ts";
import { decodePng, pixelHash } from "./png.ts";

/* Share cards in workerd: drawn with its CompressionStream, kept in the R2 bucket local development binds, refused by
   the flags in D1 and counted by the RateLimiter object. */

const SEED = golden.defaultSeed;

/** An isolate: a database binding of its own, so it keeps its own copy of the flags, and its waitUntil. */
function isolate(env = testEnv()) {
  const DB = new Proxy(env.DB, {
    get(target, key) {
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const kept: Promise<unknown>[] = [];
  return {
    env: { ...env, DB },
    keep: (work: Promise<unknown>) => void kept.push(work),
    settled: () => Promise.all(kept)
  };
}

/** A view no other test asks for, so its card is drawn here first. */
const fresh = () =>
  `steps=${3 + Math.floor(Math.random() * 97)}&angle=${Math.floor(Math.random() * 361)}`;

afterEach(async () => {
  await testEnv().DB.prepare("DELETE FROM k_flags").run();
});

describe("a share card", () => {
  it("is drawn as the golden card, kept in R2 under its version and key, and read from there", async () => {
    const first = isolate();
    const answer = await cardAnswer(get(`/api/og?seed=${SEED}`), first.env, first.keep);
    const png = new Uint8Array(await answer.arrayBuffer());
    const card = await decodePng(png);
    const want = golden.pictures.find(
      picture => picture.name === "card default (3 keyframe chips)"
    );
    expect(await pixelHash(card.pixels)).toBe(want?.rgbSha256);
    await first.settled();
    const hash = answer.headers.get("ETag")?.slice('"image:k4:'.length, -1);
    const object = await first.env.UPLOADS?.get(`cards/k4/${hash}.png`);
    expect(object?.httpMetadata?.contentType).toBe("image/png");
    expect(new Uint8Array((await object?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(png);
    const again = isolate();
    const read = await cardAnswer(get(`/api/og?seed=${SEED}&v=k4`), again.env, again.keep);
    expect([read.headers.get("X-Cache"), new Uint8Array(await read.arrayBuffer())]).toEqual([
      "HIT",
      png
    ]);
  });

  it("is the site's card while drawing is off, unless R2 holds it; any other picture is refused", async () => {
    const view = fresh();
    const on = isolate();
    await cardAnswer(get(`/api/og?seed=${SEED}&${view}`), on.env, on.keep);
    await on.settled();
    const off = isolate();
    await setFlag(off.env, "share-images", false, unique("admin"));
    const kept = await cardAnswer(get(`/api/og?seed=${SEED}&${view}`), off.env, off.keep);
    expect([kept.status, kept.headers.get("X-Cache")]).toEqual([200, "HIT"]);
    const other = await cardAnswer(get(`/api/og?seed=${SEED}&${fresh()}`), off.env, off.keep);
    expect([other.status, other.headers.get("Location")]).toEqual([
      302,
      "https://grabient.test/grabient.png"
    ]);
    const png = await pngAnswer(get(`/api/png?seed=${SEED}&${fresh()}`), off.env, off.keep);
    expect([png.status, await png.text()]).toEqual([503, "Image temporarily unavailable"]);
    await setFlag(off.env, "share-images", true, unique("admin"));
    expect(
      (await pngAnswer(get(`/api/png?seed=${SEED}&${fresh()}`), off.env, off.keep)).status
    ).toBe(200);
  });
});

describe("the allowances", () => {
  it("ask the RateLimiter object for the site's days alone, a large picture's first", async () => {
    const { env, asked } = watchLimits(testEnv());
    const { keep } = isolate(env);
    expect((await cardAnswer(get(`/api/og?seed=${SEED}&${fresh()}`), env, keep)).status).toBe(200);
    expect(asked).toEqual(["imageRenderDaily"]);
    asked.length = 0;
    const large = await pngAnswer(get(`/api/png?seed=${SEED}&${fresh()}&w=2400&h=1260`), env, keep);
    expect([large.status, asked]).toEqual([200, ["largeImageDaily", "imageRenderDaily"]]);
  });

  it("fail closed where production has lost its limiter", async () => {
    const { env, keep } = isolate(testEnv({ DEPLOYMENT: "production", RATE_LIMITER: undefined }));
    const refused = await cardAnswer(get(`/api/og?seed=${SEED}&${fresh()}`), env, keep);
    expect([refused.status, refused.headers.get("Cache-Control")]).toEqual([503, "no-store"]);
  });
});
