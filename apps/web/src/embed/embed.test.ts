import { crc32, inflateSync } from "node:zlib";
import { parseEffect } from "@grabient/engine/effect.ts";
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
import { grainImage } from "./grain.ts";
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
  await Promise.all([
    import("./glass.ts"),
    import("./blob.ts"),
    import("./silk.ts"),
    import("./rosette.ts")
  ]);
});

describe("an effect's script", () => {
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
    expect(embedAsk(at("style=linearGradient"))).toBeNull();
  });

  test("adopts the stylesheet's own rules where a page has none, finished alike", async () => {
    for (const query of [
      "style=silk&angle=40&soft=50&grain=30",
      "style=rosette&amp;angle=120&amp;soft=40&amp;grain=30&amp;shape=7",
      "style=glass&angle=135&soft=50&grain=30",
      "style=blob&shape=51&bg=%23151315&soft=50&grain=30",
      "style=blob&shape=51&bg=%2300000080&soft=50",
      "style=blob&shape=51&soft=50&grain=30",
      "style=silk&angle=40"
    ]) {
      const served = await (
        await fileAnswer(new Request(`${ORIGIN}/${SEED}.css?${query}`), env, "css")
      ).text();
      const ask = embedAsk(new URL(`${ORIGIN}/${SEED}.js?${query}`));
      if (!ask) throw new Error(`no effect in ${query}`);
      const { P, effect, angle, finish } = ask;
      const embed = embeds.get(effect.kind) as EmbedEffect;
      const grain = finish.grain ? await grainImage(finish.grain) : undefined;
      const adopted = effectLayerCss(
        embed.still(P, effect, angle),
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
