import { readFile } from "node:fs/promises";
import { decodePalette } from "@grabient/engine/codec.ts";
import { drawnView, STYLES, type View } from "@grabient/engine/view.ts";
import { describe, expect, test } from "vitest";
import { at, decodePng, pixelHash } from "../../../test/png.ts";
import { emailHead } from "./cards.ts";
import golden from "./fixtures/pictures.json" with { type: "json" };
import { HEX_SIZES } from "./hex-glyphs.data.ts";
import { drawCard, drawPicture, drawWedges, keyframeColors, lookOf, wedgeStart } from "./paint.ts";

const { defaultSeed, graySeed, eightSeed } = golden;
const palette = (seed: string) => {
  const P = decodePalette(seed);
  if (!P) throw new Error(`${seed} is no palette`);
  return P;
};
const look = (seed: string, view: Partial<View> = {}) =>
  lookOf(palette(seed), drawnView(palette(seed), view));
const card = (seed: string, view: Partial<View> = {}, chips = true, width = 1200, height = 630) =>
  drawCard(look(seed, view), chips ? keyframeColors(palette(seed)) : null, width, height);

async function matches(name: string, png: Uint8Array) {
  const want = golden.pictures.find(picture => picture.name === name);
  if (!want) throw new Error(`No golden picture named ${name}`);
  const drawn = await decodePng(png);
  expect([drawn.width, drawn.height, drawn.chunks]).toEqual([want.width, want.height, want.chunks]);
  for (const [xy, color] of Object.entries(want.samples)) {
    const [x, y] = xy.split(",").map(Number);
    expect([xy, at(drawn, x, y)]).toEqual([xy, color]);
  }
  expect(await pixelHash(drawn.pixels)).toBe(want.rgbSha256);
}

describe("a palette's picture", () => {
  test.each(STYLES)("draws %s as the golden picture does", async style => {
    await matches(
      `plain ${style} steps 9 angle 42, 96x64`,
      await drawPicture(look(defaultSeed, { style, steps: 9, angle: 42 }), 96, 64)
    );
  });

  test("a strip, a dot and a row of bands are the view's stops at each pixel's middle", async () => {
    await matches("palette png 256x1 strip", await drawPicture(look(defaultSeed), 256, 1));
    await matches("palette png 1x1", await drawPicture(look(defaultSeed), 1, 1));
    const bands = look(defaultSeed, { style: "linearSwatches" });
    await matches("palette png linearSwatches 7x1", await drawPicture(bands, 7, 1));
    const row = await decodePng(await drawPicture(bands, 7, 1));
    expect(Array.from({ length: 7 }, (_, x) => at(row, x, 0))).toEqual(
      bands.colors.map(color => color.map(Math.round))
    );
    await matches("palette png default 1200x630", await drawPicture(look(defaultSeed), 1200, 630));
  });

  test("bands are hard: every pixel is one of the stops", async () => {
    for (const style of STYLES.filter(s => s.endsWith("Swatches"))) {
      const gray = look(graySeed, { style, steps: 3 });
      const stops = new Set(gray.colors.map(color => Math.round(color[0])));
      const picture = await decodePng(await drawPicture(gray, 101, 101));
      for (let i = 0; i < picture.pixels.length; i += 3)
        expect(stops.has(picture.pixels[i])).toBe(true);
    }
  });
});

describe("a share card", () => {
  test("is the palette to its edges, the wordmark and a chip with its hex to each keyframe", async () => {
    await matches("card default (3 keyframe chips)", await card(defaultSeed));
    await matches("card two keyframes (gray)", await card(graySeed));
    await matches("card eight keyframes", await card(eightSeed));
    await matches(
      "card radialGradient steps 100",
      await card(defaultSeed, { style: "radialGradient", steps: 100 })
    );
  });

  test("without chips runs to its foot, and as an email's head keeps the wordmark at its own size", async () => {
    await matches("card chips=off", await card(defaultSeed, {}, false));
    await matches("card head=800x200", await card(defaultSeed, {}, false, 800, 200));
  });

  test("sets every hex at 26 or 22 pixels: the smaller fits the widest hex on the narrowest of eight chips", () => {
    const narrowest = Math.min(
      ...Array.from(
        { length: 8 },
        (_, i) => Math.round((1200 * (i + 1)) / 8) - Math.round((1200 * i) / 8)
      )
    );
    const smallest = HEX_SIZES.at(-1);
    if (!smallest) throw new Error("No glyphs");
    const widest = smallest.widths[0] + 6 * Math.max(...smallest.widths.slice(1));
    expect([HEX_SIZES.map(set => set.size), widest + 2 * 12 <= narrowest]).toEqual([
      [26, 22],
      true
    ]);
  });

  test("as an email's head wears the palette as saved, or the brand's gradient where it wears none", async () => {
    await matches("card head=800x200", await emailHead({ seed: defaultSeed }));
    await matches("brand head 800x200 (account email, no palette)", await emailHead(undefined));
    await matches(
      "brand head 800x200 (account email, no palette)",
      await emailHead({ seed: "kBroken" })
    );
    await matches(
      "brand head 1200x300 (newsletter, no palette)",
      await emailHead(undefined, 1200, 300)
    );
  });
});

describe("a picture of several palettes", () => {
  const ten: Partial<View>[] = [
    { style: "linearGradient", steps: 7, angle: 45 },
    { style: "radialGradient", steps: 5 },
    { style: "linearSwatches", steps: 4, angle: 180 },
    { style: "angularSwatches", steps: 6, angle: 10 },
    { style: "angularGradient", steps: 21 },
    { style: "linearSwatches", steps: 3 },
    { style: "radialSwatches", steps: 9 },
    {},
    { style: "radialGradient", steps: 32 },
    { style: "radialSwatches", steps: 12 }
  ];
  const looks = ten.map((view, i) => look(i % 2 ? graySeed : defaultSeed, view));

  test.each([1, 2, 5, 9])(
    "of %i is wedges about the middle, the first under the wordmark",
    async n => {
      await matches(`montage card of ${n}`, await drawWedges(looks.slice(0, n), 1200, 630, true));
    }
  );

  test("unbranded at another size is the same wedges without the wordmark", async () => {
    await matches(
      "montage png of 7 at 600x400",
      await drawWedges(looks.slice(0, 7), 600, 400, false)
    );
  });

  test("turns its first wedge's middle through the wordmark", () => {
    for (const n of [1, 2, 5, 7, 9]) {
      const middle = wedgeStart(n, 1200, 630) + Math.PI / n;
      expect(middle).toBeCloseTo(Math.atan2(32 + 286 / 2 - 600, 315 - (32 + 97) / 2), 12);
    }
  });
});

describe("the pictures the site serves as files", () => {
  const served = async (path: string) =>
    pixelHash(
      (await decodePng(await readFile(new URL(`../../../../${path}`, import.meta.url)))).pixels
    );
  const drawn = async (png: Uint8Array) => pixelHash((await decodePng(png)).pixels);

  test("are what the painter draws today: redraw them with scripts/build-icons.ts", async () => {
    expect(await served("web/public/grabient.png")).toBe(await drawn(await card(defaultSeed)));
    for (const [file, width, height] of [
      ["email/head-sheet.png", 800, 200],
      ["email/head-letter.png", 1200, 300]
    ] as const) {
      const head = await drawn(await emailHead(undefined, width, height));
      expect([file, await served(`web/public/${file}`)]).toEqual([file, head]);
      expect([file, await served(`design/public/${file}`)]).toEqual([file, head]);
    }
  });
});
