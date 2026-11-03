/* The rosette as shader code, each text drawing what the site's player draws (ui/rosette-player.ts) at the same size
   and time, in each kind the Shader tab offers (shader-kinds.ts): Shadertoy's tabs, which work the player's numbers out
   on the GPU (rosette-shadertoy.ts); the GLSL and the WebGL page that runs it, the player's own pass (rosette-webgl.ts);
   and the WGSL and the WebGPU page that runs it, the same pass (rosette-webgpu.ts). Each starts with the credit the
   palette's shaders carry (shader-shell.ts): the seed, the effect's address and what the text is. The editor loads
   each kind's module with its spelling (effect-sources.ts); this one names them all, for the tests and the shader
   lab. */
import type { Effect } from "./effect.ts";
import type { Palette } from "./palette.ts";
import { rosetteShadertoyText } from "./rosette-shadertoy.ts";
import { rosetteWebgl } from "./rosette-webgl.ts";
import { rosetteWebgpu } from "./rosette-webgpu.ts";
import { SHADER_KINDS, type ShaderKind } from "./shader-kinds.ts";

/** The kinds of rosette shader code, the Shader tab's: three texts and two pages that run them. */
export const ROSETTE_SHADER_KINDS: readonly ShaderKind[] = SHADER_KINDS.map(([kind]) => kind);

/** The rosette in a kind of shader code, for its palette, effect and angle. `origin` adds the effect's address to the
    credit. */
export function rosetteShader(
  kind: ShaderKind,
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string
): string {
  if (kind === "shadertoy") return rosetteShadertoyText(P, effect, angle, seed, origin);
  if (kind === "glsl" || kind === "webgl")
    return rosetteWebgl(kind, P, effect, angle, seed, origin);
  return rosetteWebgpu(kind, P, effect, angle, seed, origin);
}
