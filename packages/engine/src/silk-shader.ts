/* The silk as shader code, each text drawing what the site's player draws (ui/silk-player.ts) at the same size and
   time, in each kind the Shader tab offers (shader-kinds.ts): Shadertoy's tabs, which work the player's numbers out on
   the GPU (silk-shadertoy.ts); the GLSL and the WebGL page that runs it, the player's own pass (silk-webgl.ts); and the
   WGSL and the WebGPU page that runs it, the same pass (silk-webgpu.ts). Each starts with the credit the palette's
   shaders carry (shader-shell.ts): the seed, the effect's address and what the text is. The editor loads each kind's
   module with its spelling (effect-sources.ts); this one names them all, for the tests and the shader lab. */
import type { Effect } from "./effect.ts";
import type { Palette } from "./palette.ts";
import type { EffectShaderFinish } from "./shader-finish.ts";
import { SHADER_KINDS, type ShaderKind } from "./shader-kinds.ts";
import { silkShadertoyText } from "./silk-shadertoy.ts";
import { silkWebgl } from "./silk-webgl.ts";
import { silkWebgpu } from "./silk-webgpu.ts";

/** The kinds of silk shader code, the Shader tab's: three texts and two pages that run them. */
export const SILK_SHADER_KINDS: readonly ShaderKind[] = SHADER_KINDS.map(([kind]) => kind);

/** The silk in a kind of shader code, for its palette, effect and angle, and its finish (soft and grain, and the
    gradient under its soft edges). `origin` adds the effect's address to the credit. */
export function silkShader(
  kind: ShaderKind,
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string,
  finish: EffectShaderFinish = {}
): string {
  if (kind === "shadertoy") return silkShadertoyText(P, effect, angle, seed, origin, finish);
  if (kind === "glsl" || kind === "webgl")
    return silkWebgl(kind, P, effect, angle, seed, origin, finish);
  return silkWebgpu(kind, P, effect, angle, seed, origin, finish);
}
