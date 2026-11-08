/* The strings as shader code, each text drawing what the site's player draws (ui/strings-player.ts) at the same size and
   time, in each kind the Shader tab offers (shader-kinds.ts): the GLSL and the WebGL page that runs it, the player's
   own pass (strings-webgl.ts); and the WGSL and the WebGPU page that runs it, the same pass (strings-webgpu.ts). Each
   starts with the credit the palette's shaders carry (shader-shell.ts): the seed, the effect's address and what the
   text is. The editor loads each kind's module with its spelling (effect-sources.ts); this one names them all, for the
   tests. */
import type { Effect } from "./effect.ts";
import type { Palette } from "./palette.ts";
import type { EffectShaderFinish } from "./shader-finish.ts";
import { SHADER_KINDS, type ShaderKind } from "./shader-kinds.ts";
import { stringsWebgl } from "./strings-webgl.ts";
import { stringsWebgpu } from "./strings-webgpu.ts";

/** The kinds of strings shader code, the Shader tab's: two pages that play it and the two texts they run. */
export const STRINGS_SHADER_KINDS: readonly ShaderKind[] = SHADER_KINDS.map(([kind]) => kind);

/** The strings in a kind of shader code, for its palette, effect and angle, and its finish (soft and grain, and the
    gradient under its soft edges). `origin` adds the effect's address to the credit. */
export function stringsShader(
  kind: ShaderKind,
  P: Palette,
  effect: Effect,
  angle: number,
  seed: string,
  origin?: string,
  finish: EffectShaderFinish = {}
): string {
  if (kind === "glsl" || kind === "webgl")
    return stringsWebgl(kind, P, effect, angle, seed, origin, finish);
  return stringsWebgpu(kind, P, effect, angle, seed, origin, finish);
}
