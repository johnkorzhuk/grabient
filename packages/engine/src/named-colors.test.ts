import { describe, expect, test } from "vitest";
import { colorCodes, namedColor, namedColors } from "./named-colors.ts";

describe("named colors", () => {
  test("a name stands at CSS's value where CSS has the word, else at the precise list's", () => {
    expect(namedColor("navy")).toEqual({ name: "navy", hex: "#000080" });
    expect(namedColor("beige")?.hex).toBe("#f5f5dc");
    expect(namedColor("burgundy")).toEqual({ name: "burgundy", hex: "#900020" });
    expect(namedColor("taupe")?.hex).toBe("#b9a281");
    expect(namedColors().filter(c => /^(gr[ae]y|dark slate gr[ae]y)$/.test(c.name))).toHaveLength(
      4
    );
  });

  test("a search's or an address's words around a name are read past", () => {
    expect(namedColor("Sky blue gradients")?.name).toBe("sky blue");
    expect(namedColor("skyblue")?.name).toBe("sky blue");
    expect(namedColor("off-white-color-palette")?.name).toBe("off white");
    expect(namedColor("magenta-color-palette")?.hex).toBe("#ff00ff");
    expect(namedColor("Gold color code")?.hex).toBe("#ffd700");
    expect(namedColor("navy blue")?.name).toBe("navy");
    expect(namedColor("sage green")?.name).toBe("sage");
  });

  test("a theme, two colors or nothing names no one color", () => {
    for (const words of [
      "sunset",
      "blue and green",
      "blue-and-green-gradients",
      "dark academia",
      "gradients",
      ""
    ]) {
      expect([words, namedColor(words)]).toEqual([words, null]);
    }
  });

  test("codes as CSS writes them, a gray's hue none", () => {
    expect(colorCodes("#900020")).toEqual({
      hex: "#900020",
      rgb: "rgb(144 0 32)",
      hsl: "hsl(347 100% 28%)",
      oklch: "oklch(41.3% 0.166 20.8)"
    });
    expect(colorCodes("#808080")).toMatchObject({
      hsl: "hsl(0 0% 50%)",
      oklch: "oklch(60.0% 0.000 none)"
    });
    expect(colorCodes("FFFFFF")?.hex).toBe("#ffffff");
    expect(colorCodes("navy")).toBeNull();
  });
});
