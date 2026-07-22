// Canvas-mode header ink: analytic port of the OG image's region-luminance
// sampling (Rec.709 weights, 0.5 threshold). Bright top strip => dark ink.
import { describe, expect, it } from "vitest";
import { heroInk } from "../src/palette";

describe("heroInk", () => {
  it("picks dark ink over a bright gradient and light ink over a dark one", () => {
    const bright = heroInk({ hexColors: ["#ffffff", "#eeeeee"], style: "linearGradient", angle: 90 });
    expect(bright.ink).toBe("dark");
    const dark = heroInk({ hexColors: ["#000000", "#111111"], style: "linearGradient", angle: 90 });
    expect(dark.ink).toBe("light");
  });

  it("samples only the TOP strip: a to-bottom gradient is judged by its first color", () => {
    // CSS 180deg = to bottom: first color paints the top of the viewport.
    const darkTop = heroInk(
      { hexColors: ["#000000", "#ffffff"], style: "linearGradient", angle: 180 },
      430,
      860,
      100,
    );
    expect(darkTop.ink).toBe("light");
    // Flipped to 0deg (to top) the LAST color paints the top.
    const brightTop = heroInk(
      { hexColors: ["#000000", "#ffffff"], style: "linearGradient", angle: 0 },
      430,
      860,
      100,
    );
    expect(brightTop.ink).toBe("dark");
  });

  it("radial gradients judge the top strip by the outer stops", () => {
    // Center white -> edges black: the top strip is far from center => dark.
    const r = heroInk(
      { hexColors: ["#ffffff", "#000000"], style: "radialGradient", angle: 0 },
      430,
      860,
      100,
    );
    expect(r.ink).toBe("light");
  });

  it("swatch styles hard-step instead of blending", () => {
    // Two swatches, to-bottom: entire top half is exactly the first color.
    const s = heroInk(
      { hexColors: ["#ffffff", "#000000"], style: "linearSwatches", angle: 180 },
      430,
      860,
      100,
    );
    expect(s.avgHex).toBe("#ffffff");
    expect(s.ink).toBe("dark");
  });

  it("returns the average color for the browser theme-color", () => {
    const solid = heroInk({ hexColors: ["#336699", "#336699"], style: "linearGradient", angle: 90 });
    expect(solid.avgHex).toBe("#336699");
  });
});
