/* The kit's compiler (compile.ts): the targets' forms, every construct of the kernel subset and every thing it refuses,
   the generated files kept to what `pnpm kit:gen` writes, every kit effect within the budget, and the C, compiled where
   the machine has a C compiler, giving the TypeScript kernel's numbers. The shaders are only read here, as text. On 8
   Nov 2026 SwiftShader's WebGL 2 and WebGPU (headless Chromium 156) compiled those of the demo, the constructs fixture
   and the edge cases below, bare and inside kit/gl.ts kitFragment and kit/wgsl.ts kitWgsl, and ran each kernel at the
   middles of a 64 by 64 grid's cells over -1.25..1.25 against the TypeScript in double precision on the same float32
   constants, |gpu - ts| / max(1, |ts|), the two GPUs alike: the demo within 5.0e-5, the kernels that move x and y or
   name their parameters otherwise within 1.5e-4, and the constructs within 1.8e-4 once its -0 line's -n is written n
   (SwiftShader's atan2(-0, -1) is +pi, JS's -pi, which no shading language promises either way). */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  ENGINE_SRC,
  KIT_FIELDS,
  kitDrawing,
  kitGenerated,
  kitKernels
} from "../../scripts/kit-gen.ts";
import { constructs } from "../../test/fixtures/kit-kernel.ts";
import {
  type CompiledKernel,
  compileKernel,
  type KernelOptions,
  KIT_KERNEL_BUDGET
} from "./compile.ts";
import demo from "./fields/demo.ts";
import { kitRng } from "./scene.ts";
import type { FieldEffect, FieldKernel } from "./types.ts";

const SRC = fileURLToPath(ENGINE_SRC);
const options: KernelOptions = { name: "k", kind: "test", uniforms: { a: 8, b: 3 }, tracks: 2 };
/** a file of these top-level lines, then a kernel k of this body */
const file = (body: string, top = "") =>
  `${top}\nexport function k(x: number, y: number, U: KernelU, F: ArrayLike<number>): number {\n${body}\n}\n`;
const compile = (body: string, top = "", more: Partial<KernelOptions> = {}) =>
  compileKernel(file(body, top), { ...options, ...more });

test("a kernel in each target: uniforms four to a vector, helpers k_, floats with a point, the counter an integer", () => {
  const k = compile(
    `  let f = 0;
  for (let i = 0; i < N; i++) f += wave(x * U.a[4 * i + 1], F[i]) * i;
  if (f > 1) f = 1;
  else if (f < -1) f = Math.atan2(y, x);
  else f = Math.min(f, Math.sqrt(U.b[2]));
  return y < 0 ? f : -f / 2;`,
    `const N = 2;

function wave(t: number, p: number): number {
  t *= 2;
  return Math.sin(t + p);
}`
  );
  expect(k.glsl).toBe(`uniform vec4 uK_a[2];
uniform vec4 uK_b[1];
uniform vec4 uKF[1];

float k_wave(float t, float p) {
  t *= 2.0;
  return sin(t + p);
}

float kfield(float x, float y) {
  float f = 0.0;
  for (int i = 0; i < 2; i++) {
    f += k_wave(x * uK_a[i].y, uKF[0][i]) * float(i);
  }
  if (f > 1.0) {
    f = 1.0;
  } else if (f < -1.0) {
    f = atan(y, x);
  } else {
    f = min(f, sqrt(uK_b[0].z));
  }
  return y < 0.0 ? f : -f / 2.0;
}`);
  // WGSL's parameters are constants, so one assigned to is copied into a variable the body takes; it has no ?:
  expect(k.wgsl).toBe(`struct KitKernel {
  a: array<vec4f, 2>,
  b: array<vec4f, 1>,
  f: array<vec4f, 1>,
}

fn k_wave(t: f32, p: f32) -> f32 {
  var t_m: f32 = t;
  t_m *= 2.0;
  return sin(t_m + p);
}

fn kfield(x: f32, y: f32) -> f32 {
  var f: f32 = 0.0;
  for (var i: i32 = 0; i < 2; i++) {
    f += k_wave(x * kk.a[i].y, kk.f[0][i]) * f32(i);
  }
  if (f > 1.0) {
    f = 1.0;
  } else if (f < -1.0) {
    f = atan2(y, x);
  } else {
    f = min(f, sqrt(kk.b[0].z));
  }
  return select(-f / 2.0, f, y < 0.0);
}`);
  // the C's U is the lists end to end: b's third number is U[8 + 2]
  expect(k.c).toBe(`static double k_test_wave(double t, double p) {
  t *= 2.0;
  return kit_sin(t + p);
}

static double kfield_test(double x, double y, const double *U, const double *F) {
  double f = 0.0;
  for (int i = 0; i < 2; i++) {
    f += k_test_wave(x * U[4 * i + 1], F[i]) * (double)i;
  }
  if (f > 1.0) {
    f = 1.0;
  } else if (f < -1.0) {
    f = kit_atan2(y, x);
  } else {
    f = kit_min(f, __builtin_sqrt(U[10]));
  }
  return y < 0.0 ? f : -f / 2.0;
}`);
  // the loop's 2 x (+= 1, * 1, wave's 1 + sin's 8 + 1, x * U 1), the if's compare and its costlier side (a compare and
  // atan2's 16), the return's compare and its costlier side (a division)
  expect(k.cost).toBe(46);
});

