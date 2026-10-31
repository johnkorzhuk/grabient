import { describe, expect, test } from "vitest";
import {
  APART,
  huesApart,
  inkThrough,
  LARGE,
  lettersTheme,
  MARK,
  orderedScale,
  pressOn,
  SEEN,
  seriesOf,
  standsOut,
  TEXT,
  TILE,
  tileFor
} from "./fit.ts";
import { worstContrast } from "./paint.ts";

/* The owner's own verdicts, as the colors on his screens: the line that reads (blue rising to yellow), the blob
   palette whose calendar said nothing in order, and the line whose black part vanished on the dark tile. */
const RISING = ["#4441d9", "#4834e2", "#5433e2", "#6632e3", "#8e3ed2", "#c065b8", "#f7d17b"];
const BLOB = [
  "#5a63ae",
  "#8459a1",
  "#a0485e",
  "#786300",
  "#007863",
  "#3b768e",
  "#627593",
  "#736b8a",
  "#74586f"
];
const SINKING = ["#e8833a", "#a85a2a", "#3a2015", "#000000", "#2a1018", "#b0507a", "#f0c0e0"];

describe("an ordered scale", () => {
  test("blue rising to yellow reads as one, its high end the one that stands out most", () => {
    const scale = orderedScale(RISING, TILE.dark);
    expect(scale.fits).toBe(true);
    expect(scale.colors.at(-1)).toBe("#f7d17b");
    expect(scale.span).toBeGreaterThanOrEqual(0.25);
  });
  test("turned around on a light tile, so its darkest end says the most there", () => {
    expect(orderedScale(RISING, TILE.light).colors.at(-1)).toBe("#4441d9");
  });
  test("a palette whose lightness stays level says nothing in order", () => {
    const scale = orderedScale(BLOB, TILE.dark);
    expect(scale.fits).toBe(false);
    expect(scale.span).toBeLessThan(0.25);
  });
  test("a palette that sinks to black and rises again says two values with one color", () => {
    const scale = orderedScale(SINKING, TILE.dark);
    expect(scale.fits).toBe(false);
    expect(scale.back).toBeGreaterThan(0.04);
  });
});

describe("marks on a tile", () => {
  test("the rising line stands out on the dark tile, at 2:1 and up", () => {
    expect(standsOut(RISING, TILE.dark)).toBe(true);
    expect(worstContrast(TILE.dark, RISING)).toBeGreaterThanOrEqual(SEEN);
    expect(tileFor(RISING)).toBe("dark");
  });
  test("black vanishes on the dark tile and pale pink on the light one: no tile holds the sinking line", () => {
    expect(standsOut(SINKING, TILE.dark)).toBe(false);
    expect(standsOut(SINKING, TILE.light)).toBe(false);
    expect(tileFor(SINKING)).toBeNull();
  });
});

describe("series colors", () => {
  test("the blob palette's level colors are still four series told apart", () => {
    const series = seriesOf(BLOB, 4, TILE.dark);
    expect(series.fits).toBe(true);
    expect(series.colors).toHaveLength(4);
    expect(series.apart).toBeGreaterThanOrEqual(APART);
    /* kept in the palette's order */
    expect(series.colors.map(c => BLOB.indexOf(c))).toEqual(
      [...series.colors.map(c => BLOB.indexOf(c))].sort((a, b) => a - b)
    );
  });
  test("shades of one gray are not series", () => {
    expect(seriesOf(["#808080", "#858585", "#8a8a8a", "#7b7b7b"], 3, TILE.dark).fits).toBe(false);
  });
  test("only colors that stand out from the ground are taken", () => {
    const series = seriesOf(SINKING, 3, TILE.dark);
    expect(series.colors).not.toContain("#000000");
  });
  test("black and a near black a screen shows alike are not two series, though OKLab holds them 0.17 apart", () => {
    expect(seriesOf(["#000000", "#130f0e"], 2, TILE.light).fits).toBe(false);
    expect(seriesOf(["#000000", "#2a2a2a"], 2, TILE.light).fits).toBe(true);
  });
  test("series told apart by hue and chroma stand farther apart there than ones told apart by lightness alone", () => {
    /* the sinking palette's avatars: orange, mauve and pink on the dark paper; brown, black, a near black and mauve on
       the light one */
    expect(huesApart(["#e8833a", "#907078", "#f0c0e0"])).toBeGreaterThan(
      huesApart(["#854814", "#000000", "#1b1514", "#907078"])
    );
    expect(huesApart(["#000000"])).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("a press", () => {
  test("filled with a color that stands out from the surface, its label readable, its hover another color", () => {
    const press = pressOn(RISING, TILE.dark);
    expect(press).not.toBeNull();
    if (!press) return;
    expect(worstContrast(TILE.dark, [press.fill])).toBeGreaterThanOrEqual(MARK);
    expect(worstContrast(press.label, [press.fill, press.hover])).toBeGreaterThanOrEqual(TEXT);
  });
  test("none from a palette with no color that both stands out and carries a label", () => {
    expect(pressOn(["#16161a", "#1c1c20"], TILE.dark)).toBeNull();
  });
});

describe("words", () => {
  test("an ink reads through every color or none is given", () => {
    expect(inkThrough(["#000000", "#202020"])?.ink).toBe("#ffffff");
    expect(inkThrough(["#000000", "#ffffff"])).toBeNull();
    expect(inkThrough(["#7a7a7a"], LARGE)).not.toBeNull();
  });
  test("a heading in the palette's colors stands on the page where all of them read as large words", () => {
    expect(lettersTheme(["#ffffff", "#e0e0f0"])).toBe("dark");
    expect(lettersTheme(SINKING)).toBeNull();
  });
});
