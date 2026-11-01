import { contrastOf, hexToSrgb, luminance, toEncoded, toLinear } from "@grabient/engine/color.ts";
import { blobShapeOf, EFFECT_LOOK, EFFECT_PLAY, type Effect } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import type { Style } from "@grabient/engine/view.ts";
import { describe, expect, test } from "vitest";
import { TEXT } from "./fit.ts";
import { ALPHA_BYTES, type Frost, frostOn, SHEEN } from "./frost.ts";
import { drawnColors, type Part, type Shown } from "./paint.ts";

/* the widget's card and its blur's reach, as Cards.tsx lays them */
const CARD: Part = { x0: 0.06, y0: 0.15, x1: 0.52, y1: 0.85 };
const ASPECT = 1.98;
const REACH = 0.075;

const shown = (
  palette: Palette,
  style: Style,
  angle = 90,
  steps = 7,
  effect: Effect | null = null
): Shown => ({
  seed: "kTest",
  palette,
  view: { style, steps, angle },
  effect
});
const GRAYS: Palette = {
  anchors: [
    { l: 0, c: 0, h: 0 },
    { l: 1, c: 0, h: 0 }
  ]
};
const NAVY: Palette = {
  anchors: [
    { l: 0.34, c: 0.12, h: 265 },
    { l: 0.16, c: 0.05, h: 265 }
  ]
};
const PALE: Palette = {
  anchors: [
    { l: 0.97, c: 0.03, h: 95 },
    { l: 0.93, c: 0.04, h: 20 }
  ]
};
/* a red beside a green: blended in sRGB they make an olive darker than both */
const RED_GREEN: Palette = {
  anchors: [
    { l: 0.63, c: 0.25, h: 29 },
    { l: 0.87, c: 0.29, h: 142 }
  ]
};

/* ---- what the browser shows, worked out on its own ---- */

type Rgb = number[];
const rgb = (hex: string): Rgb => [...(hexToSrgb(hex) ?? [0, 0, 0])];
/** A linear gradient's or bands' color at a point, for the angles 90 (start to end) and 0 (foot to top), as CSS lays
    them: written here apart from paint.ts, so the test checks it too. */
function pictureAt(s: Shown, colors: readonly Rgb[], x: number, y: number): Rgb {
  const n = colors.length;
  const t = Math.min(1, Math.max(0, s.view.angle === 90 ? x : 1 - y));
  if (s.view.style === "linearSwatches") return colors[Math.min(n - 1, Math.floor(t * n))];
  const u = t * (n - 1);
  const i = Math.min(n - 2, Math.floor(u));
  return colors[i].map((v, k) => v + (colors[i + 1][k] - v) * (u - i));
}
/** A one-axis Gaussian of `sigma` pixels, out to three of them. */
function kernelOf(sigma: number): number[] {
  const r = Math.ceil(3 * sigma);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) =>
    Math.exp(-((i - r) ** 2) / (2 * sigma * sigma))
  );
  const sum = k.reduce((a, b) => a + b, 0);
  return k.map(v => v / sum);
}
/** An image blurred by a Gaussian along both axes, its edges held, blended in sRGB or in linear light. */
function blurred(image: Rgb[][], sigma: number, linear: boolean): Rgb[][] {
  const k = kernelOf(sigma);
  const r = (k.length - 1) / 2;
  const into = linear ? (v: number) => toLinear(v) : (v: number) => v;
  const back = linear ? (v: number) => toEncoded(v) : (v: number) => v;
  const h = image.length;
  const w = image[0].length;
  const src = image.map(row => row.map(c => c.map(into)));
  const pass = (get: (y: number, x: number) => Rgb, alongX: boolean) =>
    Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => {
        const out = [0, 0, 0];
        for (let i = -r; i <= r; i++) {
          const c = alongX
            ? get(y, Math.min(w - 1, Math.max(0, x + i)))
            : get(Math.min(h - 1, Math.max(0, y + i)), x);
          for (let ch = 0; ch < 3; ch++) out[ch] += c[ch] * k[i + r];
        }
        return out;
      })
    );
  const rows = pass((y, x) => src[y][x], true);
  return pass((y, x) => rows[y][x], false).map(row => row.map(c => c.map(back)));
}
const over = (under: Rgb, top: Rgb, alpha: number) => under.map((v, i) => v + (top[i] - v) * alpha);
const byte = (c: Rgb) => c.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255) / 255);

/** The least contrast the words have anywhere on the card as a browser draws it: the picture at 160 pixels across,
    blurred by 2.5% of the width, blended in sRGB and in linear light, both over the whole widget and over the card's
    own box with its edges held (as Chromium clips a backdrop); veiled, and lit by the sheen under white words. */
function shownLeast(s: Shown, frost: Frost): number {
  const w = 160;
  const h = Math.round(w / ASPECT);
  const colors = drawnColors(s).map(rgb);
  const picture = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => pictureAt(s, colors, (x + 0.5) / w, (y + 0.5) / h))
  );
  const [x0, x1] = [Math.ceil(CARD.x0 * w), Math.floor(CARD.x1 * w)];
  const [y0, y1] = [Math.ceil(CARD.y0 * h), Math.floor(CARD.y1 * h)];
  const clipped = picture.slice(y0, y1).map(row => row.slice(x0, x1));
  const tint = rgb(frost.tint);
  const ink = luminance(rgb(frost.ink));
  let least = 21;
  for (const linear of [false, true]) {
    const whole = blurred(picture, 0.025 * w, linear)
      .slice(y0, y1)
      .map(row => row.slice(x0, x1));
    const card = blurred(clipped, 0.025 * w, linear);
    for (const image of [whole, card])
      for (const row of image)
        for (const c of row) {
          const veiled = over(c, tint, frost.alpha);
          const lit = frost.ink === "#ffffff" ? over(veiled, [1, 1, 1], SHEEN) : veiled;
          least = Math.min(least, contrastOf(ink, luminance(byte(lit))));
        }
  }
  return least;
}

