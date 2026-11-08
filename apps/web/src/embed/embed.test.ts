import { crc32, inflateSync } from "node:zlib";
import { cssColorText } from "@grabient/engine/css-color.ts";
import { EFFECTS, hasEmbedScript, parseEffect } from "@grabient/engine/effect.ts";
import { effectLayers } from "@grabient/engine/effect-code.ts";
import { effectLayerCss } from "@grabient/engine/effect-embed.ts";
import { GRAIN_SIDE, grainTile } from "@grabient/engine/grain.ts";
import { finishOf } from "@grabient/engine/view.ts";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { addressParams, viewAt } from "../server/files/address.ts";
import { grainData } from "../server/files/grain.ts";
import { fileAnswer } from "../server/files/palette-files.ts";
import { readyOldIds } from "../server/seo/legacy.ts";
import { embedAsk } from "./address.ts";
import { KINDS } from "./build.ts";
import { grainImage } from "./grain.ts";
import { srgbHex } from "./ground.ts";
import type { EmbedEffect } from "./mount.ts";

/* each kind's script hands mount() what it plays; held here instead of played */
const embeds = vi.hoisted(() => new Map<string, unknown>());
vi.mock("./mount.ts", () => ({
  mount: (embed: { kind: string }) => embeds.set(embed.kind, embed)
}));
vi.hoisted(() => Object.assign(globalThis, { __COLOR_NAMES__: "/assets/color-names-test.txt" }));
vi.mock("../server/collections/files.ts", () => ({
  isCollectionSlug: () => false,
  collectionForFiles: vi.fn(async () => null),
  texts: vi.fn(async () => []),
  writtenWords: vi.fn(() => null)
}));

const SEED = "kUMzO5Na871ukuyhHUJA";
const ORIGIN = "https://grabient.test";
const env = { DB: {} as D1Database, PUBLIC_ORIGIN: ORIGIN };
/* the grain's tile a file carries, its base64 */
const TILE = /url\("data:image\/png;base64,([\w+/=]+)"\) 0 0 \/ 128px 128px/;