test("a counter indexes and compares as an integer, and among floats is computed in floats in JS's order", () => {
  const k = compile(
    `  let f = 0;
  for (let i = 0; i < 3; i++) {
    if (i === 2) f += i / 2;
    f += U.a[2 * i + 1] * (i * 2 + 1) + U.a[N - 1] * (N - 1);
    f += Math.atan2(-i * 0.5, -1) + 1e-9 * (i * 1500000000);
  }
  return f - -0 * y;`,
    "const N = 4;"
  );
  expect(k.glsl).toContain("if (i == 2) {\n      f += float(i) / 2.0;");
  // the index an integer, the factor the floats JS computes, the part with no counter folded
  expect(k.glsl).toContain(
    "f += uK_a[(2 * i + 1) / 4][(2 * i + 1) % 4] * (float(i) * 2.0 + 1.0) + uK_a[0].w * 3.0;"
  );
  // -i at 0 is -0, which atan2 tells from 0, and i * 1500000000 passes int32 at i = 2: both floats, as in JS
  expect(k.glsl).toContain(
    "f += atan(-float(i) * 0.5, -1.0) + 1.0e-9 * (float(i) * 1500000000.0);"
  );
  expect(k.glsl).toContain("return f - -0.0 * y;");
  expect(k.wgsl).toContain("f += f32(i) / 2.0;");
  expect(k.wgsl).toContain(
    "f += kk.a[(2 * i + 1) / 4][(2 * i + 1) % 4] * (f32(i) * 2.0 + 1.0) + kk.a[0].w * 3.0;"
  );
  expect(k.wgsl).toContain("f += atan2(-f32(i) * 0.5, -1.0) + 1.0e-9 * (f32(i) * 1500000000.0);");
  expect(k.c).toContain("f += (double)i / 2.0;");
  expect(k.c).toContain("f += U[2 * i + 1] * ((double)i * 2.0 + 1.0) + U[3] * 3.0;");
  expect(k.c).toContain(
    "f += kit_atan2(-(double)i * 0.5, -1.0) + 1.0e-9 * ((double)i * 1500000000.0);"
  );
  expect(k.c).toContain("return f - -0.0 * y;");
});

test("the kernel's parameters are x, y, U and F in every target, whatever its author named them", () => {
  const glsl = "float kfield(float x, float y) {";
  const wgsl = "fn kfield(x: f32, y: f32) -> f32 {";
  const c = "static double kfield_test(double x, double y, const double *U, const double *F) {";
  // other names, and locals that would take the parameters' names, written apart
  const named = compileKernel(
    "export function k(u: number, v: number, K: KernelU, P: ArrayLike<number>): number {\n  const x = u * K.a[1];\n  const U = v + Math.sin(P[1]);\n  return x + U;\n}\n",
    options
  );
  expect(named.glsl).toContain(
    `${glsl}\n  float x_v = x * uK_a[0].y;\n  float U_v = y + sin(uKF[0].y);`
  );
  expect(named.wgsl).toContain(`${wgsl}\n  let x_v: f32 = x * kk.a[0].y;`);
  expect(named.c).toContain(
    `${c}\n  const double x_v = x * U[1];\n  const double U_v = y + kit_sin(F[1]);`
  );
  // an unused y and U, which TypeScript's noUnusedParameters has written _y and _U (a name C keeps, but not written)
  const unused = compileKernel(
    "export function k(x: number, _y: number, _U: KernelU, F: ArrayLike<number>): number {\n  return x + Math.sin(F[0]);\n}\n",
    options
  );
  expect([unused.glsl, unused.wgsl, unused.c].map(code => code.split("\n").at(-3))).toEqual([
    glsl,
    wgsl,
    c
  ]);
  // x and y moved: WGSL's parameters are constants, so the body takes copies, the parameters keeping their names
  const moved = compile("  x -= U.a[0];\n  y *= 2;\n  const x_m = x + y;\n  return x_m;");
  expect(moved.glsl).toContain(`${glsl}\n  x -= uK_a[0].x;\n  y *= 2.0;`);
  expect(moved.wgsl).toContain(
    `${wgsl}\n  var x_m2: f32 = x;\n  var y_m: f32 = y;\n  x_m2 -= kk.a[0].x;\n  y_m *= 2.0;\n  let x_m: f32 = x_m2 + y_m;`
  );
  expect(moved.c).toContain(`${c}\n  x -= U[0];\n  y *= 2.0;`);
});

test("a list's number: a swizzle at a multiple of four, one vector's places, else the vector and the place worked out", () => {
  const k = compile(`  let f = U.a[5] + U.b[2];
  for (let i = 0; i < 2; i++) f += U.a[4 * i + 2] + U.a[i + 1] + U.a[3 * i];
  return f + Math.sin(F[1]);`);
  expect(k.glsl).toContain("float f = uK_a[1].y + uK_b[0].z;");
  expect(k.glsl).toContain("f += uK_a[i].z + uK_a[0][i + 1] + uK_a[0][3 * i];");
  expect(k.glsl).toContain("return f + sin(uKF[0].y);");
  expect(k.wgsl).toContain("var f: f32 = kk.a[1].y + kk.b[0].z;");
  expect(k.wgsl).toContain("f += kk.a[i].z + kk.a[0][i + 1] + kk.a[0][3 * i];");
  expect(k.c).toContain("double f = U[5] + U[10];");
  expect(k.c).toContain("f += U[4 * i + 2] + U[i + 1] + U[3 * i];");
  expect(k.c).toContain("return f + kit_sin(F[1]);");
});

