import { describe, expect, test } from "vitest";
import { decodePalette } from "./codec.ts";
import { colorKin } from "./color-kin.ts";
import { sampleStops } from "./curve.ts";

describe("a color's kin", () => {
  test("are its shades, light to dark with the color among them, then the colors that go with it, each a palette that draws those colors", () => {
    const kin = colorKin("#ff00ff");
    expect(kin.map(k => k.kind)).toEqual([
      "shades",
      "complementary",
      "analogous",
      "triadic",
      "split"
    ]);
    const [shades, complementary, analogous, triadic, split] = kin;
    expect(shades!.hexes).toHaveLength(7);
    expect(shades!.hexes).toContain("#ff00ff");
    const light = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16);
    expect([...shades!.hexes].sort((a, b) => light(b) - light(a))).toEqual(shades!.hexes);
    expect(complementary!.hexes).toHaveLength(2);
    for (const three of [analogous, triadic, split]) expect(three!.hexes).toHaveLength(3);
    expect(analogous!.hexes[1]).toBe("#ff00ff");
    for (const three of [complementary, triadic, split]) expect(three!.hexes[0]).toBe("#ff00ff");
    // each is a palette whose own colors are the ones listed
    for (const k of kin) {
      const palette = decodePalette(k.seed);
      expect(palette).not.toBeNull();
      expect(sampleStops(palette!, k.hexes.length).map(stop => stop.hex)).toEqual(k.hexes);
    }
  });
  test("of a gray are its shades alone, and of no color none", () => {
    for (const gray of ["#808080", "#000000", "#ffffff"])
      expect(colorKin(gray).map(k => k.kind)).toEqual(["shades"]);
    expect(colorKin("magenta")).toEqual([]);
  });
});