/** A PNG's RGBA, every chunk's CRC checked and its data inflated by zlib, which checks its Adler-32. */
function pngPixels(base64: string): Uint8Array {
  const png = Buffer.from(base64, "base64");
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  let palette = new Uint8Array();
  let alphas = new Uint8Array();
  const data: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    const type = png.toString("latin1", at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    expect(crc32(png.subarray(at + 4, at + 8 + length))).toBe(png.readUInt32BE(at + 8 + length));
    if (type === "IHDR") {
      expect([body.readUInt32BE(0), body.readUInt32BE(4), body[8], body[9]]).toEqual([
        GRAIN_SIDE,
        GRAIN_SIDE,
        8,
        3
      ]);
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") alphas = body;
    else if (type === "IDAT") data.push(body);
    at += 12 + length;
  }
  const rows = inflateSync(Buffer.concat(data));
  expect(rows.length).toBe(GRAIN_SIDE * (GRAIN_SIDE + 1));
  const out = new Uint8Array(GRAIN_SIDE * GRAIN_SIDE * 4);
  for (let y = 0; y < GRAIN_SIDE; y++) {
    expect(rows[y * (GRAIN_SIDE + 1)]).toBe(0);
    for (let x = 0; x < GRAIN_SIDE; x++) {
      const i = rows[y * (GRAIN_SIDE + 1) + 1 + x];
      const k = (y * GRAIN_SIDE + x) * 4;
      out.set(palette.subarray(i * 3, i * 3 + 3), k);
      out[k + 3] = i < alphas.length ? alphas[i] : 255;
    }
  }
  return out;
}
const tileOf = (css: string) => TILE.exec(css)?.[1];

beforeAll(async () => {
  await readyOldIds();
  await Promise.all(KINDS.map(kind => import(`./${kind}.ts`)));
});

test("every effect with a script is built, each script mounting its own kind", () => {
  expect([...KINDS].sort()).toEqual(EFFECTS.filter(hasEmbedScript).sort());
  expect([...embeds.keys()].sort()).toEqual([...KINDS].sort());
});

/* a ground's words, and the sRGB that Chromium 152, Firefox 157 and WebKit 26 (Playwright 1.64) compute for
   color-mix(in srgb, words, words), as W/styles-lab/sg/embed-fix/colors-probe.mjs read them */
const COMPUTED: [string, string, string, string][] = [
  ["navy", "color(srgb 0 0 0.501961)", "color(srgb 0 0 0.501961)", "color(srgb 0 0 0.501961)"],
  [
    "rgb(0 0 0 / 50%)",
    "color(srgb 0 0 0 / 0.5)",
    "color(srgb 0 0 0 / 0.5)",
    "color(srgb 0 0 0 / 0.5)"
  ],
  [
    "rgba(10, 20, 30, 0.3)",
    "color(srgb 0.0392157 0.0784314 0.117647 / 0.301961)",
    "color(srgb 0.0392157 0.0784314 0.117647 / 0.3)",
    "color(srgb 0.039216 0.078431 0.117647 / 0.3)"
  ],
  [
    "hsl(200 50% 40%)",
    "color(srgb 0.2 0.466667 0.6)",
    "color(srgb 0.2 0.466667 0.6)",
    "color(srgb 0.2 0.466667 0.6)"
  ],
  [
    "hwb(120 10% 20% / 0.7)",
    "color(srgb 0.1 0.8 0.1 / 0.7)",
    "color(srgb 0.1 0.8 0.1 / 0.7)",
    "color(srgb 0.1 0.8 0.1 / 0.7)"
  ],
  [
    "oklch(0.5 0.1 200)",
    "color(srgb -0.153058 0.45306 0.476905)",
    "color(srgb -0.15293 0.453039 0.476874)",
    "color(srgb -0.15293 0.453039 0.476874)"
  ],
  [
    "oklch(0.7 0.4 30)",
    "color(srgb 1.3196 -0.449799 -0.310059)",
    "color(srgb 1.31965 -0.449821 -0.310086)",
    "color(srgb 1.319647 -0.449821 -0.310086)"
  ],
  [
    "lab(50 40 -20)",
    "color(srgb 0.670292 0.354655 0.604598)",
    "color(srgb 0.670353 0.354597 0.604597)",
    "color(srgb 0.670353 0.354597 0.604597)"
  ],
  [
    "color(display-p3 1 0 0)",
    "color(srgb 1.09302 -0.22669 -0.150073)",
    "color(srgb 1.09307 -0.226742 -0.150135)",
    "color(srgb 1.093066 -0.226742 -0.150135)"
  ],
  [
    "color(srgb 0.2 0.4 0.6 / 0.25)",
    "color(srgb 0.2 0.4 0.6 / 0.25)",
    "color(srgb 0.2 0.4 0.6 / 0.25)",
    "color(srgb 0.2 0.4 0.6 / 0.25)"
  ],
  ["transparent", "color(srgb 0 0 0 / 0)", "color(srgb 0 0 0 / 0)", "color(srgb 0 0 0 / 0)"],
  [
    "#abc8",
    "color(srgb 0.666667 0.733333 0.8 / 0.533333)",
    "color(srgb 0.666667 0.733333 0.8 / 0.533)",
    "color(srgb 0.666667 0.733333 0.8 / 0.533333)"
  ]
];

describe("an effect's script", () => {
  test("reads a blob's ground in other words than hex as the server's reader does, from what each browser computes", () => {
    for (const [words, ...computed] of COMPUTED)
      for (const seen of computed)
        expect([words, srgbHex(seen)]).toEqual([words, cssColorText(words)]);
    expect(srgbHex("rgba(10, 20, 30, 0.3)")).toBe("#0a141e4d");
    expect(srgbHex("rgb(255, 0, 0)")).toBe("#ff0000");
    expect(srgbHex("color(srgb none 0 0)")).toBeNull();
    expect(srgbHex("red")).toBeNull();
    /* a clear one: no ground of the blob's, the strings' clear one */
    expect(srgbHex("rgba(0, 0, 0, 0)")).toBeNull();
    expect(srgbHex("rgba(0, 0, 0, 0)", true)).toBe("#00000000");
    expect(srgbHex("color(srgb 1 0 0 / 0)", true)).toBe("#00000000");
    expect(srgbHex("rgba(10, 20, 30, 0.3)", true)).toBe("#0a141e4d");
  });

  test("its grain's tile, its rows stored, is the engine's tile pixel for pixel and the stylesheet's", async () => {
    for (const grain of [1, 30, 100]) {
      const made = (await grainImage(grain)).match(/base64,([\w+/=]+)/)?.[1] ?? "";
      const served = (await grainData(grain)).replace("data:image/png;base64,", "");
      expect(pngPixels(made)).toEqual(grainTile(grain));
      expect(pngPixels(made)).toEqual(pngPixels(served));
    }
  });

  test("reads its address as the stylesheet of the same address is read", () => {
    const at = (query: string) => new URL(`${ORIGIN}/${SEED}.js?${query}`);
    for (const query of [
      "style=silk&angle=40&soft=50&grain=30",
      "style=papercut&angle=30&soft=40&grain=30&shape=7&speed=0",
      // copied out of the tags' HTML, and a key twice, the last kept
      "style=rosette&amp;angle=120&amp;soft=40&amp;grain=30&amp;shape=7",
      "style=glass&angle=10&angle=135&soft=5&soft=50",
      // none where the view keeps none
      "style=glass&angle=135&soft=0&grain=101",
      "style=blob&shape=51&bg=%2300000080&soft=50"
    ]) {
      const ask = embedAsk(at(query));
      const params = addressParams(new URLSearchParams(query));
      const view = viewAt(params, ask?.P.anchors.length ?? 0);
      expect(ask?.effect).toEqual(parseEffect(params));
      expect([ask?.angle, ask?.finish]).toEqual([view.angle, finishOf(view)]);
    }
    expect(embedAsk(at("style=rosette&amp;angle=120&amp;soft=40"))).toMatchObject({
      angle: 120,
      finish: { soft: 40 }
    });
    expect(embedAsk(new URL(`${ORIGIN}/nothing.js?style=silk`))).toBeNull();
    // the sandstone's script reads its steps from its own address, as its stylesheet does; another effect's none
    expect(embedAsk(at("style=strata&steps=12"))?.effect.look.steps).toBe(12);
    expect(embedAsk(at("style=strata&steps=99"))?.effect.look.steps).toBe(40);
    expect(embedAsk(at("style=strata"))?.effect.look.steps).toBeNull();
    expect(embedAsk(at("style=zen&steps=12"))?.effect.look.steps).toBeNull();
    expect(embedAsk(at("style=linearGradient"))).toBeNull();
    // a blob's ground in other words than hex, at the hex the server's redirect answers it at; words that are no color go
    const ground = (query: string) => embedAsk(at(query), cssColorText)?.effect.look.bg;
    expect(ground("style=blob&bg=navy")).toBe("#000080");
    expect(ground("style=blob&bg=rgb(0 0 0 / 50%25)")).toBe("#00000080");
    expect(ground("style=blob&bg=%23151315")).toBe("#151315");
    expect(ground("style=blob&bg=nonsense")).toBeNull();
    expect(embedAsk(at("style=blob&bg=navy"))?.effect.look.bg).toBeNull();
    /* the strings' too, a clear one kept as their clear ground; another effect's bg is none */
    expect(ground("style=strings&bg=navy")).toBe("#000080");
    expect(ground("style=strings&bg=transparent")).toBe("#00000000");
    expect(ground("style=strings&bg=rgb(255 255 255 / 50%25)")).toBe("#ffffff80");
    expect(ground("style=strings&bg=%23f4efe6")).toBe("#f4efe6");
    expect(ground("style=strings")).toBeNull();
    expect(ground("style=blob&bg=transparent")).toBeNull();
    expect(ground("style=silk&bg=navy")).toBeNull();
  });

  test("adopts the stylesheet's own rules where a page has none, finished alike", async () => {
    /* the script's query, and the stylesheet's where the server redirects a ground in other words to its hex */
    for (const [query, redirected = query] of [
      ["style=silk&angle=40&soft=50&grain=30"],
      ["style=rosette&amp;angle=120&amp;soft=40&amp;grain=30&amp;shape=7"],
      ["style=glass&angle=135&soft=50&grain=30"],
      ["style=blob&shape=51&bg=%23151315&soft=50&grain=30"],
      ["style=blob&shape=51&bg=%2300000080&soft=50"],
      ["style=blob&shape=51&soft=50&grain=30"],
      ["style=silk&angle=40"],
      ["style=papercut&angle=30&soft=40&grain=30&shape=7"],
      ["style=papercut&amp;speed=0"],
      [
        "style=blob&shape=51&bg=rgb(0 0 0 / 50%25)&soft=50&grain=30",
        "style=blob&shape=51&bg=%2300000080&soft=50&grain=30"
      ],
      ["style=blob&shape=51&bg=navy&soft=50", "style=blob&shape=51&bg=%23000080&soft=50"],
      ["style=blob&shape=51&bg=nonsense", "style=blob&shape=51"],
      /* the strings on a ground of their own, a clear one, one in other words, a soft one that lets the page through */
      ["style=strings&angle=30&bg=%23f4efe6&soft=50&grain=30"],
      ["style=strings&bg=transparent&shape=7", "style=strings&bg=%2300000000&shape=7"],
      ["style=strings&bg=navy", "style=strings&bg=%23000080"],
      ["style=strings&bg=%2310203080&soft=40"]
    ]) {
      const served = await (
        await fileAnswer(new Request(`${ORIGIN}/${SEED}.css?${redirected}`), env, "css")
      ).text();
      /* the blob's script reads a ground's words in the browser (ground.ts), as the server's reader reads them */
      const ask = embedAsk(new URL(`${ORIGIN}/${SEED}.js?${query}`), cssColorText);
      if (!ask) throw new Error(`no effect in ${query}`);
      const { P, effect, angle, finish } = ask;
      const embed = embeds.get(effect.kind) as EmbedEffect;
      const grain = finish.grain ? await grainImage(finish.grain) : undefined;
      const adopted = effectLayerCss(
        await embed.still(P, effect, angle),
        effectLayers(P, effect, angle, finish, grain)
      );
      /* the file is the same rules under its credit, its tile deflated where the script's rows are stored */
      const [credit, ...rules] = served.split("\n");
      expect(credit).toMatch(/^\/\* https:\/\/grabient\.test\/.+ \*\/$/);
      const [servedTile, madeTile] = [tileOf(served), tileOf(adopted)];
      expect(!!servedTile).toBe(!!finish.grain);
      expect(rules.join("\n").replace(servedTile ?? "", "TILE")).toBe(
        adopted.replace(madeTile ?? "", "TILE")
      );
      if (servedTile && madeTile) expect(pngPixels(madeTile)).toEqual(pngPixels(servedTile));
    }
  });
});
