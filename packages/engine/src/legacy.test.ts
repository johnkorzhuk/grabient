import { describe, expect, test } from "vitest";
import { golden, lcg } from "../test/support.ts";
import { decodePalette, encodePalette } from "./codec.ts";
import type { Triple } from "./color.ts";
import { sampleSrgb } from "./curve.ts";
import { fitSrgbStrip } from "./fit.ts";
import {
  alignedLegacySeed,
  decodeLegacySeed,
  type LegacyPalette,
  legacySrgb,
  legacyTarget
} from "./legacy.ts";
import { importedPath, importLegacy, likeSeed } from "./legacy-import.ts";
import type { Palette } from "./palette.ts";
import { randomPalette } from "./random.ts";
import { parseView, viewSearch } from "./view.ts";

interface Page {
  id: string;
  search: string;
  answer: {
    status: number | null;
    location?: string;
    via: string;
    browser?: { importedPath: string | null } | null;
  };
}
const legacy = golden<{
  pages: Page[];
  files: { id: string; resolved: string | null }[];
  aligned: { id: string; aligned: string | null }[];
  decode: { seed: string; palette: LegacyPalette; srgb9: Triple[] }[];
  fits: {
    seed: string;
    fittedSeed: string;
    K: number;
    maxDE: number;
    meanDE: number;
    likeSeed: string;
  }[];
  invalidDecode: { seed: string; decoded: null }[];
}>("legacy");
const { map } = golden<{ map: Record<string, string> }>("legacy-maps");
const lookup = (id: string) => (Object.hasOwn(map, id) ? map[id] : undefined);
const canonicalOf = (seed: string) => {
  const P = decodePalette(seed);
  return P && encodePalette(P);
};

describe("old `_` seeds", () => {
  test("read bit for bit as the original engine read them", () => {
    const { seeds } = golden<{
      seeds: {
        seed: string;
        a: number[];
        b: number[];
        c: number[];
        d: number[];
        globals: number[];
        srgb: Triple[];
      }[];
    }>("legacy-parity");
    for (const want of seeds) {
      const P = decodeLegacySeed(want.seed) as LegacyPalette;
      expect([P.a, P.b, P.c, P.d, [P.exposure, P.contrast, P.frequency, P.phase]]).toEqual([
        want.a,
        want.b,
        want.c,
        want.d,
        want.globals
      ]);
      expect(want.srgb.map((_, i) => legacySrgb(P, i / (want.srgb.length - 1)))).toEqual(want.srgb);
    }
    for (const d of legacy.decode) {
      const P = decodeLegacySeed(d.seed) as LegacyPalette;
      expect(P).toEqual(d.palette);
      expect(Array.from({ length: 9 }, (_, i) => legacySrgb(P, i / 8))).toEqual(d.srgb9);
    }
    for (const c of legacy.invalidDecode) expect(decodeLegacySeed(c.seed)).toBeNull();
  });
  test("lz-string ids read as the `_` seed grabient.com wrote", () => {
    for (const c of legacy.aligned) expect(alignedLegacySeed(c.id), c.id).toBe(c.aligned);
  });
});

test("an old address resolves through the maps, directly or by its `_` form, and never fits", () => {
  for (const page of legacy.pages) {
    const target = legacyTarget(page.id, lookup);
    const { via } = page.answer;
    expect(
      target?.via ?? (alignedLegacySeed(page.id) ? "aligned-unmapped" : "other"),
      page.id
    ).toBe(via === "fitted" || via === "not-legacy" ? "other" : via);
    if (target) {
      /* the page's 301: the canonical seed at the address's view, steps never under its keyframes */
      const P = decodePalette(target.seed) as Palette;
      const view = parseView(new URLSearchParams(page.search));
      expect(
        `/${encodePalette(P)}${viewSearch({ ...view, steps: Math.max(view.steps, P.anchors.length) })}`
      ).toBe(page.answer.location);
    }
  }
  /* an old link no map holds is fitted in the browser: a few of them, since each fit takes a twelfth of a second */
  for (const page of legacy.pages.filter(p => p.answer.browser).slice(0, 4)) {
    expect(importedPath(page.id, new URLSearchParams(page.search))).toBe(
      page.answer.browser?.importedPath
    );
  }
  /* a file name: the maps, then the lz-string form, then the name read as a seed */
  for (const file of legacy.files) {
    expect(canonicalOf(legacyTarget(file.id, lookup)?.seed ?? file.id), file.id).toBe(
      file.resolved
    );
  }
});

test("the browser's fit of an unmapped old link and the strip fitter give the same seeds", () => {
  for (const f of legacy.fits.slice(0, 4)) {
    const fit = importLegacy(decodeLegacySeed(f.seed) as LegacyPalette);
    expect({
      fittedSeed: encodePalette(fit.palette),
      K: fit.K,
      maxDE: fit.maxDE,
      meanDE: fit.meanDE,
      likeSeed: likeSeed(f.seed)
    }).toEqual({
      fittedSeed: f.fittedSeed,
      K: f.K,
      maxDE: f.maxDE,
      meanDE: f.meanDE,
      likeSeed: f.likeSeed
    });
  }
  const { fitCases } = golden<{
    fitCases: { source: string; fittedSeed: string; K: number; maxDE: number; meanDE: number }[];
  }>("ops");
  const rand = lcg(808);
  fitCases.forEach((c, t) => {
    const P = randomPalette(rand, 3 + t);
    const fit = fitSrgbStrip(
      Array.from({ length: 48 }, (_, i) => sampleSrgb(P, i / 47)),
      { kMax: 6, iters: 120 }
    );
    expect([encodePalette(P), encodePalette(fit.palette), fit.K, fit.maxDE, fit.meanDE]).toEqual([
      c.source,
      c.fittedSeed,
      c.K,
      c.maxDE,
      c.meanDE
    ]);
  });
  expect(likeSeed("kSPTq14zC4voJMs")).toBe("kSPTq14zC4voJMs");
});
