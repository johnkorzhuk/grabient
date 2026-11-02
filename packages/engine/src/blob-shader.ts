/* The blob as shader code, each text drawing what the site's player draws (ui/blob-player.ts) at the same size and
   time, in each kind the Shader tab offers (shader-kinds.ts): Shadertoy's tabs, which keep the player's numbers in a
   buffer (blob-shadertoy.ts); the GLSL and the WebGL page that runs it, the player's own shaders (blob-webgl.ts); and
   the WGSL and the WebGPU page that runs it, the same passes (blob-webgpu.ts). The blob is no one shader: each frame
   draws its balls into a small texture, blurs it across and down, and lays it over every pixel of the canvas through
   the frost's noise, which is baked once a size; so each text is its passes, each under a header naming its target
   and its inputs. Each starts with the credit the palette's shaders carry (shader-shell.ts): the seed, the effect's
   address, which names no angle (the blob has none), and what the text is. The editor loads each kind's module with
   its spelling (effect-sources.ts); this one names them all, for the tests and the shader lab. */
import { blobShadertoyText } from "./blob-shadertoy.ts";
import { blobWebgl } from "./blob-webgl.ts";
import { blobWebgpu } from "./blob-webgpu.ts";
import type { Effect } from "./effect.ts";
import type { Palette } from "./palette.ts";
import { SHADER_KINDS, type ShaderKind } from "./shader-kinds.ts";

/** The kinds of blob shader code, the Shader tab's: three texts and two pages that run them. */
export const BLOB_SHADER_KINDS: readonly ShaderKind[] = SHADER_KINDS.map(([kind]) => kind);

/** The blob's shader in a kind: Shadertoy's tabs, the GLSL or the WGSL its pages run, or one of the pages. `origin`
    adds the effect's address to the credit. It takes no angle: the blob has none. */
export function blobShader(
  kind: ShaderKind,
  P: Palette,
  effect: Effect,
  seed: string,
  origin?: string
): string {
  if (kind === "shadertoy") return blobShadertoyText(P, effect, seed, origin);
  if (kind === "glsl" || kind === "webgl") return blobWebgl(kind, P, effect, seed, origin);
  return blobWebgpu(kind, P, effect, seed, origin);
}
