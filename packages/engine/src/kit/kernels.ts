/* A field effect's kernel in each shader language (kit/gen/<kind>.ts, written by `pnpm kit:gen`), its module asked for
   as a player, a shader page or a script first needs it, so a page carries one kind's kernel at a time, and the Worker,
   which draws no shader, none: apart from the definitions (kit/registry.ts), which the Worker reads. */
import type { KitKind } from "./kinds.ts";
import type { KitKernelCode } from "./shader.ts";

/** A kit effect's kernel in GLSL and in WGSL. */
export const kitKernel = (kind: KitKind): Promise<KitKernelCode> =>
  import(`./gen/${kind}.ts`).then((m: { KERNEL_GLSL: string; KERNEL_WGSL: string }) => ({
    glsl: m.KERNEL_GLSL,
    wgsl: m.KERNEL_WGSL
  }));
