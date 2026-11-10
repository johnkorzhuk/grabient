import { decodePalette } from "@grabient/engine";
import { blobWebgl } from "@grabient/engine/blob-webgl.ts";
import { blobWebgpu } from "@grabient/engine/blob-webgpu.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { dimpleWebgl } from "@grabient/engine/dimple-webgl.ts";
import { dimpleWebgpu } from "@grabient/engine/dimple-webgpu.ts";
import {
  EFFECT_KINDS,
  EFFECTS,
  isVectorKind,
  parseEffect,
  type VectorKind
} from "@grabient/engine/effect.ts";
import {
  effectColors,
  effectLayers,
  effectStill,
  effectStylesheet,
  effectSvg
} from "@grabient/engine/effect-code.ts";
import { effectEmbedHtml } from "@grabient/engine/effect-embed.ts";
import { effectUnderlay } from "@grabient/engine/fx-finish.ts";
import { glassWebgl } from "@grabient/engine/glass-webgl.ts";
import { glassWebgpu } from "@grabient/engine/glass-webgpu.ts";
import { kitKernel } from "@grabient/engine/kit/kernels.ts";
import { KIT_KINDS, kitRecord } from "@grabient/engine/kit/kinds.ts";
import { kitEffect } from "@grabient/engine/kit/registry.ts";
import { kitWebgl } from "@grabient/engine/kit/webgl.ts";
import { kitWebgpu } from "@grabient/engine/kit/webgpu.ts";
import { papercutWebgl } from "@grabient/engine/papercut-webgl.ts";
import { papercutWebgpu } from "@grabient/engine/papercut-webgpu.ts";
import { rosetteWebgl } from "@grabient/engine/rosette-webgl.ts";
import { rosetteWebgpu } from "@grabient/engine/rosette-webgpu.ts";
import { silkWebgl } from "@grabient/engine/silk-webgl.ts";
import { silkWebgpu } from "@grabient/engine/silk-webgpu.ts";
import { stringsWebgl } from "@grabient/engine/strings-webgl.ts";
import { stringsWebgpu } from "@grabient/engine/strings-webgpu.ts";
import { flush } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { setColorFormat } from "../../lib/color-format.ts";
import { markdownFile } from "../../server/seo/markdown.ts";
import { codeSources } from "./code.ts";
import type { Taken } from "./formats.ts";
import { createRest } from "./rest.ts";

/* The palette as text, in the sheet's code pane. */

