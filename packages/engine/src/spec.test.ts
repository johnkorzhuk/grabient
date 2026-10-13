import { expect, test } from "vitest";
import { golden, lcg } from "../test/support.ts";
import { canonical, decodePalette, encodePalette } from "./codec.ts";
import { hexToSrgb, lchToSrgb, srgbToLch, srgbToOklab, type Triple, toHex } from "./color.ts";
import { sampleSrgb, sampleStops } from "./curve.ts";
import type { Anchor, Palette } from "./palette.ts";
import { anchorsFromHexes, fromSpec, type Spec, toSpec } from "./spec.ts";

interface FixturePalette {
  id: string;
  canonicalSeed: string;
  specSeed: string;
  spec: Spec;
  input?: { hexes?: string[] };
  inputSeed?: string;
  anchorsFromHexes?: Anchor[];
}
const { palettes } = golden<{ palettes: FixturePalette[] }>("palettes");
const ops = golden<{
  fromHexes: {
    hexes: string[];
    anchors: Anchor[] | null;
    seed: string | null;
    drawn7: string[] | null;
  }[];
  specCases: { spec: unknown; seed: string | null }[];
}>("ops");
const seedOf = (P: Palette | null) => P && encodePalette(P);

test("a written spec reads back as the seed it came from", () => {
  for (const p of palettes) {
    const P = decodePalette(p.canonicalSeed) as Palette;
    expect(toSpec(P), p.id).toEqual(p.spec);
    expect(seedOf(fromSpec(JSON.parse(JSON.stringify(p.spec)))), p.id).toBe(p.canonicalSeed);
  }
  /* a near gray held by its own hue read back as one carrying another before: these two now keep their seeds */
  expect(palettes.filter(p => p.specSeed !== p.canonicalSeed).map(p => p.id)).toEqual([
    "hex-gray-015",
    "edge-003"
  ]);
});

test("a spec that is no palette is null, and numbers are clamped and walled", () => {
  for (const c of ops.specCases) expect(seedOf(fromSpec(c.spec))).toBe(c.seed);
  expect(fromSpec({ anchors: [7, { l: 0.2, c: 0.1, h: 9 }] })).toBeNull();
  expect(
    fromSpec({
      anchors: [
        { l: 0.5, c: 0.1, h: Number.NaN },
        { l: 0.2, c: 0.1, h: 9 }
      ]
    })
  ).toBeNull();
});

test("hex colors become keyframes held as their hexes", () => {
  for (const c of ops.fromHexes) {
    const P = anchorsFromHexes(c.hexes);
    expect({
      anchors: P?.anchors ?? null,
      seed: seedOf(P),
      drawn7: P && sampleStops(canonical(P), 7).map(s => s.hex)
    }).toEqual({ anchors: c.anchors, seed: c.seed, drawn7: c.drawn7 });
  }
  for (const p of palettes) {
    if (!p.input?.hexes) continue;
    const P = anchorsFromHexes(p.input.hexes) as Palette;
    expect(P.anchors).toEqual(p.anchorsFromHexes);
    expect(encodePalette(P)).toBe(p.inputSeed);
    expect(canonical(P).anchors.map(a => toHex(lchToSrgb(a.l, a.c, a.own ?? a.h)))).toEqual(
      p.input.hexes.map(h => h.toLowerCase())
    );
  }
});

test("a list that starts on grays draws its reverse mirrored", () => {
  const rand = lcg(20261008);
  const grayHex = () => {
    const v = rand() < 0.3 ? Math.round(rand()) : rand();
    return toHex([v, v, v]);
  };
  const colorHex = () => {
    for (;;) {
      const hex = toHex([rand(), rand(), rand()]);
      if (srgbToLch(hexToSrgb(hex) as Triple)[1] >= 0.01) return hex;
    }
  };
  let worst = 0;
  for (let t = 0; t < 300; t++) {
    const lead = 1 + Math.floor(rand() * 3);
    const colors = 1 + Math.floor(rand() * (8 - lead));
    const tail = Math.min(8 - lead - colors, Math.floor(rand() * 3));
    const list = [
      ...Array.from({ length: lead }, grayHex),
      ...Array.from({ length: colors }, colorHex),
      ...Array.from({ length: tail }, grayHex)
    ];
    const P = anchorsFromHexes(list) as Palette;
    const Q = anchorsFromHexes([...list].reverse()) as Palette;
    for (let i = 0; i <= 32; i++) {
      const a = srgbToOklab(...sampleSrgb(P, i / 32));
      const b = srgbToOklab(...sampleSrgb(Q, 1 - i / 32));
      worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }
  }
  expect(worst).toBeLessThan(1e-9);
});
