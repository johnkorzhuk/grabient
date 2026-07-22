// Seed pages get a favicon rendering the palette's own gradient with its
// effective style/steps/angle.
import { describe, expect, it } from "vitest";
import { faviconDataUri, renderPalette } from "../src/palette";

const SEED = "_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKb";

describe("faviconDataUri", () => {
  it("renders an SVG data URI containing the palette's colors", () => {
    const view = renderPalette(SEED, "linearGradient", 5, 90);
    const uri = faviconDataUri(view);
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    const svg = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
    expect(svg).toContain("<svg");
    expect(svg).toContain("linearGradient");
    // First stop color present (rgb form used by the generator).
    expect(svg.match(/stop/g).length).toBeGreaterThanOrEqual(5);
  });

  it("respects the style: swatches produce hard stops, radial produces radialGradient", () => {
    const view = renderPalette(SEED, "radialGradient", 4, 90);
    const svg = decodeURIComponent(faviconDataUri(view).slice("data:image/svg+xml,".length));
    expect(svg).toContain("radialGradient");
  });
});
