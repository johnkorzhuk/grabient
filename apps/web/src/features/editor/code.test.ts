import { decodePalette } from "@grabient/engine";
import { blobWebgl } from "@grabient/engine/blob-webgl.ts";
import { blobWebgpu } from "@grabient/engine/blob-webgpu.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { effectEmbedHtml, parseEffect } from "@grabient/engine/effect.ts";
import {
  effectColors,
  effectLayers,
  effectStill,
  effectStylesheet,
  effectSvg
} from "@grabient/engine/effect-code.ts";
import { glassShadertoyText } from "@grabient/engine/glass-shadertoy.ts";
import { glassWebgl } from "@grabient/engine/glass-webgl.ts";
import { glassWebgpu } from "@grabient/engine/glass-webgpu.ts";
import { flush } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { setColorFormat } from "../../lib/color-format.ts";
import { markdownFile } from "../../server/seo/markdown.ts";
import { codeSources } from "./code.ts";
import type { Taken } from "./formats.ts";
import { createRest } from "./rest.ts";

/* The palette as text, in the sheet's code pane. */

/* the grain's tile as the page's file of it would give it */
vi.mock("./copy-finish.ts", async load => ({
  ...(await load<typeof import("./copy-finish.ts")>()),
  grainDataUrl: async (grain: number) => `data:image/png;base64,G${grain}`
}));

const SEED = "kS7CQ31Do6asvY-";
const sources = () =>
  codeSources(
    decodePalette(SEED)!,
    { style: "linearGradient", steps: 7, angle: 90 },
    SEED,
    () => ({ facts: null, opened: false }),
    createRest()
  );
const source = (id: string) => sources().find(s => s.id === id)!;

afterEach(() => {
  setColorFormat("oklch");
  flush();
  vi.unstubAllEnvs();
});

