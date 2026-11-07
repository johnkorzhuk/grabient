import { decodePalette } from "@grabient/engine/codec.ts";
import { parseEffect } from "@grabient/engine/effect.ts";
import { effectUnderlay, finishPixels, grainOverRgba } from "@grabient/engine/fx-finish.ts";
import { describe, expect, test } from "vitest";
import { at, decodePng } from "../../../test/png.ts";
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
      const i = (y * png.width + x) * png.channels;
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
    expect((await middle(card.clone())).width).toBe(1200);
    const png = await seedPngAnswer(get(`/${SEED}.png?style=blob&shape=7&w=400&h=300`), env, keep);
    expect(png.status).toBe(200);
    const picture = await middle(png.clone());
    expect([picture.width, picture.height]).toEqual([400, 300]);
    // with no ground the blob stands clear around itself, as the editor's copy of it does; a card is never clear
    const clear = await decodePng(new Uint8Array(await png.arrayBuffer()));
    expect(clear.channels).toBe(4);
    expect(at(clear, 0, 0)[3]).toBe(0);
    expect((await decodePng(new Uint8Array(await card.arrayBuffer()))).channels).toBe(3);
    const grounded = await seedPngAnswer(
      get(`/${SEED}.png?style=blob&shape=7&bg=%23101014&w=400&h=300`),
      env,
      keep
    );
    const solid = await decodePng(new Uint8Array(await grounded.arrayBuffer()));
    expect(solid.channels).toBe(3);
    expect(at(solid, 0, 0)).toEqual([16, 16, 20]);
  });

  test("a papercut address's card is its first frame under the wordmark, and its picture alone at the size asked", async () => {
    const { env, keep } = world();
    const card = await cardAnswer(get(`/api/og?seed=${SEED}&style=papercut&shape=7`), env, keep);
    const plain = await cardAnswer(get(`/api/og?seed=${SEED}`), env, keep);
    expect(card.status).toBe(200);
    const a = await middle(card);
    const b = await middle(plain);
    expect([a.width, a.height]).toEqual([1200, 630]);
    expect(Math.max(...a.mean.map((v, c) => Math.abs(v - b.mean[c])))).toBeGreaterThan(2);
    const png = await seedPngAnswer(
      get(`/${SEED}.png?style=papercut&shape=7&w=400&h=300`),
      env,
      keep
    );
    expect(png.status).toBe(200);
    const picture = await decodePng(new Uint8Array(await png.arrayBuffer()));
    expect([picture.width, picture.height, picture.channels]).toEqual([400, 300, 3]);
  });

  test("its key is the look it draws: another shape is another card, another pace the same one", async () => {
    const { env, keep } = world();
    const tag = async (query: string) =>
      (await cardAnswer(get(`/api/og?seed=${SEED}&${query}`), env, keep)).headers.get("ETag");
    const shape7 = await tag("style=blob&shape=7");
    expect(await tag("style=blob&shape=8")).not.toBe(shape7);
    expect(await tag("style=blob&shape=7&speed=3&fps=24")).toBe(shape7);
    expect(await tag("style=glass&angle=45")).not.toBe(await tag("style=glass"));
    expect(await tag("style=papercut&shape=7")).not.toBe(await tag("style=papercut&shape=8"));
    expect(await tag("style=papercut&shape=7&speed=0")).toBe(await tag("style=papercut&shape=7"));
  });
});

/** A picture's pixels as straight RGBA, four bytes each, as the finish takes them. */
function rgbaOf(png: { width: number; height: number; channels: number; pixels: Uint8Array }) {
  const n = png.width * png.height;
  if (png.channels === 4) return new Uint8ClampedArray(png.pixels);
  const rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) rgba.set([...png.pixels.subarray(i * 3, i * 3 + 3), 255], i * 4);
  return rgba;
}
const rgbOf = (rgba: ArrayLike<number>) =>
  Array.from({ length: rgba.length / 4 }, (_, i) => [
    rgba[i * 4],
    rgba[i * 4 + 1],
    rgba[i * 4 + 2]
  ]).flat();

