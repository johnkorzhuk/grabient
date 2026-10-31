import { decodePalette } from "@grabient/engine/codec.ts";
import { parseEffect } from "@grabient/engine/effect.ts";
import { describe, expect, test } from "vitest";
import { decodePng } from "../../../test/png.ts";
import { effectCard, pageMeta } from "../../lib/page-meta.ts";
import { cardAnswer, seedPngAnswer } from "./answers.ts";
import type { Keep, PictureEnv } from "./serve.ts";

const ORIGIN = "https://grabient.test";
const SEED = "kWTATrcQ7MeMxv1MwbbLKq84";

/** The Worker's bindings a picture reads, in memory: a bucket, flags all on, a limiter that allows all. */
function world() {
  const objects = new Map<string, Uint8Array>();
  const env = {
    DEPLOYMENT: "staging",
    DB: {
      prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) })
    },
    UPLOADS: {
      get: async (name: string) => {
        const bytes = objects.get(name);
        return bytes ? { body: new Blob([bytes as Uint8Array<ArrayBuffer>]).stream() } : null;
      },
      put: async (name: string, bytes: Uint8Array) => void objects.set(name, bytes)
    },
    RATE_LIMITER: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (input: string | URL) => {
          const types = new URL(input).searchParams.getAll("type");
          const reset = Math.floor(Date.now() / 1000) + 3600;
          return Response.json({
            success: true,
            limit: 10,
            remaining: 9,
            reset,
            results: types.map(type => ({ type, success: true, limit: 10, remaining: 9, reset }))
          });
        }
      })
    },
    USAGE: { writeDataPoint: () => {} }
  } as unknown as PictureEnv;
  const keep: Keep = () => {};
  return { env, keep };
}
const get = (path: string) =>
  new Request(`${ORIGIN}${path}`, { headers: { "CF-Connecting-IP": "198.51.100.7" } });

/** The mean of each channel over a band of rows across the picture's middle. */
async function middle(response: Response) {
  const png = await decodePng(new Uint8Array(await response.arrayBuffer()));
  const sum = [0, 0, 0];
  let n = 0;
  for (let y = Math.floor(png.height * 0.45); y < Math.floor(png.height * 0.55); y++)
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 3;
      for (let c = 0; c < 3; c++) sum[c] += png.pixels[i + c];
      n++;
    }
  return { width: png.width, height: png.height, mean: sum.map(v => v / n) };
}

describe("an effect's card", () => {
  test("a glass address's card is the glass's first frame under the wordmark, not the palette's gradient", async () => {
    const { env, keep } = world();
    const glass = await cardAnswer(get(`/api/og?seed=${SEED}&style=glass`), env, keep);
    const plain = await cardAnswer(get(`/api/og?seed=${SEED}`), env, keep);
    expect(glass.status).toBe(200);
    const a = await middle(glass);
    const b = await middle(plain);
    expect([a.width, a.height]).toEqual([1200, 630]);
    expect(Math.max(...a.mean.map((v, c) => Math.abs(v - b.mean[c])))).toBeGreaterThan(5);
  });

  test("a blob address's card draws the blob on its ground, and the blob's picture alone at the size asked", async () => {
    const { env, keep } = world();
    const card = await cardAnswer(get(`/api/og?seed=${SEED}&style=blob&shape=7`), env, keep);
    expect(card.status).toBe(200);
    expect((await middle(card)).width).toBe(1200);
    const png = await seedPngAnswer(get(`/${SEED}.png?style=blob&shape=7&w=400&h=300`), env, keep);
    expect(png.status).toBe(200);
    const picture = await middle(png);
    expect([picture.width, picture.height]).toEqual([400, 300]);
  });

  test("its key is the look it draws: another shape is another card, another pace the same one", async () => {
    const { env, keep } = world();
    const tag = async (query: string) =>
      (await cardAnswer(get(`/api/og?seed=${SEED}&${query}`), env, keep)).headers.get("ETag");
    const shape7 = await tag("style=blob&shape=7");
    expect(await tag("style=blob&shape=8")).not.toBe(shape7);
    expect(await tag("style=blob&shape=7&speed=3&fps=24")).toBe(shape7);
    expect(await tag("style=glass&angle=45")).not.toBe(await tag("style=glass"));
  });
});

describe("an effect page's head", () => {
  test("names the effect's card, and a page with none the palette's", () => {
    const P = decodePalette(SEED);
    if (!P) throw new Error("no palette");
    const view = { style: "linearGradient", steps: 7, angle: 90 } as const;
    /* the page as StaticPalette.tsx's metaPage writes it: the address's effect beside its view */
    const image = (query: string) => {
      const effect = parseEffect(new URLSearchParams(query));
      return pageMeta({
        kind: "palette",
        seed: SEED,
        palette: P,
        view,
        ...(effect ? { effect } : {}),
        heldBy: []
      }).image;
    };
    expect(image("style=glass")).toContain("/api/og?seed=");
    expect(image("style=glass")).toContain("style=glass");
    expect(image("style=blob&shape=12&fill=1&bg=deep")).toContain("style=blob");
    expect(image("style=blob&shape=12&fill=1&bg=deep")).toContain("shape=12");
    expect(image("style=blob&shape=12&fill=1&bg=deep")).toContain("fill=1");
    expect(image("style=blob&shape=12&fill=1&bg=deep")).not.toContain("speed");
    expect(image("")).not.toContain("style=glass");
  });

  test("the effect's card address writes only what changes its picture", () => {
    const glass = parseEffect(new URLSearchParams("style=glass&speed=2&fps=30"));
    const blob = parseEffect(new URLSearchParams("style=blob&depth=0&frost=0.5&shape=3"));
    if (!glass || !blob) throw new Error("no effect");
    expect(effectCard(SEED, glass, 90)).toBe(`/api/og?seed=${SEED}&v=k4&style=glass`);
    expect(effectCard(SEED, glass, 45)).toBe(`/api/og?seed=${SEED}&v=k4&style=glass&angle=45`);
    expect(effectCard(SEED, blob, 90)).toBe(
      `/api/og?seed=${SEED}&v=k4&style=blob&depth=0&frost=0.5&shape=3`
    );
  });
});