test("CSS and Colors open in the spelling the reader chose in Settings", () => {
  expect(source("css").initial).toBe("oklch");
  expect(source("css").text(source("css").initial)).toContain("oklch(");
  setColorFormat("hex");
  flush();
  expect(source("css").initial).toBe("hex");
  expect(source("colors").initial).toBe("hex");
  expect(source("css").text(source("css").initial)).toMatch(/#[0-9a-f]{6}/);
  expect(source("css").text(source("css").initial)).not.toContain("oklch(");
});

test("the seed is the whole palette, and the Markdown is written here for a palette an edit made", () => {
  expect(source("seed").text()).toBe(SEED);
  expect(source("md").text()).toContain(SEED);
});

/* the code of an effect the picture plays, read once its writers are in */
const ORIGIN = "https://grabient.com";
const played = (query: string): Taken => {
  const P = decodePalette(SEED)!;
  return {
    seed: SEED,
    style: "radialGradient",
    steps: 6,
    angle: 45,
    size: null,
    pixels: { width: 1000, height: 600 },
    stops: sampleStops(P, 6),
    effect: parseEffect(new URLSearchParams(query))
  };
};
const effectSource = (query: string, id: string) =>
  codeSources(
    decodePalette(SEED)!,
    { style: "radialGradient", steps: 6, angle: 45 },
    SEED,
    () => ({ facts: null, opened: false }),
    createRest(),
    played(query)
  ).find(s => s.id === id);
/* an effect's tabs come with its code, which the pane asks for as an effect first shows (effect-sources.ts) */
const tabsIn = () =>
  vi.waitFor(() => {
    flush();
    expect(effectSource("style=glass", "css")).toBeDefined();
  });
const loaded = async (read: () => string) => {
  read();
  await vi.waitFor(() => {
    flush();
    expect(read()).not.toBe("");
  });
  return read();
};

test("while an effect plays, the pane holds its code in the gradient's place, its shader its own", async () => {
  await tabsIn();
  for (const query of ["style=glass", "style=blob"]) {
    const ids = codeSources(
      decodePalette(SEED)!,
      { style: "radialGradient", steps: 6, angle: 45 },
      SEED,
      () => ({ facts: null, opened: false }),
      createRest(),
      played(query)
    ).map(s => s.id);
    expect(ids, query).toEqual(["seed", "html", "css", "colors", "shader", "json", "svg", "md"]);
  }
  const P = decodePalette(SEED)!;
  const glass = parseEffect(new URLSearchParams("style=glass&shape=12&speed=2"))!;
  const css = await loaded(() => effectSource("style=glass&shape=12&speed=2", "css")!.text());
  expect(css).toBe(effectStylesheet(P, SEED, glass, 45, ORIGIN));
  expect(css).not.toContain("radial-gradient");
  expect(effectSource("style=glass&shape=12&speed=2", "svg")!.text()).toBe(
    effectSvg(P, SEED, glass, 45, { width: 1000, height: 600 }, ORIGIN)
  );
  expect(JSON.parse(effectSource("style=glass&shape=12&speed=2", "json")!.text())).toMatchObject({
    style: "glass",
    angle: 45,
    shape: 12,
    speed: 2
  });
  expect(effectSource("style=glass", "colors")!.text("hex").split("\n")).toEqual(
    effectColors(P, parseEffect(new URLSearchParams("style=glass"))!)
  );
  const md = effectSource("style=glass&shape=12&speed=2", "md")!.text();
  expect(md).toContain("- Drawn as: fluted glass, its ribs at 45 degrees, shape 12, speed 2");
  expect(md).not.toContain("gradient(");
});

test("the glass's Shader tab writes each spelling with the engine's own writer, each loaded as it shows", async () => {
  /* the browser's: a server's build never loads a shader's writers */
  vi.stubEnv("SSR", false);
  await tabsIn();
  const P = decodePalette(SEED)!;
  const glass = parseEffect(new URLSearchParams("style=glass&shape=12&speed=2"))!;
  const shader = () => effectSource("style=glass&shape=12&speed=2", "shader")!;
  expect(shader().spellings?.map(s => s.id)).toEqual([
    "shadertoy",
    "glsl",
    "wgsl",
    "webgl",
    "webgpu"
  ]);
  expect(await loaded(() => shader().text())).toBe(glassShadertoyText(P, glass, 45, SEED, ORIGIN));
  for (const kind of ["glsl", "webgl"] as const)
    expect(await loaded(() => shader().text(kind))).toBe(
      glassWebgl(kind, P, glass, 45, SEED, ORIGIN)
    );
  for (const kind of ["wgsl", "webgpu"] as const)
    expect(await loaded(() => shader().text(kind))).toBe(
      glassWebgpu(kind, P, glass, 45, SEED, ORIGIN)
    );
});

test("the blob's Shader tab writes each spelling with the engine's own writer, each loaded as it shows, and no angle", async () => {
  /* the browser's: a server's build never loads a shader's writers */
  vi.stubEnv("SSR", false);
  await tabsIn();
  const P = decodePalette(SEED)!;
  const blob = parseEffect(new URLSearchParams("style=blob&shape=3&speed=2&frost=0.5"))!;
  const shader = () => effectSource("style=blob&shape=3&speed=2&frost=0.5", "shader")!;
  expect(shader().spellings?.map(s => s.id)).toEqual(["glsl", "wgsl", "webgl", "webgpu"]);
  expect(await loaded(() => shader().text())).toBe(blobWebgl("glsl", P, blob, SEED, ORIGIN));
  for (const kind of ["glsl", "webgl"] as const)
    expect(await loaded(() => shader().text(kind))).toBe(blobWebgl(kind, P, blob, SEED, ORIGIN));
  for (const kind of ["wgsl", "webgpu"] as const)
    expect(await loaded(() => shader().text(kind))).toBe(blobWebgpu(kind, P, blob, SEED, ORIGIN));
  /* the editor's angle, 45 here, is the glass's and the gradients': the blob's address names none */
  expect(shader().text("webgl")).toContain(
    `${ORIGIN}/${SEED}?style=blob&speed=2&frost=0.5&shape=3`
  );
  expect(shader().text("webgl")).not.toMatch(/angle=|\bANGLE\b/);
  expect(shader().note?.()).toBe("The balls, their melt and the frost, pass by pass.");
});

test("while an effect plays, the Markdown is the file its address serves, whatever gradient the editor keeps", async () => {
  const served = async (query: string) =>
    (
      await (
        await markdownFile(SEED, new Request(`${ORIGIN}/${SEED}.md?${query}`), ORIGIN, {
          paletteWords: async () => ({ written: null, heldBy: [] }),
          collection: async () => null,
          isCollection: () => false
        })
      ).text()
    ).trimEnd();
  // the gradient kept is 5 radial bands, which an effect's address does not name
  const pane = (query: string) =>
    codeSources(
      decodePalette(SEED)!,
      { style: "radialSwatches", steps: 5, angle: 45 },
      SEED,
      () => ({ facts: null, opened: false }),
      createRest(),
      played(query)
    ).find(s => s.id === "md")!;
  for (const query of ["style=glass&angle=45&speed=2&shape=12", "style=blob&angle=45&shape=3"]) {
    const md = pane(query);
    expect(await loaded(() => md.text())).toBe(await served(query));
  }
});

test("a soft and grained effect's tags and stylesheet show the grain's tile elided, and copy it whole", async () => {
  const P = decodePalette(SEED)!;
  const rosette = parseEffect(new URLSearchParams("style=rosette&shape=4"))!;
  const finish = { soft: 30, grain: 15 };
  await tabsIn();
  const tab = (id: string) =>
    codeSources(
      P,
      { style: "radialGradient", steps: 6, angle: 45 },
      SEED,
      () => ({ facts: null, opened: false }),
      createRest(),
      { ...played("style=rosette&shape=4"), ...finish }
    ).find(s => s.id === id)!;
  const shown = 'url("data:image/png;base64,…")';
  const whole = 'url("data:image/png;base64,G15")';
  expect(await loaded(() => tab("css").text())).toBe(
    effectStylesheet(P, SEED, rosette, 45, ORIGIN, finish, shown)
  );
  expect(await tab("css").take?.()).toBe(
    effectStylesheet(P, SEED, rosette, 45, ORIGIN, finish, whole)
  );
  expect(tab("html").text("style")).toBe(
    effectEmbedHtml(
      ORIGIN,
      SEED,
      rosette,
      45,
      effectStill(P, rosette, 45),
      finish,
      effectLayers(P, rosette, 45, finish, shown)
    )
  );
  /* Copy writes the tags as the strip's Copy HTML does, at the page's own address */
  vi.stubGlobal("location", { origin: ORIGIN });
  try {
    expect(await tab("html").take?.("style")).toContain(`${whole} 0 0 / 128px 128px`);
  } finally {
    vi.unstubAllGlobals();
  }
  expect(tab("html").note?.("style")).toContain("Copy includes the whole first frame.");
});

test("the effect's tags show its first frame inside the page or linked, and copy it whole", async () => {
  const P = decodePalette(SEED)!;
  const blob = parseEffect(new URLSearchParams("style=blob&shape=3"))!;
  await tabsIn();
  const html = effectSource("style=blob&shape=3", "html")!;
  expect(html.spellings?.map(s => s.label)).toEqual(["<style>", "<link>"]);
  expect(await loaded(() => html.text("style"))).toBe(
    effectEmbedHtml(ORIGIN, SEED, blob, 45, effectStill(P, blob, 45))
  );
  expect(html.text("link")).toBe(effectEmbedHtml(ORIGIN, SEED, blob, 45));
  expect(await html.take?.("link")).toBe(html.text("link"));
  // the glass's first frame is a WebP the browser makes on the press, shown elided
  const glass = effectSource("style=glass", "html")!;
  expect(glass.text("style")).toContain('url("data:image/webp;base64,…")');
  expect(glass.text("style")).toContain(
    `<script src="${ORIGIN}/${SEED}.js?style=glass&amp;angle=45" async>`
  );
});
