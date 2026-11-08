/* What the kit's field kernels call and how a kernel is called: kit-kernels.c, which `pnpm kit:gen` writes from each
   field effect's file (kit/compile.ts), includes this, and video.c defines the eight functions below in the same unit.
   The kernels are written in double precision in JS's order of operations, so where these give what V8's Math gives
   for the same doubles, to the bit, a kernel gives what the effect's TypeScript kernel gives in Node, and a clip's
   frame is the CPU's (kit/render.ts). Their sqrt, fabs, floor and ceil are the compiler's own (__builtin_sqrt and the
   rest), as video.c's are: the module is built with no C library.

   video.c includes kit-kernels.c first, before <wasm_simd128.h> (whose <stdint.h> defines INT8_MAX to WCHAR_MAX), its
   own #defines and minih264e.h, and a test holds it there. A kernel's C keeps the names its author wrote, and an
   object-like macro defined above the include would rewrite one, failing the module's build far from the kernel: on
   8 Nov 2026 below it stood minih264e.h's L0 to L3, T1, U0, U2 to U7, UL, quality_id and dependency_id and video.c's
   KR, KB, KG, YS, CS, MELT, SLOPE, CONTRAST, SPREAD, BYTE and GRAIN_SIDE, names a kernel could take. The kernels need
   nothing defined there. */
#ifndef KIT_H
#define KIT_H

/* A field effect's kernel: the field at (x, y), the view's angle already turned out of the point (kit/scene.ts
   kitTurnX, kitTurnY), from U, the effect's constant lists laid end to end in the order of its `uniforms` keys, and F,
   the frame's phases (kit/scene.ts kitFrameAt's first `tracks` numbers). */
typedef double (*kit_kernel)(double x, double y, const double *U, const double *F);

/* Math.sin, Math.cos, Math.tan, Math.exp, Math.log and Math.atan2(y, x) as V8 computes them: fdlibm's, as V8's
   base/ieee754.cc ports them */
static double kit_sin(double x);
static double kit_cos(double x);
static double kit_tan(double x);
static double kit_exp(double x);
static double kit_log(double x);
static double kit_atan2(double y, double x);
/* Math.min(a, b) and Math.max(a, b): NaN where either is NaN, and -0 below 0 */
static double kit_min(double a, double b);
static double kit_max(double a, double b);

#endif