test("a name a target keeps is written with _v after it, the same in every target", () => {
  const k = compile(
    "  const sample = x;\n  const sample_v = y;\n  const fn = x * y;\n  return sample + sample_v + fn;"
  );
  expect(k.glsl).toContain("float sample_v2 = x;\n  float sample_v = y;\n  float fn_v = x * y;");
  expect(k.wgsl).toContain(
    "let sample_v2: f32 = x;\n  let sample_v: f32 = y;\n  let fn_v: f32 = x * y;"
  );
  expect(k.c).toContain(
    "const double sample_v2 = x;\n  const double sample_v = y;\n  const double fn_v = x * y;"
  );
  for (const code of [k.glsl, k.wgsl, k.c])
    expect(code).toContain("return sample_v2 + sample_v + fn_v;");
});

test("the cost: loops multiply, a branch costs its costlier side, a helper its body, min of three two compares", () => {
  const { cost } = compile(
    `  let f = 0;
  for (let i = 0; i < 3; i++) f += h(x) * 2;
  if (x > 0) f += Math.sqrt(y);
  else f -= Math.min(x, y, f);
  return x > y ? Math.sin(f) : f;`,
    "function h(t: number): number {\n  return Math.exp(t) + 1;\n}"
  );
  // 3 x (1 + 1 + exp 8 + 1), the if 1 + max(1 + sqrt 4, 1 + 2), the return 1 + sin 8
  expect(cost).toBe(33 + 6 + 9);
});

test("the subset's other forms of a loop and of equality: ++i, i += 1, i <= B from any start, == and !=", () => {
  const k = compile(
    `  let f = 0;
  for (let i = 0; i < 2; ++i) f += x;
  for (let i = N - 3; i <= N; i += 1) if (i == 2 || x != y) f -= y;
  return f;`,
    "const N = 4;"
  );
  for (const [code, counter] of [
    [k.glsl, "int i"],
    [k.wgsl, "var i: i32"],
    [k.c, "int i"]
  ])
    expect(code).toContain(
      `for (${counter} = 0; i < 2; i++) {\n    f += x;\n  }\n  for (${counter} = 1; i <= 4; i++) {\n    if (i == 2 || x != y) {`
    );
});

test("a ?: may hold bracketed sides, which an arrow function's return type would look like", () => {
  const k = compile("  return x > 0 ? (x + 1) * 2 : (y - 1);");
  expect(k.c).toContain("return x > 0.0 ? (x + 1.0) * 2.0 : y - 1.0;");
  expect(k.wgsl).toContain("return select(y - 1.0, (x + 1.0) * 2.0, x > 0.0);");
});

test("a phase may pass through sums, differences, whole multiples, locals, helpers and branches into sin and cos", () => {
  expect(() =>
    compile(
      `  const p = F[0] + x;
  let s = 0;
  s += F[1];
  let f = Math.sin(p) + Math.cos(2 * F[1] - y) + Math.sin(-s) + h(x, F[0]);
  for (let i = 1; i < 3; i++) f += Math.cos(F[0] * i);
  return f + Math.sin(x > 0 ? F[0] : F[1]);`,
      "function h(t: number, q: number): number {\n  return Math.cos(t + q);\n}"
    )
  ).not.toThrow();
});

test("the rest of the file is passed over: strings, template literals, regular expressions, comments, types", () => {
  const source = `import type { KernelU } from "../types.ts";
// function k() {} in a comment
/* const SCALE = 9; function k() { */
const words = "function k(} {";
const quote = 'it\\'s';
const t = \`a \${{ b: "}" }.b} \${\`nested \${1 + 2}\`} c\`;
const re = /[}{"']+\\/function/g;
class Box<T> {
  value?: T;
  get v() {
    return this.value;
  }
}
interface Kernel {
  k(x: number): number;
}
type Pair = { a: [number, number] };
export const def = { field: k, design: (s: number) => ({ U: { a: [s] }, tracks: [] }) };
const SCALE = 3;
export function k(x: number, y: number, U: KernelU, F: ArrayLike<number>): number {
  return SCALE * x + U.a[0] * Math.sin(y + F[0]);
}
`;
  const k = compileKernel(source, { ...options, uniforms: { a: 1 }, tracks: 1 });
  expect(k.c).toContain("return 3.0 * x + U[0] * kit_sin(y + F[0]);");
});

test("a message names the file, the line and the column", () => {
  expect(() => compileKernel(file("return x % 2;"), { ...options, file: "fields/x.ts" })).toThrow(
    "fields/x.ts:3:10: % is not in the kernel subset: write a - m * Math.floor(a / m)"
  );
});

