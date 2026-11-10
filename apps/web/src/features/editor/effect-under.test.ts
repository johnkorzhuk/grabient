import { decodePalette } from "@grabient/engine";
import { gradientCss } from "@grabient/engine/css.ts";
import { effectUnderlay } from "@grabient/engine/fx-finish.ts";
import { expect, test } from "vitest";
import { loadSoft } from "../../lib/soft-load.ts";
import { effectUnderCss } from "./effect-under.ts";

const P = decodePalette("kUMzO5Na871ukuyhHUJA")!;

test("the stage lays under a soft effect the gradient its files lay there: the palette's at the effect's angle, the blob's left to right", async () => {
  await loadSoft();
  for (const [kind, angle] of [
    ["silk", 40],
    ["rosette", 210],
    ["glass", 135],
    ["blob", 135]
  ] as const) {
    const u = effectUnderlay(
      P,
      { kind, look: { shape: null, frost: 1, bg: "#f0e6d2", steps: null, zoom: null } },
      angle,
      50
    )!;
    const css = effectUnderCss(P, kind, angle, 50);
    expect(css).toBe(
      gradientCss(
        u.stops.map(s => s.hex),
        u.style,
        u.angle,
        undefined,
        u.at
      )
    );
    expect(css.startsWith(`linear-gradient(${kind === "blob" ? 90 : angle}deg,`)).toBe(true);
  }
});