describe("a soft or grained effect's picture and card", () => {
  const read = async (response: Response) => {
    expect(response.status).toBe(200);
    return decodePng(new Uint8Array(await response.arrayBuffer()));
  };

  test("its picture is its frame finished as the site paints it: blurred over the palette's gradient, the grain over all", async () => {
    const { env, keep } = world();
    const png = async (query: string) =>
      read(
        await seedPngAnswer(get(`/${SEED}.png?style=silk&angle=40&${query}w=320&h=200`), env, keep)
      );
    const plain = await png("");
    const size = { width: 320, height: 200 };
    const silk = parseEffect(new URLSearchParams("style=silk"));
    const P = decodePalette(SEED);
    if (!silk || !P) throw new Error("no silk");
    /* the grain alone is the tile over the plain frame, a speck a pixel from its corner */
    const grained = await png("grain=40&");
    expect(grained.channels).toBe(3);
    const specks = rgbaOf(plain);
    grainOverRgba(specks, size.width, size.height, 40);
    expect([...grained.pixels]).toEqual(rgbOf(specks));
    /* the soft one is the frame blurred by its share of the longer side over the gradient at its angle, opaque */
    const soft = await png("soft=60&grain=40&");
    expect(soft.channels).toBe(3);
    const finished = finishPixels(
      rgbaOf(plain),
      size,
      { soft: 60, grain: 40 },
      effectUnderlay(P, silk, 40, 60)
    );
    expect([...soft.pixels]).toEqual(rgbOf(finished));
    expect([...soft.pixels]).not.toEqual([...grained.pixels]);
  });

  test("its card is the finished frame under the wordmark, kept under its finish; a plain one keeps its key", async () => {
    const { env, keep } = world();
    const card = (query: string) =>
      cardAnswer(get(`/api/og?seed=${SEED}&style=glass${query}`), env, keep);
    const plain = await card("");
    /* a plain card's key, as before the finish */
    expect(plain.headers.get("ETag")).toBe(
      '"image:k4:fb552cd757bae6610545df838a1454f6373ce4c7f289b42cd13fe121082b7f5f"'
    );
    const tags = new Set<string | null>([plain.headers.get("ETag")]);
    for (const query of ["&soft=50", "&grain=40", "&soft=50&grain=40", "&soft=51&grain=40"]) {
      const finished = await card(query);
      tags.add(finished.headers.get("ETag"));
      const decoded = await read(finished);
      expect([decoded.width, decoded.height, decoded.channels]).toEqual([1200, 630, 3]);
    }
    expect(tags.size).toBe(5);
    /* the soft one's middle row is smoother than the plain one's: the ribs blurred */
    const roughness = async (response: Response) => {
      const decoded = await read(response);
      let sum = 0;
      const y = 400;
      for (let x = 1; x < decoded.width; x++)
        sum += Math.abs(at(decoded, x, y)[0] - at(decoded, x - 1, y)[0]);
      return sum;
    };
    expect(await roughness(await card("&soft=60"))).toBeLessThan((await roughness(plain)) / 3);
  });

  test("a picture's key names its finish; a plain picture's stands as it was", async () => {
    const { env, keep } = world();
    const tag = async (query: string) =>
      (
        await seedPngAnswer(get(`/${SEED}.png?style=silk&w=400&h=300${query}`), env, keep)
      ).headers.get("ETag");
    expect(await tag("")).toBe(
      '"image:k4:17fd3a62e028ce802751ad2899536648f31bfd6e7be5b4dcb618879e7611ec56"'
    );
    expect(await tag("&soft=0&grain=0")).toBe(await tag(""));
    const finished = [
      await tag("&soft=20"),
      await tag("&grain=20"),
      await tag("&soft=20&grain=20")
    ];
    expect(new Set([await tag(""), ...finished]).size).toBe(4);
  });

  test("a blob takes no soft: its picture and its card are the ones with none, a clear one clear under its grain", async () => {
    const { env, keep } = world();
    for (const bg of ["", "&bg=%2310101480"]) {
      const picture = (soft: string) =>
        seedPngAnswer(
          get(`/${SEED}.png?style=blob&shape=7${bg}${soft}&grain=40&w=400&h=300`),
          env,
          keep
        );
      const soft = await picture("&soft=50");
      expect(soft.headers.get("ETag")).toBe((await picture("")).headers.get("ETag"));
      const png = await read(soft);
      expect(png.channels).toBe(4);
      const alphas = new Set(Array.from({ length: 400 * 300 }, (_, i) => png.pixels[i * 4 + 3]));
      /* clear where the blob is not, thinning toward it, solid within it */
      expect(alphas.has(255)).toBe(true);
      expect([...alphas].some(a => a > 0 && a < 255)).toBe(true);
    }
    /* its card stays solid */
    const card = (soft: string) =>
      cardAnswer(get(`/api/og?seed=${SEED}&style=blob&shape=7${soft}&grain=40`), env, keep);
    const soft = await card("&soft=50");
    expect(soft.headers.get("ETag")).toBe((await card("")).headers.get("ETag"));
    expect((await read(soft)).channels).toBe(3);
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
    expect(image("style=blob&shape=12&bg=%23101014")).toContain("style=blob");
    expect(image("style=blob&shape=12&bg=%23101014")).toContain("shape=12");
    expect(image("style=blob&shape=12&bg=%23101014")).toContain("bg=%23101014");
    expect(image("style=blob&shape=12&bg=%23101014&speed=2")).not.toContain("speed");
    expect(image("")).not.toContain("style=glass");
    /* a soft or grained effect's page names its card soft and grained, as its files are */
    const finished = pageMeta({
      kind: "palette",
      seed: SEED,
      palette: P,
      view: { ...view, angle: 40, soft: 50, grain: 30 },
      effect: parseEffect(new URLSearchParams("style=silk"))!,
      heldBy: []
    }).image;
    expect(finished).toContain("style=silk&angle=40&soft=50&grain=30");
  });

  test("the effect's card address writes only what changes its picture", () => {
    const glass = parseEffect(new URLSearchParams("style=glass&speed=2&fps=30"));
    const blob = parseEffect(new URLSearchParams("style=blob&frost=0.5&shape=3"));
    const shaped = parseEffect(new URLSearchParams("style=glass&shape=12"));
    if (!glass || !blob || !shaped) throw new Error("no effect");
    expect(effectCard(SEED, glass, 90)).toBe(`/api/og?seed=${SEED}&v=k4&style=glass`);
    expect(effectCard(SEED, glass, 45)).toBe(`/api/og?seed=${SEED}&v=k4&style=glass&angle=45`);
    expect(effectCard(SEED, shaped, 90)).toBe(`/api/og?seed=${SEED}&v=k4&style=glass&shape=12`);
    expect(effectCard(SEED, blob, 90)).toBe(
      `/api/og?seed=${SEED}&v=k4&style=blob&frost=0.5&shape=3`
    );
    // the blob has no angle, so its card names none
    expect(effectCard(SEED, blob, 30)).toBe(
      `/api/og?seed=${SEED}&v=k4&style=blob&frost=0.5&shape=3`
    );
  });
});