/* Everything outside the subset, each with the message it is refused with. */
const REFUSED: [string, string, string, RegExp][] = [
  ["%", "return x % 2;", "", /% is not in the kernel subset/],
  ["**", "return x ** 2;", "", /\*\* is not in the kernel subset: write the products/],
  [
    "Math.round",
    "return Math.round(x);",
    "",
    /Math\.round is not in the kernel subset: write Math\.floor\(v \+ 0\.5\)/
  ],
  ["another Math function", "return Math.pow(x, 2);", "", /Math\.pow is not in the kernel subset/],
  ["Math.random", "return Math.random();", "", /seed draws its randomness/],
  [
    "a Math function's arguments",
    "return Math.min(x);",
    "",
    /Math\.min takes two or more arguments, not 1/
  ],
  [
    "a while loop",
    "let i = 0;\nwhile (i < 3) i += 1;\nreturn x;",
    "",
    /loops are for \(let i = 0; i < N; i\+\+\)/
  ],
  ["var", "var a = x;\nreturn a;", "", /declare with const or let/],
  ["switch", "switch (x) {\n}\nreturn x;", "", /write if \/ else/],
  ["an or of bits", "return x | 0;", "", /bit operations/],
  ["a shift", "return x << 1;", "", /bit operations/],
  ["~", "return ~x;", "", /bit operations/],
  ["a string", 'const s = "a";\nreturn x;', "", /strings are not in the kernel subset/],
  ["a template literal", "const s = `a`;\nreturn x;", "", /strings are not in the kernel subset/],
  ["an array", "const a = [x, y];\nreturn x;", "", /arrays are not in the kernel subset/],
  ["an object", "const o = { x };\nreturn x;", "", /objects are not in the kernel subset/],
  [
    "an arrow function",
    "const f = (t: number) => t;\nreturn f(x);",
    "",
    /closures are not in the kernel subset/
  ],
  [
    "a bare arrow function",
    "const f = t => t;\nreturn x;",
    "",
    /closures are not in the kernel subset/
  ],
  [
    "an arrow function with a return type",
    "const f = (t: number): number => t;\nreturn f(x);",
    "",
    /closures are not in the kernel subset/
  ],
  [
    "a list's number assigned",
    "U.a[0] = 1;\nreturn x;",
    "",
    /a kernel assigns only its own variables/
  ],
  [
    "a nested function",
    "function g(t: number): number {\n  return t;\n}\nreturn g(x);",
    "",
    /closures/
  ],
  ["new", "return new Number(x);", "", /nothing is allocated in a kernel/],
  ["??", "return x ?? y;", "", /\?\? is not in the kernel subset/],
  ["a hex literal", "return x * 0x10;", "", /write 0x10 in plain decimal digits/],
  ["a literal past a float's range", "return x * 1e39;", "", /1e39 is past a float's range/],
  [
    "a constant past a double's",
    "return x * BIG;",
    "const BIG = 1e400;",
    /BIG is past a float's range/
  ],
  ["Infinity", "return Infinity;", "", /write a number/],
  ["unary +", "return +x;", "", /unary \+ is not in the kernel subset/],
  [
    "an assignment in an expression",
    "let a = x;\nreturn (a = y);",
    "",
    /an assignment is a statement of its own/
  ],
  [
    "++ on a value",
    "let a = x;\na++;\nreturn a;",
    "",
    /\+\+ and -- count a loop's counter only: write v \+= 1/
  ],
  ["a stray ;", "const a = x;;\nreturn a;", "", /a stray ;/],
  ["a statement that does nothing", "x + 1;\nreturn x;", "", /this does nothing/],
  [
    "two names a declaration",
    "let a = x, b = y;\nreturn a + b;",
    "",
    /declare one name a statement/
  ],
  [
    "a let with neither value nor type",
    "let a;\na = x;\nreturn a;",
    "",
    /give a a value, or a type: let a: number/
  ],
  [
    "a string's type",
    'const a: string = "b";\nreturn x;',
    "",
    /a is a string: a kernel's values are numbers/
  ],
  [
    "recursion",
    "return g(x);",
    "function g(t: number): number {\n  return g(t - 1);\n}",
    /recursion is not in/
  ],
  [
    "recursion through another function",
    "return g(x);",
    "function g(t: number): number {\n  return h(t);\n}\nfunction h(t: number): number {\n  return g(t);\n}",
    /g is called again from inside its own call: recursion/
  ],
  [
    "the kernel called again",
    "return g(x);",
    "function g(t: number): number {\n  return k(t, t, U, F);\n}",
    /k is called again/
  ],
  [
    "an unknown name",
    "return z;",
    "",
    /z is not a parameter, local, loop counter or top-level const of this file/
  ],
  ["an unknown function", "return noise(x);", "", /noise is not a top-level function of this file/],
  [
    "an arrow helper",
    "return h(x);",
    "const h = (t: number): number => t;",
    /h is not a function declaration/
  ],
  [
    "a function named twice",
    "return h(x);",
    "function h(a: number): number {\n  return a;\n}\nfunction h(a: number): number {\n  return a;\n}",
    /h is declared at the top more than once/
  ],
  [
    "a helper's arguments",
    "return h(x);",
    "function h(a: number, b: number): number {\n  return a + b;\n}",
    /h takes 2 arguments, not 1/
  ],
  [
    "a helper's parameter of another type",
    "return h(x);",
    "function h(a: string): number {\n  return 1;\n}",
    /h's parameters and its return are numbers/
  ],
  [
    "a function used as a value",
    "return x * h;",
    "function h(a: number): number {\n  return a;\n}",
    /h is a function: call it/
  ],
  [
    "a constant not a number",
    "return x * TAU;",
    "const TAU = Math.PI * 2;",
    /TAU is not a number: a kernel inlines only top-level const NAME = <number>/
  ],
  ["a top-level let", "return x * K;", "let K = 2;", /K is not a parameter/],
  ["an unknown uniform", "return U.c[0];", "", /U\.c is not one of the effect's uniforms \(a, b\)/],
  ["a list read whole", "return U.a;", "", /U\.a: a kernel reads a list as U\.name\[index\]/],
  ["U indexed", "return U[0];", "", /U is read as U\.name\[index\]/],
  ["U as a value", "return U;", "", /U is read as U\.name\[index\]/],
  ["F as a value", "return F;", "", /F is read as F\[index\]/],
  ["F's length", "return F.length;", "", /F\.length: a kernel reads a list as U\.name\[index\]/],
  [
    "a list of its own",
    "const a = x;\nreturn a[0];",
    "",
    /a\[\]: a kernel reads only its constants U\.name\[index\] and its phases F\[index\]/
  ],
  ["an index past its list", "return U.b[3];", "", /U\.b\[\] reaches 3, outside its 3 numbers/],
  [
    "an index a loop takes past its list",
    "let f = 0;\nfor (let i = 0; i < 3; i++) f += U.a[4 * i];\nreturn f;",
    "",
    /U\.a\[\] reaches 8, outside its 8 numbers/
  ],
  ["an index below 0", "return U.a[-1];", "", /U\.a\[\] reaches -1/],
  [
    "a phase past the tracks",
    "return Math.sin(F[2]);",
    "",
    /F\[\] reaches 2, outside its 2 numbers/
  ],
  ["an index of a value", "return U.a[x];", "", /an index is a whole number/],
  ["an index written as a float", "return U.a[1.0];", "", /an index is a whole number/],
  [
    "an index divided",
    "let f = 0;\nfor (let i = 0; i < 2; i++) f += U.a[i / 2];\nreturn f;",
    "",
    /an index is a whole number/
  ],
  ["an index of a local", "const j = 1;\nreturn U.a[j];", "", /an index is a whole number/],
  [
    "an index whose steps pass int32",
    "let f = 0;\nfor (let i = 0; i < 2; i++)\n  for (let j = 1; j < 2; j++) f += U.a[1500000000 * 2 * i * j - 1500000000 * 2 * i];\nreturn f;",
    "",
    /U\.a\[\]'s index could pass 2\^31 on the way, where int32 wraps/
  ],
  [
    "a comparison of integers past int32",
    "let f = 0;\nfor (let i = 0; i < 30; i++) if (i * 100000000 > 2000000000) f += 1;\nreturn f;",
    "",
    /comparison of integers could pass 2\^31 on the way, where int32 wraps: write a number in it with a point/
  ],
  [
    "a counter past int32",
    "let f = 0;\nfor (let i = 0; i <= 2147483647; i++) f += 1;\nreturn f;",
    "",
    /a loop's counter runs inside int32/
  ],
  [
    "a loop to a value",
    "let f = 0;\nfor (let i = 0; i < x; i++) f += 1;\nreturn f;",
    "",
    /a loop's bounds are whole numbers/
  ],
  [
    "a loop to a fraction",
    "let f = 0;\nfor (let i = 0; i < M; i++) f += 1;\nreturn f;",
    "const M = 2.5;",
    /a loop's bounds are whole numbers/
  ],
  [
    "a loop that never runs",
    "let f = 0;\nfor (let i = 0; i < 0; i++) f += 1;\nreturn f;",
    "",
    /this loop never runs/
  ],
  [
    "a loop counting down",
    "let f = 0;\nfor (let i = 3; i > 0; i--) f += 1;\nreturn f;",
    "",
    /a loop runs while its counter is below a constant/
  ],
  [
    "a loop counting by two",
    "let f = 0;\nfor (let i = 0; i < 4; i += 2) f += 1;\nreturn f;",
    "",
    /a loop counts by one/
  ],
  [
    "a const counter",
    "let f = 0;\nfor (const i = 0; i < 4; i++) f += 1;\nreturn f;",
    "",
    /a loop is for \(let i = 0/
  ],
  [
    "a counter assigned",
    "let f = 0;\nfor (let i = 0; i < 3; i++) {\n  i += 1;\n  f += 1;\n}\nreturn f;",
    "",
    /i is a loop's counter: it changes only in the loop's head/
  ],
  ["a const assigned", "const a = x;\na = y;\nreturn a;", "", /a is a const/],
  ["break outside a loop", "break;", "", /break is outside a loop/],
  ["no return at the end", "const a = x;", "", /k ends without returning a number/],
  ["a return on one side", "if (x > 0) return 1;", "", /k ends without returning a number/],
  ["a bare return", "return;", "", /a kernel returns a number/],
  ["what follows a return", "return x;\nconst a = y;", "", /this is never reached/],
  [
    "what follows a break",
    "let f = 0;\nfor (let i = 0; i < 2; i++) {\n  break;\n  f += 1;\n}\nreturn f;",
    "",
    /this is never reached/
  ],
  [
    "a phase returned",
    "return F[0];",
    "",
    /a phase \(F\) is read only inside Math\.sin or Math\.cos.*not the field/
  ],
  ["a phase compared", "if (F[0] > 1) return 1;\nreturn 0;", "", /phase.*not a comparison/],
  ["a phase under a root", "return Math.sqrt(F[0]);", "", /phase.*not Math\.sqrt/],
  ["a phase halved", "return Math.sin(F[0] * 0.5);", "", /phase.*not a product with a fraction/],
  [
    "a phase times a value",
    "return Math.sin(F[0] * x);",
    "",
    /phase.*not a product with a fraction/
  ],
  ["a phase divided", "return Math.sin(F[0] / 2);", "", /phase.*not a division/],
  ["a phase through a local", "const p = F[0] + x;\nreturn p * 2;", "", /phase.*not the field/],
  [
    "a phase out of a helper",
    "return h(F[0]);",
    "function h(p: number): number {\n  return p;\n}",
    /phase.*not h's return/
  ],
  [
    "a phase a variable takes later",
    "let s = 0;\nconst f = Math.sqrt(s + 1);\ns = F[1];\nreturn f + Math.sin(s);",
    "",
    /phase.*not Math\.sqrt/
  ],
  [
    "a variable holding a phase divided",
    "let s = F[0];\ns /= 2;\nreturn Math.sin(s);",
    "",
    /s holds a phase: it is not divided/
  ],
  [
    "a name declared again inside its scope",
    "const a = x;\nif (y > 0) {\n  const a = y;\n  return a;\n}\nreturn a;",
    "",
    /a is declared again inside its own scope: name it apart/
  ],
  [
    "a counter declared again",
    "let f = 0;\nfor (let i = 0; i < 2; i++) for (let i = 0; i < 2; i++) f += 1;\nreturn f;",
    "",
    /i is declared again/
  ],
  [
    "a comparison as a number",
    "const b = x > 0;\nreturn x;",
    "",
    /a comparison is not a number: write c \? 1 : 0/
  ],
  [
    "a number as a condition",
    "if (x) return 1;\nreturn 0;",
    "",
    /a condition is a comparison of numbers/
  ],
  ["true", "if (true) return 1;\nreturn 0;", "", /a condition is a comparison of numbers/],
  [
    "the kit's prefix",
    "const k_a = x;\nreturn k_a;",
    "",
    /name k_a in ASCII letters, digits and single underscores, not beginning k_, kit_, kfield_, uK_, gl_, webgl_, _webgl_ or _ and a capital/
  ],
  ["two underscores", "const a__b = x;\nreturn a__b;", "", /name a__b in/],
  ["WebGL's prefix", "const webgl_a = x;\nreturn webgl_a;", "", /name webgl_a in/],
  ["WebGL's other prefix", "const _webgl_a = x;\nreturn _webgl_a;", "", /name _webgl_a in/],
  ["what C keeps, _ and a capital", "const _A = x;\nreturn _A;", "", /name _A in/],
  ["a name outside ASCII", "const é = x;\nreturn é;", "", /name é in/],
  [
    "a function beginning _, which would be k__",
    "return _bump(x);",
    "function _bump(t: number): number {\n  return t;\n}",
    /name the function _bump in ASCII .*; a function's not beginning _ at all/
  ],
  [
    "a function of two underscores",
    "return a__b(x);",
    "function a__b(t: number): number {\n  return t;\n}",
    /name the function a__b in/
  ],
  [
    "a function's name outside ASCII",
    "return $h(x);",
    "function $h(t: number): number {\n  return t;\n}",
    /name the function \$h in/
  ]
];
test.each(REFUSED)("refuses %s", (_, body, top, message) => {
  expect(() => compile(body, top)).toThrow(message);
});

test("refuses a kernel of another signature, and options the targets cannot hold", () => {
  const two = "export function k(x: number, y: number): number {\n  return x;\n}\n";
  expect(() => compileKernel(two, options)).toThrow(
    "a kernel is (x: number, y: number, U: KernelU, F: ArrayLike<number>): number"
  );
  expect(() => compile("return x;", "", { name: "nope" })).toThrow(
    "nope is not a top-level function of this file"
  );
  expect(() => compile("return x;", "", { uniforms: { flat: 4 } })).toThrow(
    "the uniform flat needs another name"
  );
  expect(() => compile("return x;", "", { uniforms: { f: 4 } })).toThrow(
    "the uniform f needs another name"
  );
  expect(() => compile("return x;", "", { tracks: 0 })).toThrow(
    "an effect has whole tracks, at least one"
  );
  expect(() => compile("return x;", "", { kind: "Demo" })).toThrow(
    "the kind Demo is lower case letters"
  );
});

test("the demo compiles to the shaders' uniforms and kernel and the clips' C, at cost 112", () => {
  const k = kitKernels([demo])[0];
  expect(k.glsl.split("\n").slice(0, 3)).toEqual([
    "uniform vec4 uK_shear[2];",
    "uniform vec4 uK_wave[5];",
    "uniform vec4 uKF[2];"
  ]);
  expect(k.glsl).toContain("float kfield(float x, float y) {");
  expect(k.glsl).toContain("uKF[(i + 2) / 4][(i + 2) % 4]");
  expect(k.wgsl).toContain(
    "struct KitKernel {\n  shear: array<vec4f, 2>,\n  wave: array<vec4f, 5>,\n  f: array<vec4f, 2>,\n}"
  );
  expect(k.wgsl).toContain("fn kfield(x: f32, y: f32) -> f32 {");
  expect(k.c).toContain(
    "static double kfield_demo(double x, double y, const double *U, const double *F) {"
  );
  // wave's first number is U's ninth, past shear's eight
  expect(k.c).toContain(
    "const double s = U[4 * i + 10] * (U[4 * i + 8] * px + U[4 * i + 9] * py) + F[i + 2];"
  );
  // 2 shears x 18 (the sine 8, its argument 5, its scale 1, the two moves 2 each), 0.6 * px, 5 waves x 15
  expect(k.cost).toBe(2 * 18 + 1 + 5 * 15);
});

test("the generated files are what pnpm kit:gen writes now", () => {
  const files = kitGenerated();
  for (const [path, text] of files)
    expect(readFileSync(join(SRC, path), "utf8"), `${path} is stale: run pnpm kit:gen`).toBe(text);
  const gen = readdirSync(join(SRC, "kit/gen")).map(name => `kit/gen/${name}`);
  expect(
    gen.filter(path => !files.has(path)),
    "not generated: run pnpm kit:gen"
  ).toEqual([]);
});

test("kind-steps.ts says the steps an effect's file gives it, and null for an effect that takes none", () => {
  /* the demo's file under definitions that are not the demo's own, which the table leaves out: one with no steps, as
     an effect the view's steps leave alone, and one with a range, as the sandstone's file gives it one */
  const table = (def: FieldEffect) => kitGenerated([def]).get("kit/gen/kind-steps.ts");
  expect(table({ ...demo })).toContain("\n  demo: null\n};");
  expect(table({ ...demo, steps: { least: 3, most: 9, designed: 5 } })).toContain(
    "\n  demo: { least: 3, most: 9, designed: 5 }\n};"
  );
  expect(table(demo)).not.toContain("demo:");
});

test("each field effect's drawing is its own, a hash of its file, the kit's drawing and its kernel's C", () => {
  const kernels = kitKernels(KIT_FIELDS);
  const drawings = KIT_FIELDS.map((def, n) => kitDrawing(def, kernels[n]));
  for (const d of drawings) expect(d).toMatch(/^[0-9a-f]{12}$/);
  expect(new Set(drawings).size).toBe(KIT_FIELDS.length);
  /* the same file and drawing, the same name; its kernel's C changed, another */
  expect(kitDrawing(KIT_FIELDS[1], kernels[1])).toBe(drawings[1]);
  expect(kitDrawing(KIT_FIELDS[1], { ...kernels[1], c: `${kernels[1].c}\n` })).not.toBe(
    drawings[1]
  );
});

test("every kit effect's kernel is within the budget", () => {
  const over = kitKernels(KIT_FIELDS)
    .map((k, n) => ({ kind: KIT_FIELDS[n].kind, cost: k.cost }))
    .filter(k => k.cost > KIT_KERNEL_BUDGET);
  expect(over).toEqual([]);
});

/** What a parser of either shader language looks at first: brackets matched, every line a statement's end, a block's
    start or end or a struct's field, and none of another language's words. */
function wellFormed(code: string, foreign: RegExp) {
  const open: string[] = [];
  for (const ch of code) {
    if ("([{".includes(ch)) open.push(ch);
    else if (")]}".includes(ch)) expect(open.pop()).toBe("([{"[")]}".indexOf(ch)]);
  }
  expect(open).toEqual([]);
  for (const line of code.split("\n")) if (line) expect(line).toMatch(/[;{},]$/);
  expect(code).not.toMatch(foreign);
}

test("the shaders are well formed, in their own language's words", () => {
  const fixture = readFileSync(join(SRC, "../test/fixtures/kit-kernel.ts"), "utf8");
  const kernels: CompiledKernel[] = [
    ...kitKernels(KIT_FIELDS),
    compileKernel(fixture, {
      name: "constructs",
      kind: "constructs",
      uniforms: { scale: 3, rings: 6 },
      tracks: 5
    })
  ];
  for (const k of kernels) {
    wellFormed(
      k.glsl,
      /Math\.|===|!==|\b(?:let|var|fn|const|select|f32|i32|double|kit_\w+|__builtin\w*)\b/
    );
    wellFormed(
      k.wgsl,
      /Math\.|===|!==|\?|\b(?:float|int|const|uniform|double|kit_\w+|__builtin\w*)\b/
    );
    wellFormed(k.c, /Math\.|===|!==|\b(?:let|var|fn|float|f32|vec4|uK_\w+|kk)\b/);
  }
});

/* ---- the C, run ---- */

/** A C compiler, where the machine has one: cc, or zig's (~/.local/zig/zig cc). */
const CC = [["cc"], [join(homedir(), ".local/zig/zig"), "cc"]].find(cc => {
  try {
    execFileSync(cc[0], [...cc.slice(1), "--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});

/** A design to run a kernel on: its lists end to end, its phases, its points. */
interface Run {
  U: number[];
  F: number[];
  points: number[][];
}

/** `kernel` (C that defines `call`) compiled with the C library's math as the kit's, run on each design's points. */
function runC(kernel: string, call: string, runs: Run[]): number[] {
  const dir = mkdtempSync(join(tmpdir(), "kit-c-"));
  try {
    writeFileSync(join(dir, "kernel.c"), kernel);
    writeFileSync(
      join(dir, "main.c"),
      `#include <math.h>
#include <stdio.h>
#include "kit.h"
#include "kernel.c"

static double kit_sin(double x) { return sin(x); }
static double kit_cos(double x) { return cos(x); }
static double kit_tan(double x) { return tan(x); }
static double kit_exp(double x) { return exp(x); }
static double kit_log(double x) { return log(x); }
static double kit_atan2(double y, double x) { return atan2(y, x); }
static double kit_min(double a, double b) { return a != a || b != b ? NAN : a < b || (a == b && signbit(a)) ? a : b; }
static double kit_max(double a, double b) { return a != a || b != b ? NAN : a > b || (a == b && !signbit(a)) ? a : b; }

int main(void) {
  static double U[4096], F[256];
  int nu, nf, np;
  while (scanf("%d", &nu) == 1) {
    for (int i = 0; i < nu; i++)
      if (scanf("%lf", &U[i]) != 1) return 1;
    if (scanf("%d", &nf) != 1) return 1;
    for (int i = 0; i < nf; i++)
      if (scanf("%lf", &F[i]) != 1) return 1;
    if (scanf("%d", &np) != 1) return 1;
    for (int i = 0; i < np; i++) {
      double x, y;
      if (scanf("%lf %lf", &x, &y) != 2) return 1;
      printf("%.17g\\n", ${call}(x, y, U, F));
    }
  }
  return 0;
}
`
    );
    const exe = join(dir, "kernel");
    /* JS's arithmetic: no fused multiply-adds (the module's wasm has none to fuse into) */
    const flags = ["-O2", "-std=c11", "-ffp-contract=off"];
    execFileSync(CC![0], [
      ...CC!.slice(1),
      ...flags,
      "-I",
      join(SRC, "video"),
      "-I",
      dir,
      "-o",
      exe,
      join(dir, "main.c"),
      "-lm"
    ]);
    const input = runs.map(r =>
      [r.U.length, ...r.U, r.F.length, ...r.F, r.points.length, ...r.points.flat()].join(" ")
    );
    return execFileSync(exe, { input: input.join("\n"), encoding: "utf8" })
      .trim()
      .split("\n")
      .map(Number);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The C's numbers against the TypeScript kernel's on each design, its lists end to end in the order of the effect's
    uniforms. */
function holdsC(
  kernel: string,
  call: string,
  fn: FieldKernel,
  uniforms: Readonly<Record<string, number>>,
  designs: Readonly<Record<string, readonly number[]>>[],
  tracks: number
) {
  const runs = designs.map((U, n) => {
    const r = kitRng(91 + n);
    return {
      U: Object.keys(uniforms).flatMap(name => U[name]),
      F: Array.from({ length: tracks }, () => r() * 2 * Math.PI),
      points: Array.from({ length: 1000 }, () => [r() * 2.4 - 1.2, r() * 2.4 - 1.2])
    };
  });
  const got = runC(kernel, call, runs);
  let i = 0;
  let worst = 0;
  designs.forEach((U, n) => {
    for (const [x, y] of runs[n].points) {
      const want = fn(x, y, U, runs[n].F);
      worst = Math.max(worst, Math.abs(got[i++] - want) / Math.max(1, Math.abs(want)));
    }
  });
  expect(i).toBe(got.length);
  expect(worst).toBeLessThanOrEqual(1e-12);
}

test.skipIf(!CC)("every construct's C gives the TypeScript's numbers, 4,000 points", () => {
  const fixture = readFileSync(join(SRC, "../test/fixtures/kit-kernel.ts"), "utf8");
  const uniforms = { scale: 3, rings: 6 };
  const { c } = compileKernel(fixture, {
    name: "constructs",
    kind: "constructs",
    uniforms,
    tracks: 5
  });
  const r = kitRng(5);
  const designs = Array.from({ length: 4 }, () => ({
    scale: [r() * 3 - 1.5, r() * 3 - 1.5, r() - 0.5],
    rings: Array.from({ length: 6 }, (_, j) => (j % 2 ? 0.3 + r() : 2 + r() * 8))
  }));
  holdsC(c, "kfield_constructs", constructs, uniforms, designs, 5);
});

test.skipIf(!CC)(
  "the demo's C, as video/kit-kernels.c holds it, gives demoField's numbers, 4,000 points",
  () => {
    const designs = [1000, 7, 417, 12345].map(seed => demo.design(seed).U);
    const kernels = readFileSync(join(SRC, "video/kit-kernels.c"), "utf8");
    holdsC(kernels, "KIT_KERNELS[0]", demo.field, demo.uniforms, designs, demo.tracks);
  }
);
