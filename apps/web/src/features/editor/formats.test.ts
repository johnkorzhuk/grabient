import { decodePalette } from "@grabient/engine";
import { sampleStops } from "@grabient/engine/curve.ts";
import { effectFileAddress, parseEffect } from "@grabient/engine/effect.ts";
import {
  effectLayers,
  effectStill,
  effectStylesheet,
  effectSvg
} from "@grabient/engine/effect-code.ts";
import { effectEmbedHtml } from "@grabient/engine/effect-embed.ts";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { copyFormat, copyLink, type Taken } from "./formats.ts";

/* the grain's tile as the page's file of it would give it */
vi.mock("./copy-finish.ts", async load => ({
  ...(await load<typeof import("./copy-finish.ts")>()),
  grainDataUrl: async (grain: number) => `data:image/png;base64,G${grain}`
}));

/* What the editor's strip hands over while an effect plays: the files its address serves, written by the same code. */

const ORIGIN = "https://grabient.test";
const SEED = "kWTATrcQ7MeMxv1MwbbLKq84";
const P = decodePalette(SEED)!;
let copied: string[] = [];

beforeEach(() => {
  copied = [];
  vi.stubGlobal("location", { origin: ORIGIN });
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: async (text: string) => {
        copied.push(text);
      }
    }
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const effect = (query: string) => parseEffect(new URLSearchParams(query))!;
const taken = (query: string, angle = 45): Taken => ({
  seed: SEED,
  style: "radialGradient",
  steps: 6,
  angle,
  size: null,
  pixels: { width: 1200, height: 700 },
  stops: sampleStops(P, 6),
  effect: effect(query)
});

test("an effect's CSS is the stylesheet its address serves, never the gradient's", async () => {
  for (const query of ["style=glass&shape=12&speed=2", "style=blob&shape=3&bg=%23101014"]) {
    await copyFormat("css", taken(query));
    expect(copied.pop()).toBe(effectStylesheet(P, SEED, effect(query), 45, ORIGIN));
  }
  expect(copied).toEqual([]);
});

test("an effect's SVG moves as the picture does, at the pixels taken, as its file is", async () => {
  await copyFormat("svg", taken("style=glass&speed=2"));
  expect(copied.pop()).toBe(
    effectSvg(P, SEED, effect("style=glass&speed=2"), 45, { width: 1200, height: 700 }, ORIGIN)
  );
  await copyFormat("svg", taken("style=blob&speed=0&shape=3"));
  const still = copied.pop() ?? "";
  expect(still).not.toContain("@keyframes");
  expect(still).toBe(
    effectSvg(
      P,
      SEED,
      effect("style=blob&speed=0&shape=3"),
      45,
      { width: 1200, height: 700 },
      ORIGIN
    )
  );
});

test("the page's address keeps the effect, and its files' addresses carry every setting", async () => {
  await copyFormat("url", taken("style=blob&shape=3&speed=0.5"));
  // the blob has no angle
  expect(copied.pop()).toBe(`${ORIGIN}/${SEED}?style=blob&speed=0.5&shape=3`);
  for (const f of ["md", "css", "js", "svg", "png"] as const) {
    await copyLink(f, taken("style=glass&shape=7"));
    expect(copied.pop()).toBe(
      effectFileAddress(ORIGIN, SEED, effect("style=glass&shape=7"), 45, f)
    );
  }
});

test("a soft and grained effect's CSS and tags are finished as its stylesheet is, the grain's tile whole", async () => {
  const silk = effect("style=silk&shape=7");
  const finish = { soft: 40, grain: 25 };
  const tile = 'url("data:image/png;base64,G25")';
  await copyFormat("css", { ...taken("style=silk&shape=7"), ...finish });
  expect(copied.pop()).toBe(effectStylesheet(P, SEED, silk, 45, ORIGIN, finish, tile));
  await copyFormat("html", { ...taken("style=silk&shape=7"), ...finish });
  const html = copied.pop();
  expect(html).toBe(
    effectEmbedHtml(
      ORIGIN,
      SEED,
      silk,
      45,
      effectStill(P, silk, 45),
      finish,
      effectLayers(P, silk, 45, finish, tile)
    )
  );
  expect(html).toContain(`${tile} 0 0 / 128px 128px`);
  expect(html).toContain(`${SEED}.js?style=silk&amp;angle=45&amp;soft=40&amp;grain=25&amp;shape=7`);
});

test("the blob's tags carry the stylesheet's own still inside the page", async () => {
  await copyFormat("html", taken("style=blob&shape=3"));
  const blob = effect("style=blob&shape=3");
  expect(copied.pop()).toBe(effectEmbedHtml(ORIGIN, SEED, blob, 45, effectStill(P, blob, 45)));
});
