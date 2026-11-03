/* The fluted glass as shader code, each text drawing what the site's player draws (ui/glass-player.ts) at the same size
   and time, in each kind the Shader tab offers: Shadertoy's tabs, which work the player's numbers out on the GPU
   (glass-shadertoy.ts); the GLSL and the WebGL page that runs it, the player's own passes (glass-webgl.ts); and the
   WGSL and the WebGPU page that runs it, the same passes (glass-webgpu.ts). Each starts with the credit the palette's
   shaders carry (shader-shell.ts): the seed, the effect's address and what the text is. The editor loads each kind's
   module with its spelling (effect-sources.ts); this one names them all, for the tests and the shader lab. */
import type { Effect } from "./effect.ts";
import { glassShadertoyText } from "./glass-shadertoy.ts";
import { glassWebgl } from "./glass-webgl.ts";
import { glassWebgpu } from "./glass-webgpu.ts";
import type { Palette } from "./palette.ts";
import type { EffectShaderFinish } from "./shader-finish.ts";
import { SHADER_KINDS, type ShaderKind } from "./shader-kinds.ts";

/** The kinds of glass shader code, the Shader tab's: three texts and two pages that run them. */
export const GLASS_SHADER_KINDS: readonly ShaderKind[] = SHADER_KINDS.map(([kind]) => kind);

/** The glass in a kind of shader code, for its palette, effect and angle, and its finish (soft and grain, and the
    gradient under its soft edges). `origin` adds the effect's address to the credit. */
export function glassShader(
  kind: ShaderKind,
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string,
  finish: EffectShaderFinish = {}
): string {
  if (kind === "shadertoy") return glassShadertoyText(P, effect, angle, seed, origin, finish);
  if (kind === "glsl" || kind === "webgl")
    return glassWebgl(kind, P, effect, angle, seed, origin, finish);
  return glassWebgpu(kind, P, effect, angle, seed, origin, finish);
}
