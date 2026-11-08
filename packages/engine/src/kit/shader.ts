/* A field effect as shader code, each text drawing what the site's player draws (ui/kit-player.ts) at the same size
   and time, in each kind the Shader tab offers (shader-kinds.ts): the GLSL and the WebGL page that runs it, the
   player's own pass (kit/webgl.ts); and the WGSL and the WebGPU page that runs it, the same pass (kit/webgpu.ts). Each
   starts with the credit the palette's shaders carry (shader-shell.ts): the seed, the effect's address and what the
   text is. Every kit effect is written by these from its recipe and its compiled kernel (kit/gen/<kind>.ts). */
import type { EffectSettings } from "../effect.ts";
import type { Palette } from "../palette.ts";
import type { EffectShaderFinish } from "../shader-finish.ts";
import { SHADER_KINDS, type ShaderKind } from "../shader-kinds.ts";
import type { FieldEffect } from "./types.ts";
import { kitWebgl } from "./webgl.ts";
import { kitWebgpu } from "./webgpu.ts";

/** An effect's kernel as the compiler writes it for each shader language (kit/gen/<kind>.ts KERNEL_GLSL,
    KERNEL_WGSL). */
export interface KitKernelCode {
  glsl: string;
  wgsl: string;
}

/** The kinds of an effect's shader code, the Shader tab's: two pages that play it and the two texts they run. */
export const KIT_SHADER_KINDS: readonly ShaderKind[] = SHADER_KINDS.map(([kind]) => kind);

/** A field effect in a kind of shader code, for its palette, how it plays and its shape, its angle, and its finish
    (soft and grain, and the gradient under its soft edges). `origin` adds the effect's address to the credit. */
export function kitShader(
  def: FieldEffect,
  kernel: KitKernelCode,
  kind: ShaderKind,
  P: Palette,
  play: EffectSettings,
  angle: number,
  seed: string,
  origin?: string,
  finish: EffectShaderFinish = {}
): string {
  if (kind === "glsl" || kind === "webgl")
    return kitWebgl(def, kernel, kind, P, play, angle, seed, origin, finish);
  return kitWebgpu(def, kernel, kind, P, play, angle, seed, origin, finish);
}
