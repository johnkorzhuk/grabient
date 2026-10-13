import { expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { decodePalette } from "./codec.ts";
import type { Palette } from "./palette.ts";
import { SHADER_KINDS, type ShaderKind, shaderText } from "./shader.ts";
import type { Style } from "./view.ts";

const { entries } = golden<{
  entries: {
    id: string;
    seed: string;
    steps: number;
    angle: number;
    tinted: boolean;
    shaders: Record<Style, Record<ShaderKind, string>>;
  }[];
}>("shaders");

test("Shadertoy, GLSL and WGSL text is as before, tinted near grays included", () => {
  expect(entries.filter(e => e.tinted).length).toBeGreaterThan(20);
  for (const e of entries) {
    const P = decodePalette(e.seed) as Palette;
    for (const [style, byKind] of Object.entries(e.shaders) as [
      Style,
      Record<ShaderKind, string>
    ][]) {
      for (const [kind] of SHADER_KINDS) {
        expect(
          shaderText(kind, P, { style, angle: e.angle }, e.steps, e.seed, "https://grabient.com"),
          `${e.id} ${style} ${kind}`
        ).toBe(byKind[kind]);
      }
    }
  }
});

test("a shader without an origin credits the seed alone", () => {
  const P = decodePalette("kS7Q8Yy5S_SChv0") as Palette;
  const text = shaderText("glsl", P, { style: "linearSwatches", angle: 90 }, 5, "kS7Q8Yy5S_SChv0");
  expect(text.split("\n").slice(3, 6)).toEqual([
    "// grabient kS7Q8Yy5S_SChv0",
    "// 5 hard bands",
    ""
  ]);
});