/* a vector effect's two shader writers: its WebGL page and GLSL, its WebGPU page and WGSL */
type Writers = readonly [typeof silkWebgl, typeof silkWebgpu];
/* each field effect's writers, its definition and kernel bound to them (engine/kit) */
async function kitWriters() {
  const kernels = await Promise.all(KIT_KINDS.map(kitKernel));
  return kitRecord((kind): Writers => {
    const kernel = kernels[KIT_KINDS.indexOf(kind)];
    return [
      (shader, ...rest) => kitWebgl(kitEffect(kind), kernel, shader, ...rest),
      (shader, ...rest) => kitWebgpu(kitEffect(kind), kernel, shader, ...rest)
    ];
  });
}

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
  for (const query of [
    "style=glass",
    "style=blob",
    "style=silk",
    "style=rosette",
    "style=papercut"
  ]) {
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
  expect(shader().spellings?.map(s => s.id)).toEqual(["webgl", "webgpu", "glsl", "wgsl"]);
  /* the page that plays it first, the one the tab shows unasked */
  expect(await loaded(() => shader().text())).toBe(glassWebgl("webgl", P, glass, 45, SEED, ORIGIN));
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
  expect(shader().spellings?.map(s => s.id)).toEqual(["webgl", "webgpu", "glsl", "wgsl"]);
  expect(await loaded(() => shader().text())).toBe(blobWebgl("webgl", P, blob, SEED, ORIGIN));
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

test("every vector effect's Shader tab write each spelling with the engine's own writer, each loaded as it shows", async () => {
  /* the browser's: a server's build never loads a shader's writers */
  vi.stubEnv("SSR", false);
  await tabsIn();
  const P = decodePalette(SEED)!;
  const writers: Record<VectorKind, Writers> = {
    silk: [silkWebgl, silkWebgpu],
    rosette: [rosetteWebgl, rosetteWebgpu],
    papercut: [papercutWebgl, papercutWebgpu],
    strings: [stringsWebgl, stringsWebgpu],
    dimple: [dimpleWebgl, dimpleWebgpu],
    ...(await kitWriters())
  };
  const notes: Record<VectorKind, string> = {
    silk: "The dye, its folds' shade and light, in one pass.",
    rosette: "The petals ring by ring, the ground and the heart's glow, in one pass.",
    papercut: "The relief, then each sheet's shadows, lit cut and face, pass by pass.",
    strings:
      "The stirred field at each pixel, its two nearest threads over the ground, in one pass.",
    dimple:
      "The ground about the hollow, then the discs over each pixel in their stack's order, in one pass.",
    /* a field effect's by its recipe, the note true of it: the sandstone's plain sheets, with neither shadow nor
       rim. A recipe the note does not say, one with lines or with a shadow or a rim on its sheets, fails here until
       effect-sources.ts kitPasses gives it a note of its own */
    ...kitRecord(kind => {
      const { sheets, lines } = kitEffect(kind);
      expect(sheets, `the ${kind}'s lines alone need a note of their own`).toBeTruthy();
      expect(lines, `the ${kind}'s sheets and lines need a note of their own`).toBeNull();
      expect(
        !sheets?.shadow && !sheets?.rim,
        `the ${kind}'s sheets with a shadow or a rim need a note of their own`
      ).toBe(true);
      return "The field at each pixel, then its plain sheets edge to edge, in one pass.";
    })
  };
  for (const kind of EFFECTS.filter(isVectorKind)) {
    /* its look: a shape, or a zoom in its place (the dimple's) */
    const look = EFFECT_KINDS[kind].zoom ? "zoom=2.5" : "shape=12";
    const query = `style=${kind}&${look}&speed=2`;
    const effect = parseEffect(new URLSearchParams(query))!;
    const [webgl, webgpu] = writers[kind];
    const shader = () => effectSource(query, "shader")!;
    expect(
      shader().spellings?.map(s => s.id),
      kind
    ).toEqual(["webgl", "webgpu", "glsl", "wgsl"]);
    expect(await loaded(() => shader().text())).toBe(webgl("webgl", P, effect, 45, SEED, ORIGIN));
    for (const spelling of ["glsl", "webgl"] as const)
      expect(await loaded(() => shader().text(spelling))).toBe(
        webgl(spelling, P, effect, 45, SEED, ORIGIN)
      );
    for (const spelling of ["wgsl", "webgpu"] as const)
      expect(await loaded(() => shader().text(spelling))).toBe(
        webgpu(spelling, P, effect, 45, SEED, ORIGIN)
      );
    /* the editor's angle turns them, as it turns the glass */
    expect(shader().text("webgl")).toContain(
      `${ORIGIN}/${SEED}?style=${kind}&angle=45&speed=2&${look}`
    );
    expect(shader().note?.()).toBe(notes[kind]);
  }
});

test("a soft, grained vector effect's Shader tab writes every spelling with its finish and says so", async () => {
  vi.stubEnv("SSR", false);
  await tabsIn();
  const P = decodePalette(SEED)!;
  const writers: Record<VectorKind, Writers> = {
    silk: [silkWebgl, silkWebgpu],
    rosette: [rosetteWebgl, rosetteWebgpu],
    papercut: [papercutWebgl, papercutWebgpu],
    strings: [stringsWebgl, stringsWebgpu],
    dimple: [dimpleWebgl, dimpleWebgpu],
    ...(await kitWriters())
  };
  for (const kind of EFFECTS.filter(isVectorKind)) {
    const look = EFFECT_KINDS[kind].zoom ? "zoom=2.5" : "shape=12";
    const query = `style=${kind}&${look}`;
    const effect = parseEffect(new URLSearchParams(query))!;
    const finish = { soft: 40, grain: 30, underlay: effectUnderlay(P, effect, 45, 40) };
    const [webgl, webgpu] = writers[kind];
    const shader = () =>
      codeSources(
        P,
        { style: "radialGradient", steps: 6, angle: 45 },
        SEED,
        () => ({ facts: null, opened: false }),
        createRest(),
        { ...played(query), soft: 40, grain: 30 }
      ).find(s => s.id === "shader")!;
    expect(
      shader().spellings?.map(s => s.id),
      kind
    ).toEqual(["webgl", "webgpu", "glsl", "wgsl"]);
    expect(await loaded(() => shader().text())).toBe(
      webgl("webgl", P, effect, 45, SEED, ORIGIN, finish)
    );
    expect(await loaded(() => shader().text("wgsl"))).toBe(
      webgpu("wgsl", P, effect, 45, SEED, ORIGIN, finish)
    );
    expect(shader().text("webgl")).toContain(
      `${ORIGIN}/${SEED}?style=${kind}&angle=45&soft=40&grain=30&${look}`
    );
    expect(shader().note?.()).toMatch(
      / (?:in one pass|pass by pass)\. Then its soft and grain, as the site lays them over it\.$/
    );
  }
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
  /* the tile is shown elided as the CSS and SVG tabs show it; only the glass's picture of a first frame is cut short */
  expect(tab("html").note?.("style")).toBe(
    "The two tags that play it behind a page, for the page's head."
  );
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

test("the papercut's tags are the two that play it: its stepped still inside the page or its stylesheet linked, then its script", async () => {
  const P = decodePalette(SEED)!;
  const papercut = parseEffect(new URLSearchParams("style=papercut&shape=7"))!;
  await tabsIn();
  const html = effectSource("style=papercut&shape=7", "html")!;
  expect(html.spellings?.map(s => s.label)).toEqual(["<style>", "<link>"]);
  expect(await loaded(() => html.text("style"))).toBe(
    effectEmbedHtml(ORIGIN, SEED, papercut, 45, effectStill(P, papercut, 45))
  );
  expect(html.text("link")).toBe(effectEmbedHtml(ORIGIN, SEED, papercut, 45));
  for (const spelling of ["style", "link"])
    expect(html.text(spelling).split("\n").at(-1), spelling).toBe(
      `<script src="${ORIGIN}/${SEED}.js?style=papercut&amp;angle=45&amp;shape=7" async></script>`
    );
  expect(html.note?.("style")).toBe(
    "The two tags that play it behind a page, for the page's head."
  );
});