/** Palettes of two to five keyframes, the same each run. */
function palettesOf(count: number): Palette[] {
  let seed = 7;
  const next = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 2 ** 32;
  };
  return Array.from({ length: count }, () => ({
    anchors: Array.from({ length: 2 + Math.floor(next() * 4) }, () => ({
      l: next(),
      c: next() * 0.3,
      h: next() * 360
    }))
  }));
}

describe("frostOn", () => {
  test("a deep palette takes white words on its own darkest color, at the clearest veil", () => {
    const frost = frostOn(shown(NAVY, "linearGradient"), CARD, ASPECT, REACH);
    expect(frost.ink).toBe("#ffffff");
    expect(frost.tint).toBe(drawnColors(shown(NAVY, "linearGradient")).at(-1));
    expect(frost.alpha).toBe(ALPHA_BYTES[0] / 255);
    expect(frost.veil).toBe(`${frost.tint}1f`);
    expect(frost.ratio).toBeGreaterThanOrEqual(TEXT);
  });

  test("a pale palette takes black words on its own lightest color, at the clearest veil", () => {
    const frost = frostOn(shown(PALE, "linearGradient"), CARD, ASPECT, REACH);
    expect(frost.ink).toBe("#000000");
    expect(frost.alpha).toBe(ALPHA_BYTES[0] / 255);
    expect(frost.ratio).toBeGreaterThanOrEqual(TEXT);
  });

  test("the card reads the side it stands on: white words where black starts the line under it, black where white does", () => {
    const onBlack = frostOn(shown(GRAYS, "linearGradient", 90), CARD, ASPECT, REACH);
    const onWhite = frostOn(shown(GRAYS, "linearGradient", 270), CARD, ASPECT, REACH);
    expect(onBlack.ink).toBe("#ffffff");
    expect(onWhite.ink).toBe("#000000");
  });

  test("bands meeting under the card are read on their darkest blend, so black words veil more than on either", () => {
    const apart = frostOn(shown(RED_GREEN, "linearSwatches", 90, 2), CARD, ASPECT, REACH);
    const red = frostOn(
      shown(RED_GREEN, "linearSwatches", 90, 2),
      { ...CARD, x1: 0.3 },
      ASPECT,
      REACH
    );
    expect(apart.alpha).toBeGreaterThan(red.alpha);
  });

  test("the words read as the browser draws the glass, whatever the palette, its form and its side", () => {
    const cases: Shown[] = [
      shown(GRAYS, "linearGradient", 90),
      shown(GRAYS, "linearGradient", 0),
      shown(GRAYS, "linearSwatches", 90, 2),
      shown(GRAYS, "linearSwatches", 0, 3),
      shown(RED_GREEN, "linearSwatches", 90, 2),
      shown(NAVY, "linearGradient"),
      shown(PALE, "linearSwatches", 0, 5),
      ...palettesOf(40).flatMap((p, i) => [
        shown(p, "linearGradient", i % 2 ? 90 : 0, 5 + (i % 4)),
        shown(p, "linearSwatches", i % 2 ? 0 : 90, 2 + (i % 7))
      ])
    ];
    for (const s of cases) {
      const frost = frostOn(s, CARD, ASPECT, REACH);
      expect(frost.ratio).toBeGreaterThanOrEqual(TEXT);
      expect(shownLeast(s, frost)).toBeGreaterThanOrEqual(TEXT);
    }
  });

  test("every palette gets a glass its words read on, in every form, by the last veil at most", () => {
    const glass: Effect = { kind: "glass", ...EFFECT_PLAY, look: EFFECT_LOOK };
    const styles: Style[] = [
      "linearGradient",
      "linearSwatches",
      "angularGradient",
      "angularSwatches",
      "radialGradient",
      "radialSwatches"
    ];
    palettesOf(120).forEach((p, i) => {
      const blob: Effect = {
        kind: "blob",
        ...EFFECT_PLAY,
        look: { ...EFFECT_LOOK, shape: blobShapeOf(`k${i}`), bg: "#101828" }
      };
      for (const s of [
        shown(p, styles[i % styles.length], (i * 37) % 360, 2 + (i % 9)),
        shown(p, "linearGradient", (i * 53) % 360, 7, glass),
        shown(p, "linearGradient", 90, 7, blob)
      ]) {
        const frost = frostOn(s, CARD, ASPECT, REACH);
        expect(frost.ratio).toBeGreaterThanOrEqual(TEXT);
        expect(frost.alpha).toBeLessThanOrEqual(ALPHA_BYTES.at(-1)! / 255);
      }
    });
  });

  test("at the last veil, white words read on black laid over white, the sheen on it", () => {
    const veiled = over([1, 1, 1], [0, 0, 0], ALPHA_BYTES[ALPHA_BYTES.length - 1] / 255);
    const lit = over(veiled, [1, 1, 1], SHEEN).map(v => Math.ceil(v * 255) / 255);
    expect(contrastOf(1, luminance(lit))).toBeGreaterThanOrEqual(TEXT);
  });
});
