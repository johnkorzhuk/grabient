import { expect, test } from "vitest";
import { decodePalette } from "./codec.ts";
import type { Effect } from "./effect.ts";
import { effectEmbedHtml, hasEmbedScript } from "./effect.ts";
import {
  effectColors,
  effectLinks,
  effectMarkdown,
  effectStylesheet,
  effectSvg
} from "./effect-code.ts";
import { FX_STILL_SIDE, fxLoop, fxMovingSvg, fxStillSvg } from "./fx-still.ts";

const SEED = "kUMzO5Na871ukuyhHUJA";
const P = decodePalette(SEED)!;
const effect = (kind: "silk" | "rosette", speed = 1): Effect => ({
  kind,
  speed,
  fps: 60,
  look: { shape: 7, frost: 1, bg: null }
});

test("a still is drawn in the design square, and speed 0 is the still", () => {
  for (const kind of ["silk", "rosette"] as const) {
    const still = fxStillSvg(kind, P, { angle: 90, shape: null });
    expect(still).toContain(`width="${FX_STILL_SIDE}" height="${FX_STILL_SIDE}"`);
    const box = { width: 400, height: 200 };
    expect(fxMovingSvg(kind, P, { angle: 30, shape: 3 }, box, 0)).toBe(
      fxStillSvg(kind, P, { angle: 30, shape: 3 }, box)
    );
    expect(fxLoop(kind, P, { angle: 90, shape: null })).toBeGreaterThan(0);
  }
});

test("the silk's and the rosette's files: a moving SVG, a stylesheet, their colors, the script that plays them", () => {
  for (const kind of ["silk", "rosette"] as const) {
    expect(hasEmbedScript(kind)).toBe(true);
    const fx = effect(kind);
    const svg = effectSvg(P, SEED, fx, 120, { width: 640, height: 320 }, "https://grabient.com");
    expect(svg).toMatch(/^<svg[^>]*width="640" height="320"/);
    expect(svg).toContain(`<!-- https://grabient.com/${SEED}?style=${kind}&angle=120&shape=7 -->`);
    expect(svg).toMatch(kind === "silk" ? /<animateTransform/ : /@keyframes/);
    const css = effectStylesheet(P, SEED, fx, 120, "https://grabient.com");
    expect(css).toContain("html::before");
    expect(css).toMatch(/50% 50% \/ cover no-repeat/);
    expect(effectColors(P, fx)).toHaveLength(6);
    expect(effectLinks("https://grabient.com", SEED, fx, 120, "/og").js).toBe(
      `https://grabient.com/${SEED}.js?style=${kind}&angle=120&shape=7`
    );
    expect(effectEmbedHtml("https://grabient.com", SEED, fx, 120)).toContain(
      `<script src="https://grabient.com/${SEED}.js?style=${kind}&amp;angle=120&amp;shape=7" async></script>`
    );
    const md = effectMarkdown(
      "https://grabient.com",
      SEED,
      fx,
      "/og"
    )(P, "Navy and teal", {
      angle: 120,
      colors: effectColors(P, fx)
    } as never);
    expect(md.called).toBe(`Navy and teal ${kind}`);
    expect(md.files).toHaveProperty("script");
  }
});
