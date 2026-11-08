/* The kit's compiler: a field effect's kernel, written once in TypeScript in the kernel subset below, in the three other
   languages the kit draws it in, GLSL ES 3.00 (the player and the WebGL page), WGSL (the WebGPU page) and C in double
   precision (the clips' module), and its cost, the operations one evaluation takes. It runs when the kit's files are
   generated (`pnpm kit:gen`, scripts/kit-gen.ts) and in tests, never in a page or the Worker: what ships is what it
   wrote, kit/gen/<kind>.ts and video/kit-kernels.c.

   The kernel subset, all that a kernel and the functions it calls may hold; anything else is refused where it stands,
   naming the line:
   - the kernel, a top-level function (x: number, y: number, U: KernelU, F: ArrayLike<number>): number, and the
     file's other top-level functions it calls, their parameters and returns numbers, none calling itself again;
   - const and let of one number each (`let a: number;` with no value only where every path assigns it before it is
     read, as TypeScript's strict check holds), assignment = += -= *= /=, if and else, blocks, return;
   - for (let i = A; i < B; i++), or i <= B, ++i or i += 1, A and B whole numbers made of literals and top-level
     consts with + - *; break and continue;
   - + - * / and unary -, < <= > >= === !== (== and != alike), && || !, ? :, all on numbers;
   - Math.sin cos tan sqrt abs floor ceil exp log atan2, Math.min and max of two or more, Math.PI, decimal literals a
     float holds, and top-level `const NAME = <decimal literal>;`, inlined;
   - U.name[i], a number of one of the effect's constant lists, and F[i], a phase: i a whole number of loop counters,
     literals and consts with + - *, inside its list. A phase is an angle reduced to one turn, so it reaches only
     Math.sin or Math.cos, through sums, differences and whole multiples;
   - names of ASCII letters, digits and single underscores, not beginning k_, kit_, kfield_, uK_, gl_, webgl_ or
     _webgl_ (the kit's, GLSL's and WebGL's) nor _ and a capital (C's), and a function's not beginning with _; the
     kernel's parameters any, since every target writes them x, y, U and F (an unused one is _y or _U).

   It parses the effect's file itself. TypeScript 7 has no JavaScript API to parse with, and a parser for exactly the
   subset rejects whatever lies outside it where it stands, naming the line, with no dependency: the rest of the file is
   passed over token by token (comments, strings, template literals and regular expressions read as such, brackets
   matched), and only the kernel, the functions it calls and the constants it reads are parsed.

   Every target keeps JS's numbers. A loop's counter, an index into U or F and a comparison of two integers are
   computed in integers, refused where any step could pass int32; every other number is a float, written with a
   decimal point, an integer among floats computed in floats in JS's order (so it never wraps, and -i is -0 where i
   is 0, as in JS), and a double in the C, which evaluates in JS's order of operations, so where the clips' module's
   kit_ functions are V8's Math (video/kit.h) its kernel gives Node's numbers to the bit. */

export interface KernelOptions {
  /** the kernel's function name in the file */
  name: string;
  /** the effect's kind: its kernel in C is kfield_<kind>, its helpers k_<kind>_<fn> */
  kind: string;
  /** each constant list's name and length, in the order of the effect's `uniforms` */
  uniforms: Readonly<Record<string, number>>;
  /** the phases a frame sets */
  tracks: number;
  /** the file's name, which messages begin with */
  file?: string;
}

export interface CompiledKernel {
  /** the lists as uniforms (`uniform vec4 uK_<name>[]`, `uKF[]`), the helpers (k_<fn>) and `float kfield(float x,
      float y)` */
  glsl: string;
  /** `struct KitKernel`, the helpers (k_<fn>) and `fn kfield(x: f32, y: f32) -> f32`, reading the struct as `kk`, which
      the page declares */
  wgsl: string;
  /** the helpers (k_<kind>_<fn>) and the kernel, `static double kfield_<kind>(x, y, U, F)` in double precision */
  c: string;
  /** the operations an evaluation takes */
  cost: number;
}

/** A kernel's cost at most. The GPU evaluates the kernel five times a pixel (the middle, the two neighbours, the
    shadow's point and the rim's), so a kernel at 160 and the recipe's shading cost about what the strings' pixel does
    (about 540 in the same count). */
export const KIT_KERNEL_BUDGET = 160;

/* Math's functions in the subset, each one's arguments (0: two or more), its cost (SPEC: sqrt 4, sin cos exp log 8,
   tan atan2 16; abs, floor, ceil, and min and max a compare between each two, an operation's), and its name in each
   target. The C has no C library (video.c is built freestanding): sqrt, fabs, floor and ceil are the compiler's own
   instructions, the rest V8's Math as the clips' module gives it. */
const MATH = new Map(
  Object.entries({
    sin: { n: 1, cost: 8, glsl: "sin", wgsl: "sin", c: "kit_sin" },
    cos: { n: 1, cost: 8, glsl: "cos", wgsl: "cos", c: "kit_cos" },
    tan: { n: 1, cost: 16, glsl: "tan", wgsl: "tan", c: "kit_tan" },
    exp: { n: 1, cost: 8, glsl: "exp", wgsl: "exp", c: "kit_exp" },
    log: { n: 1, cost: 8, glsl: "log", wgsl: "log", c: "kit_log" },
    atan2: { n: 2, cost: 16, glsl: "atan", wgsl: "atan2", c: "kit_atan2" },
    sqrt: { n: 1, cost: 4, glsl: "sqrt", wgsl: "sqrt", c: "__builtin_sqrt" },
    abs: { n: 1, cost: 1, glsl: "abs", wgsl: "abs", c: "__builtin_fabs" },
    floor: { n: 1, cost: 1, glsl: "floor", wgsl: "floor", c: "__builtin_floor" },
    ceil: { n: 1, cost: 1, glsl: "ceil", wgsl: "ceil", c: "__builtin_ceil" },
    min: { n: 0, cost: 1, glsl: "min", wgsl: "min", c: "kit_min" },
    max: { n: 0, cost: 1, glsl: "max", wgsl: "max", c: "kit_max" }
  })
);
const MATH_INSTEAD = new Map(
  Object.entries({
    round: "write Math.floor(v + 0.5)",
    pow: "write the products",
    random: "a design's seed draws its randomness (kitRng), never the kernel"
  })
);

const BITS = "bit operations are not in the kernel subset";
const CLOSURES =
  "closures are not in the kernel subset: write the function at the file's top level";
const ASSIGN = "an assignment is a statement of its own";
const COUNT = "++ and -- count a loop's counter only: write v += 1";
const LOOPS = "loops are for (let i = 0; i < N; i++), N a constant";
/** What a token outside the subset is, where it stands. */
const FOREIGN = new Map<string, string>(
  Object.entries({
    "%": "% is not in the kernel subset: write a - m * Math.floor(a / m)",
    "%=": "% is not in the kernel subset: write a - m * Math.floor(a / m)",
    "**": "** is not in the kernel subset: write the products",
    "**=": "** is not in the kernel subset: write the products",
    "&": BITS,
    "|": BITS,
    "^": BITS,
    "~": BITS,
    "<<": BITS,
    ">>": BITS,
    ">>>": BITS,
    "&=": BITS,
    "|=": BITS,
    "^=": BITS,
    "<<=": BITS,
    ">>=": BITS,
    ">>>=": BITS,
    "??": "?? is not in the kernel subset",
    "??=": "?? is not in the kernel subset",
    "?.": "?. is not in the kernel subset",
    "&&=": "&&= is not in the kernel subset",
    "||=": "||= is not in the kernel subset",
    "++": COUNT,
    "--": COUNT,
    "=>": CLOSURES,
    "=": ASSIGN,
    "+=": ASSIGN,
    "-=": ASSIGN,
    "*=": ASSIGN,
    "/=": ASSIGN,
    "[": "arrays are not in the kernel subset",
    "{": "objects are not in the kernel subset",
    "...": "spreads are not in the kernel subset",
    function: CLOSURES,
    class: "classes are not in the kernel subset",
    new: "nothing is allocated in a kernel",
    this: "this is not in the kernel subset",
    typeof: "typeof is not in the kernel subset",
    instanceof: "instanceof is not in the kernel subset",
    in: "in is not in the kernel subset",
    delete: "delete is not in the kernel subset",
    void: "void is not in the kernel subset",
    async: "async is not in the kernel subset",
    await: "await is not in the kernel subset",
    yield: "yield is not in the kernel subset",
    true: "a condition is a comparison of numbers",
    false: "a condition is a comparison of numbers",
    null: "write a number",
    undefined: "write a number",
    NaN: "write a number",
    Infinity: "write a number",
    while: LOOPS,
    do: LOOPS,
    switch: "switch is not in the kernel subset: write if / else",
    var: "declare with const or let",
    try: "try is not in the kernel subset",
    throw: "throw is not in the kernel subset"
  })
);

/* Names a kernel's own may not keep in the targets: the keywords and reserved words of GLSL ES 3.00, WGSL and C, the
   built-in functions and types (a local of the name would hide one the code calls), and the kit's own names. A name of
   these is written with _v after it. The names TAKEN matches are refused instead. Swept 8 Nov 2026, a local of each of
   429 such words compiled by SwiftShader's WebGL 2 (ANGLE) and WebGPU (Tint) in headless Chromium 156 and by zig cc
   with the clips' module's flags: the last lines are the 71 they refused that the list had missed (65 by GLSL, 5 by
   WGSL, and NDEBUG, which zig defines at -O3), and C23's typeof_unqual. */
const RESERVED = new Set(
  `attribute const uniform varying layout centroid flat smooth noperspective patch sample break continue do for while
  switch case default if else subroutine in out inout float double int void bool true false invariant precise discard
  return mat2 mat3 mat4 mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4 vec2 vec3 vec4 ivec2 ivec3 ivec4
  bvec2 bvec3 bvec4 uint uvec2 uvec3 uvec4 lowp mediump highp precision sampler2D sampler3D samplerCube struct coherent
  volatile restrict readonly writeonly resource atomic_uint common partition active asm class union enum typedef
  template this goto inline noinline public static extern external interface long short half fixed unsigned superp
  input output filter sizeof cast namespace using radians degrees sin cos tan asin acos atan sinh cosh tanh asinh acosh
  atanh pow exp log exp2 log2 sqrt inversesqrt abs sign floor trunc round roundEven ceil fract mod min max clamp mix
  step smoothstep isnan isinf length distance dot cross normalize faceforward reflect refract transpose determinant
  inverse lessThan lessThanEqual greaterThan greaterThanEqual equal notEqual any all not texture dFdx dFdy fwidth main
  alias const_assert continuing diagnostic enable fn let loop override requires var NULL Self abstract alignas alignof
  as async attribute auto await become binding_array catch co_await co_return co_yield column_major compile concept
  const_cast consteval constexpr constinit crate debugger decltype delete demote dynamic_cast explicit export extends
  fallthrough final finally friend from fxgroup get groupshared impl implements import instanceof macro match meta
  module move mut mutable new nil noexcept nointerpolation noncoherent null nullptr of operator package packoffset pass
  pixelfragment premerge priv protected pub ref regardless register reinterpret_cast require self set shared snorm
  static_assert static_cast std super target thread_local throw trait try type typeid typename typeof unless unorm
  unsafe unsized use virtual wgsl where with yield f16 f32 i32 u32 vec2f vec3f vec4f vec2i vec3i vec4i vec2u vec3u
  vec4u array atomic ptr sampler atan2 inverseSqrt saturate select fma bitcast char signed kk kfield uKF
  sampler2DShadow samplerCubeShadow sampler2DArray sampler2DArrayShadow isampler2D isampler3D isamplerCube
  isampler2DArray usampler2D usampler3D usamplerCube usampler2DArray hvec2 hvec3 hvec4 dvec2 dvec3 dvec4 fvec2 fvec3
  fvec4 sampler3DRect image1D image2D image3D imageCube iimage1D iimage2D iimage3D iimageCube uimage1D uimage2D uimage3D
  uimageCube image1DArray image2DArray iimage1DArray iimage2DArray uimage1DArray uimage2DArray imageBuffer iimageBuffer
  uimageBuffer sampler1D sampler1DShadow sampler1DArray sampler1DArrayShadow isampler1D isampler1DArray usampler1D
  usampler1DArray sampler2DRect sampler2DRectShadow isampler2DRect usampler2DRect samplerBuffer isamplerBuffer
  usamplerBuffer sampler2DMS isampler2DMS usampler2DMS sampler2DMSArray isampler2DMSArray usampler2DMSArray
  samplerExternalOES asm_fragment compile_fragment demote_to_helper macro_rules non_coherent typeof_unqual NDEBUG`.split(
    /\s+/
  )
);
/* Names refused: the kit's prefixes (its helpers k_, the clips' module's kit_ and kfield_, the shaders' uK_), what GLSL
   and WebGL reserve (gl_, webgl_, _webgl_, two underscores anywhere: SwiftShader's WebGL 2 refuses a local webgl_a as
   a "reserved built-in name" and a helper k__bump as "reserved as possible future keywords") and what C reserves (_
   and a capital). */
const TAKEN = /^(?:k_|kit_|kfield_|uK_|gl_|webgl_|_webgl_|_[A-Z])|__/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NAME_RULE =
  "ASCII letters, digits and single underscores, not beginning k_, kit_, kfield_, uK_, gl_, webgl_, _webgl_ or _ and a capital";
/** A name an author writes that every target can keep (as it is, or with _v after it where RESERVED holds it). */
const nameable = (name: string) => NAME.test(name) && name !== "_" && !TAKEN.test(name);
const DECIMAL = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const INT_MAX = 2147483647;
/** A number the shaders can hold: a float32's, which a literal past 3.4e38 is not (WGSL refuses one, and Infinity
    has no literal in any target). */
const floatable = (v: number) => Number.isFinite(Math.fround(v));

type Fail = (pos: number, message: string) => never;

/* ---- tokens ---- */

interface Token {
  type: "name" | "num" | "str" | "tpl" | "re" | "punct" | "end";
  text: string;
  pos: number;
}

/** the operators of more than one character, each before any that begins it */
const PUNCTS =
  ">>>= ... === !== **= <<= >>= >>> &&= ||= ??= => == != <= >= && || ?? ?. ++ -- += -= *= /= %= &= |= ^= ** << >>".split(
    " "
  );
/** words after which a slash begins a regular expression, not a division */
const BEFORE_REGEX = new Set(
  "return typeof instanceof in of new delete void throw case do else yield await".split(" ")
);
const IDENT = /[\p{ID_Start}$_][\p{ID_Continue}$]*/uy;
const NUMBER =
  /(?:0[xXoObB][\da-fA-F_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)n?/y;

/** The file's tokens, whatever TypeScript it holds, comments dropped. */
function tokenize(src: string, fail: Fail): Token[] {
  const n = src.length;
  const tokens: Token[] = [];
  const stringEnd = (i: number): number => {
    for (let j = i + 1; j < n; j++) {
      if (src[j] === "\\") j++;
      else if (src[j] === src[i]) return j + 1;
      else if (src[j] === "\n") break;
    }
    return fail(i, "a string that never ends");
  };
  const commentEnd = (i: number): number => {
    if (src[i + 1] === "/") {
      const e = src.indexOf("\n", i);
      return e < 0 ? n : e;
    }
    const e = src.indexOf("*/", i + 2);
    return e < 0 ? fail(i, "a comment that never ends") : e + 2;
  };
  /* past a template literal from its backtick, the code in each ${ } read to its closing brace */
  const templateEnd = (i: number): number => {
    for (let j = i + 1; j < n; ) {
      if (src[j] === "\\") j += 2;
      else if (src[j] === "`") return j + 1;
      else if (src[j] === "$" && src[j + 1] === "{") {
        let depth = 1;
        j += 2;
        while (j < n && depth > 0) {
          const c = src[j];
          if (c === "/" && (src[j + 1] === "/" || src[j + 1] === "*")) j = commentEnd(j);
          else if (c === '"' || c === "'") j = stringEnd(j);
          else if (c === "`") j = templateEnd(j);
          else {
            if (c === "{") depth++;
            else if (c === "}") depth--;
            j++;
          }
        }
      } else j++;
    }
    return fail(i, "a template literal that never ends");
  };
  const regexEnd = (i: number): number => {
    let inClass = false;
    for (let j = i + 1; j < n && src[j] !== "\n"; j++) {
      const c = src[j];
      if (c === "\\") j++;
      else if (inClass) inClass = c !== "]";
      else if (c === "[") inClass = true;
      else if (c === "/") {
        j++;
        while (j < n && /[a-z]/i.test(src[j])) j++;
        return j;
      }
    }
    return fail(i, "a regular expression that never ends");
  };
  const regexAllowed = () => {
    const p = tokens[tokens.length - 1];
    if (!p) return true;
    if (p.type === "name") return BEFORE_REGEX.has(p.text);
    return p.type === "punct" && p.text !== ")" && p.text !== "]" && p.text !== "}";
  };
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "/" && (src[i + 1] === "/" || src[i + 1] === "*")) {
      i = commentEnd(i);
      continue;
    }
    const start = i;
    let type: Token["type"] = "punct";
    IDENT.lastIndex = i;
    NUMBER.lastIndex = i;
    if (/\d/.test(c) || (c === "." && /\d/.test(src[i + 1] ?? ""))) {
      NUMBER.test(src);
      i = NUMBER.lastIndex;
      type = "num";
    } else if (IDENT.test(src)) {
      i = IDENT.lastIndex;
      type = "name";
    } else if (c === '"' || c === "'") {
      i = stringEnd(i);
      type = "str";
    } else if (c === "`") {
      i = templateEnd(i);
      type = "tpl";
    } else if (c === "/" && regexAllowed()) {
      i = regexEnd(i);
      type = "re";
    } else {
      const p = PUNCTS.find(
        p => src.startsWith(p, i) && !(p === "?." && /\d/.test(src[i + 2] ?? ""))
      );
      i += p ? p.length : 1;
    }
    tokens.push({ type, text: src.slice(start, i), pos: start });
  }
  tokens.push({ type: "end", text: "", pos: n });
  return tokens;
}

/* ---- the file's top level ---- */

interface TopConst {
  /** its number, or null where it is not a numeric literal */
  value: number | null;
  /** written as a whole number an integer holds */
  whole: boolean;
}
interface Top {
  /** each top-level function's `function` token */
  fns: Map<string, number>;
  consts: Map<string, TopConst>;
  /** names declared at the top more than once */
  twice: Set<string>;
}

/** The top level's function declarations and constants, everything else passed over by its brackets. */
function scanTop(tokens: Token[]): Top {
  const top: Top = { fns: new Map(), consts: new Map(), twice: new Set() };
  const seen = (name: string) => {
    if (top.fns.has(name) || top.consts.has(name)) top.twice.add(name);
  };
  let depth = 0;
  let start = true;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (depth === 0 && start && t.type === "name") {
      if (t.text === "export") continue;
      const name = tokens[i + 1];
      if (t.text === "function" && name.type === "name") {
        seen(name.text);
        top.fns.set(name.text, i);
      } else if (t.text === "const" && name.type === "name") {
        let j = i + 2;
        if (tokens[j].text === ":" && tokens[j + 1].text === "number") j += 2;
        const constant: TopConst = { value: null, whole: false };
        if (tokens[j].text === "=") {
          const minus = tokens[j + 1].text === "-";
          const num = tokens[j + (minus ? 2 : 1)];
          if (
            num.type === "num" &&
            DECIMAL.test(num.text) &&
            tokens[j + (minus ? 3 : 2)].text === ";"
          ) {
            constant.value = (minus ? -1 : 1) * Number(num.text);
            constant.whole = /^\d+$/.test(num.text) && Number(num.text) <= INT_MAX;
          }
        }
        seen(name.text);
        top.consts.set(name.text, constant);
      }
    }
    if (t.type === "punct") {
      if (t.text === "{" || t.text === "(" || t.text === "[") depth++;
      else if (t.text === "}" || t.text === ")" || t.text === "]") depth--;
    }
    start = depth === 0 && t.type === "punct" && (t.text === ";" || t.text === "}");
  }
  return top;
}

/* ---- the subset's tree ---- */

type Ty = "int" | "float" | "bool";
/** an integer sum of products of loop counters, by the counters' names joined by * ("" the constant) */
type Poly = Map<string, number>;

interface Base {
  at: number;
  /** its type, phase (a value a phase flows into) and, an integer's, its sum of counters: the checker's */
  ty?: Ty;
  ph?: boolean;
  poly?: Poly;
}
type Expr =
  | (Base & { k: "num"; value: number; whole: boolean })
  | (Base & { k: "name"; name: string; ref?: Binding | TopConst })
  | (Base & {
      k: "list";
      obj: string;
      prop: string | null;
      index: Expr;
      /** the checker's: a phase or a constant, U's numbers before its list (the C's), the index's range */
      phases?: boolean;
      offset?: number;
      lo?: number;
      hi?: number;
    })
  | (Base & { k: "math"; fn: string; args: Expr[] })
  | (Base & { k: "call"; fn: string; args: Expr[] })
  | (Base & { k: "unary"; op: "-" | "!"; arg: Expr })
  | (Base & { k: "binary"; op: string; left: Expr; right: Expr })
  | (Base & { k: "cond"; test: Expr; then: Expr; else: Expr });

type Stmt =
  | { k: "decl"; at: number; mutable: boolean; name: string; init: Expr | null; phase: boolean }
  | { k: "assign"; at: number; op: string; name: string; value: Expr }
  | { k: "if"; at: number; test: Expr; then: Stmt[]; else: Stmt[] | null }
  | {
      k: "for";
      at: number;
      counter: string;
      from: Expr;
      to: Expr;
      inclusive: boolean;
      body: Stmt[];
      /** the counter's first and last values: the checker's */
      lo: number;
      hi: number;
    }
  | { k: "return"; at: number; value: Expr }
  | { k: "break" | "continue"; at: number }
  | { k: "block"; at: number; body: Stmt[] };

interface Param {
  name: string;
  type: string;
  at: number;
  /** a phase is passed to it; it is assigned to */
  phase: boolean;
  assigned: boolean;
}
interface Fn {
  name: string;
  at: number;
  params: Param[];
  ret: string | null;
  body: Stmt[];
  /** each name it declares as the targets write it */
  outs: Map<string, string>;
}

/* ---- the parser ---- */

const LEVELS = [
  ["||"],
  ["&&"],
  ["===", "!==", "==", "!="],
  ["<", "<=", ">", ">="],
  ["+", "-"],
  ["*", "/"]
];
const COMPARE = new Set(["===", "!==", "==", "!=", "<", "<=", ">", ">="]);
const ASSIGNS = new Set(["=", "+=", "-=", "*=", "/="]);

/** The function declared at token `at`, parsed as the subset. */
function parseFn(tokens: Token[], at: number, fail: Fail): Fn {
  let i = at;
  const t = () => tokens[i];
  const is = (text: string) => {
    const k = tokens[i];
    return (k.type === "punct" || k.type === "name") && k.text === text;
  };
  const show = (k: Token) => (k.type === "end" ? "the file's end" : `"${k.text.slice(0, 24)}"`);
  const foreign = (k: Token): never => {
    if (k.type === "str" || k.type === "tpl") fail(k.pos, "strings are not in the kernel subset");
    if (k.type === "re") fail(k.pos, "regular expressions are not in the kernel subset");
    if (FOREIGN.has(k.text) && k.type !== "num") fail(k.pos, FOREIGN.get(k.text)!);
    return fail(k.pos, `${show(k)} is not in the kernel subset`);
  };
  const expect = (text: string) => {
    if (is(text)) return tokens[i++];
    const k = t();
    if (FOREIGN.has(k.text) || k.type === "str" || k.type === "tpl") foreign(k);
    return fail(k.pos, `expected ${text}, found ${show(k)}`);
  };
  const identifier = (what: string) => {
    const k = t();
    if (k.type !== "name" || FOREIGN.has(k.text))
      return fail(k.pos, `expected ${what}, found ${show(k)}`);
    i++;
    return k;
  };
  const type = () => {
    const k = identifier("a type");
    if (k.text !== "ArrayLike") return k.text;
    expect("<");
    const inner = identifier("a type").text;
    expect(">");
    return `ArrayLike<${inner}>`;
  };

  const primary = (): Expr => {
    const k = tokens[i++];
    if (k.type === "num") {
      if (!DECIMAL.test(k.text)) fail(k.pos, `write ${k.text} in plain decimal digits`);
      const value = Number(k.text);
      if (!floatable(value))
        fail(k.pos, `${k.text} is past a float's range, which the shaders compute in`);
      return { k: "num", at: k.pos, value, whole: /^\d+$/.test(k.text) && value <= INT_MAX };
    }
    if (k.type === "punct" && k.text === "(") {
      /* an arrow function's parameters (its brackets, then => or a return type and =>), or an expression's brackets,
         which a ?:'s colon may follow */
      let j = i;
      for (let depth = 1; depth > 0 && tokens[j].type !== "end"; j++) {
        if (tokens[j].text === "(") depth++;
        else if (tokens[j].text === ")") depth--;
      }
      let arrow = tokens[j].text === "=>";
      for (let m = j + 1, depth = 0; tokens[j].text === ":" && tokens[m].type !== "end"; m++) {
        const x = tokens[m].text;
        if (x === "=>" && !depth) arrow = true;
        if (x === "(" || x === "[" || x === "{") depth++;
        else if (x === ")" || x === "]" || x === "}") depth--;
        if (arrow || depth < 0 || ((x === ";" || x === ",") && !depth)) break;
      }
      if (arrow) fail(k.pos, CLOSURES);
      const e = expr();
      expect(")");
      return e;
    }
    if (k.type !== "name" || FOREIGN.has(k.text)) return foreign(k);
    if (is("=>")) fail(k.pos, CLOSURES);
    if (k.text === "Math") {
      expect(".");
      const fn = identifier("a Math function");
      if (fn.text === "PI") return { k: "math", at: k.pos, fn: "PI", args: [] };
      const m = MATH.get(fn.text);
      if (!m) {
        const instead = MATH_INSTEAD.get(fn.text);
        return fail(
          fn.pos,
          `Math.${fn.text} is not in the kernel subset${instead ? `: ${instead}` : ""}`
        );
      }
      const args = callArgs();
      if (m.n ? args.length !== m.n : args.length < 2)
        fail(
          k.pos,
          `Math.${fn.text} takes ${m.n ? m.n : "two or more"} arguments, not ${args.length}`
        );
      return { k: "math", at: k.pos, fn: fn.text, args };
    }
    if (is("(")) return { k: "call", at: k.pos, fn: k.text, args: callArgs() };
    let prop: string | null = null;
    if (is(".")) {
      i++;
      prop = identifier("a name").text;
      if (!is("[")) fail(k.pos, `${k.text}.${prop}: a kernel reads a list as U.name[index]`);
    }
    if (!is("[")) return { k: "name", at: k.pos, name: k.text };
    i++;
    const index = expr();
    expect("]");
    return { k: "list", at: k.pos, obj: k.text, prop, index };
  };
  const callArgs = () => {
    expect("(");
    const args: Expr[] = [];
    while (!is(")")) {
      args.push(expr());
      if (!is(",")) break;
      i++;
    }
    expect(")");
    return args;
  };
  const postfix = (): Expr => {
    const e = primary();
    if (is("(") || is("[") || is("."))
      fail(t().pos, "a kernel reads only U.name[index] and F[index]");
    if (is("++") || is("--") || is("!")) foreign(t());
    return e;
  };
  const unary = (): Expr => {
    const k = t();
    if (is("-") || is("!")) {
      i++;
      return { k: "unary", at: k.pos, op: k.text as "-" | "!", arg: unary() };
    }
    if (is("+")) fail(k.pos, "unary + is not in the kernel subset");
    return postfix();
  };
  const binary = (level: number): Expr => {
    if (level === LEVELS.length) return unary();
    let left = binary(level + 1);
    while (t().type === "punct" && LEVELS[level].includes(t().text)) {
      const op = tokens[i++].text;
      left = { k: "binary", at: left.at, op, left, right: binary(level + 1) };
    }
    if (FOREIGN.has(t().text) && t().type === "punct" && !ASSIGNS.has(t().text) && t().text !== "{")
      foreign(t());
    return left;
  };
  const expr = (): Expr => {
    const test = binary(0);
    if (!is("?")) return test;
    i++;
    const then = expr();
    expect(":");
    return { k: "cond", at: test.at, test, then, else: expr() };
  };

  const block = (): Stmt[] => {
    expect("{");
    const body: Stmt[] = [];
    while (!is("}")) {
      if (t().type === "end") fail(t().pos, "a block that never ends");
      body.push(stmt());
    }
    i++;
    return body;
  };
  /** an if's or a loop's body: a block, or one statement */
  const body = () => (is("{") ? block() : [stmt()]);
  const stmt = (): Stmt => {
    const k = t();
    if (is("{")) return { k: "block", at: k.pos, body: block() };
    if (k.type === "name") {
      switch (k.text) {
        case "const":
        case "let": {
          i++;
          const name = identifier("a name");
          let typed = false;
          if (is(":")) {
            i++;
            const ty = type();
            if (ty !== "number")
              fail(name.pos, `${name.text} is a ${ty}: a kernel's values are numbers`);
            typed = true;
          }
          let init: Expr | null = null;
          if (is("=")) {
            i++;
            init = expr();
          } else if (k.text === "const" || !typed)
            fail(name.pos, `give ${name.text} a value, or a type: let ${name.text}: number`);
          if (is(",")) fail(t().pos, "declare one name a statement");
          expect(";");
          return {
            k: "decl",
            at: k.pos,
            mutable: k.text === "let",
            name: name.text,
            init,
            phase: false
          };
        }
        case "if": {
          i++;
          expect("(");
          const test = expr();
          expect(")");
          const then = body();
          let els: Stmt[] | null = null;
          if (is("else")) {
            i++;
            els = body();
          }
          return { k: "if", at: k.pos, test, then, else: els };
        }
        case "for": {
          i++;
          expect("(");
          if (!is("let")) fail(t().pos, `a loop is for (let i = 0; i < N; i++)`);
          i++;
          const counter = identifier("a counter").text;
          if (is(":")) {
            i++;
            if (type() !== "number") fail(k.pos, "a loop's counter is a number");
          }
          expect("=");
          const from = expr();
          expect(";");
          const named = identifier("the counter");
          const op = tokens[i++];
          if (named.text !== counter || (op.text !== "<" && op.text !== "<="))
            fail(named.pos, `a loop runs while its counter is below a constant: ${counter} < N`);
          const to = expr();
          expect(";");
          const pre = is("++");
          if (pre) i++;
          const updated = identifier("the counter").text;
          const step = pre || is("++") || (is("+=") && tokens[i + 1].text === "1");
          if (updated !== counter || !step) fail(t().pos, `a loop counts by one: ${counter}++`);
          if (!pre) i += is("++") ? 1 : 2;
          expect(")");
          const loop = body();
          return {
            k: "for",
            at: k.pos,
            counter,
            from,
            to,
            inclusive: op.text === "<=",
            body: loop,
            lo: 0,
            hi: 0
          };
        }
        case "return": {
          i++;
          if (is(";")) fail(k.pos, "a kernel returns a number");
          const value = expr();
          expect(";");
          return { k: "return", at: k.pos, value };
        }
        case "break":
        case "continue":
          i++;
          expect(";");
          return { k: k.text, at: k.pos };
        default: {
          if (FOREIGN.has(k.text)) foreign(k);
          const op = tokens[i + 1];
          if (op.type === "punct" && ASSIGNS.has(op.text)) {
            i += 2;
            const value = expr();
            expect(";");
            return { k: "assign", at: k.pos, op: op.text, name: k.text, value };
          }
          if (op.text === "++" || op.text === "--") fail(op.pos, COUNT);
        }
      }
    }
    if (is("++") || is("--")) fail(k.pos, COUNT);
    if (is(";")) fail(k.pos, "a stray ;");
    expr();
    if (ASSIGNS.has(t().text)) fail(k.pos, "a kernel assigns only its own variables");
    return fail(
      k.pos,
      "this does nothing: a kernel's statements declare, assign, branch, loop or return"
    );
  };

  expect("function");
  const name = identifier("a function's name");
  expect("(");
  const params: Param[] = [];
  while (!is(")")) {
    const p = identifier("a parameter");
    if (is("?")) fail(p.pos, "a kernel's parameters are not optional");
    if (!is(":")) fail(p.pos, `give ${p.text} its type`);
    i++;
    params.push({ name: p.text, type: type(), at: p.pos, phase: false, assigned: false });
    if (is("=")) fail(t().pos, "a kernel's parameters have no defaults");
    if (!is(",")) break;
    i++;
  }
  expect(")");
  let ret: string | null = null;
  if (is(":")) {
    i++;
    ret = type();
  }
  return { name: name.text, at: name.pos, params, ret, body: block(), outs: new Map() };
}

/* ---- integers ---- */

const polyConst = (v: number): Poly => new Map([["", v]]);
const polyIsConst = (p: Poly) => [...p].every(([key, c]) => key === "" || c === 0);
const polyValue = (p: Poly) => p.get("") ?? 0;
function polyAdd(a: Poly, b: Poly, sign = 1): Poly {
  const out = new Map(a);
  for (const [key, c] of b) out.set(key, (out.get(key) ?? 0) + sign * c);
  return out;
}
function polyMul(a: Poly, b: Poly): Poly {
  const out: Poly = new Map();
  for (const [ka, ca] of a)
    for (const [kb, cb] of b) {
      const key = [...ka.split("*"), ...kb.split("*")].filter(Boolean).sort().join("*");
      out.set(key, (out.get(key) ?? 0) + ca * cb);
    }
  return out;
}
/** its least and greatest values while each counter runs its range */
function polyRange(p: Poly, range: (name: string) => [number, number]): [number, number] {
  const terms = [...p].filter(([key, c]) => key !== "" && c !== 0);
  const names = [...new Set(terms.flatMap(([key]) => key.split("*")))];
  let lo = polyValue(p);
  let hi = lo;
  if (terms.every(([key]) => !key.includes("*"))) {
    for (const [key, c] of terms) {
      const [a, b] = range(key);
      lo += Math.min(c * a, c * b);
      hi += Math.max(c * a, c * b);
    }
    return [lo, hi];
  }
  /* a product of counters: every value they take (a few loops' worth) */
  lo = Infinity;
  hi = -Infinity;
  const values = new Map<string, number>();
  const visit = (n: number) => {
    if (n === names.length) {
      let v = polyValue(p);
      for (const [key, c] of terms)
        v += key.split("*").reduce((m, name) => m * values.get(name)!, c);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
      return;
    }
    const [a, b] = range(names[n]);
    for (let v = a; v <= b; v++) {
      values.set(names[n], v);
      visit(n + 1);
    }
  };
  visit(0);
  return [lo, hi];
}
/** The most any step of it reaches as the targets compute it, each term's coefficient times its counters left to
    right and the terms summed in turn: within int32, none wraps. */
function polyReach(p: Poly, range: (name: string) => [number, number]): number {
  let sum = 0;
  for (const [key, c] of p) {
    let term = Math.abs(c);
    for (const name of key ? key.split("*") : []) {
      const [a, b] = range(name);
      term *= Math.max(1, Math.abs(a), Math.abs(b));
    }
    sum += term;
  }
  return sum;
}

/* ---- the checker: names, types, phases, ranges ---- */

interface Binding {
  kind: "param" | "local" | "counter" | "U" | "F";
  mutable: boolean;
  /** where its phase persists from one pass to the next */
  src: { phase: boolean };
  param?: Param;
  lo: number;
  hi: number;
}

interface Program {
  opts: KernelOptions;
  top: Top;
  fns: Map<string, Fn>;
  /** each list's first number in the C's U */
  offsets: Map<string, number>;
  fail: Fail;
}

const visitExprs = (list: Stmt[], f: (e: Expr) => void) => {
  const each = (e: Expr): void => {
    f(e);
    if (e.k === "list") each(e.index);
    else if (e.k === "math" || e.k === "call") e.args.forEach(each);
    else if (e.k === "unary") each(e.arg);
    else if (e.k === "binary") {
      each(e.left);
      each(e.right);
    } else if (e.k === "cond") {
      each(e.test);
      each(e.then);
      each(e.else);
    }
  };
  const stmts = (l: Stmt[]): void => {
    for (const s of l) {
      if (s.k === "decl" && s.init) each(s.init);
      else if (s.k === "assign") each(s.value);
      else if (s.k === "return") each(s.value);
      else if (s.k === "if") {
        each(s.test);
        stmts(s.then);
        if (s.else) stmts(s.else);
      } else if (s.k === "for") {
        each(s.from);
        each(s.to);
        stmts(s.body);
      } else if (s.k === "block") stmts(s.body);
    }
  };
  stmts(list);
};

/** a statement after which nothing in its block runs */
const stops = (s: Stmt): boolean =>
  s.k === "return" ||
  s.k === "break" ||
  s.k === "continue" ||
  (s.k === "if" && !!s.else && s.then.some(stops) && s.else.some(stops)) ||
  (s.k === "block" && s.body.some(stops));
/** a statement that returns on every path through it */
const returns = (s: Stmt): boolean =>
  s.k === "return" ||
  (s.k === "if" && !!s.else && s.then.some(returns) && s.else.some(returns)) ||
  (s.k === "block" && s.body.some(returns));

/** One pass over a function: every name resolved, every expression typed, its phases followed; true where a phase
    reached a name it had not reached before (the pass is run again until none does). */
function checkPass(fn: Fn, kernel: boolean, prog: Program): boolean {
  const { opts, top } = prog;
  const fail: Fail = prog.fail;
  const scopes: Map<string, Binding>[] = [];
  let loops = 0;
  let grew = false;
  const find = (name: string) => {
    for (let s = scopes.length - 1; s >= 0; s--) {
      const b = scopes[s].get(name);
      if (b) return b;
    }
    return undefined;
  };
  /** a name into the innermost scope; the kernel's parameters, which every target writes x, y, U and F, take any */
  const declare = (name: string, at: number, b: Binding, anyName = false) => {
    if (!anyName && !nameable(name)) fail(at, `name ${name} in ${NAME_RULE}`);
    if (find(name)) fail(at, `${name} is declared again inside its own scope: name it apart`);
    scopes[scopes.length - 1].set(name, b);
  };
  const phase = (b: Binding) => {
    if (b.src.phase) return;
    b.src.phase = true;
    grew = true;
  };
  const number = (e: Expr) => {
    if (e.ty === "bool") fail(e.at, "a comparison is not a number: write c ? 1 : 0");
  };
  const condition = (e: Expr) => {
    if (e.ty !== "bool") fail(e.at, "a condition is a comparison of numbers");
  };
  const noPhase = (e: Expr, where: string) => {
    if (e.ph)
      fail(
        e.at,
        `a phase (F) is read only inside Math.sin or Math.cos, through sums, differences and whole multiples, not ${where}`
      );
  };
  const range = (name: string): [number, number] => {
    const b = find(name)!;
    return [b.lo, b.hi];
  };
  /** an integer the targets compute in int32, refused where a step of it could pass it */
  const int32 = (p: Poly, at: number, message: string) => {
    if (polyReach(p, range) > INT_MAX) fail(at, message);
  };
  /** a constant's whole number: a loop's bounds */
  const whole = (e: Expr): number => {
    expr(e);
    if (e.ty !== "int" || !polyIsConst(e.poly!))
      fail(e.at, "a loop's bounds are whole numbers: literals and top-level consts with + - *");
    return polyValue(e.poly!);
  };

  const expr = (e: Expr): void => {
    e.ph = false;
    e.poly = undefined;
    switch (e.k) {
      case "num":
        e.ty = e.whole ? "int" : "float";
        if (e.whole) e.poly = polyConst(e.value);
        return;
      case "name": {
        const b = find(e.name);
        if (b) {
          if (b.kind === "U" || b.kind === "F")
            fail(
              e.at,
              b.kind === "U"
                ? `${e.name} is read as ${e.name}.name[index]`
                : `${e.name} is read as ${e.name}[index]`
            );
          e.ref = b;
          e.ph = b.src.phase;
          e.ty = b.kind === "counter" ? "int" : "float";
          if (b.kind === "counter") e.poly = new Map([[e.name, 1]]);
          return;
        }
        const c = top.consts.get(e.name);
        if (!c) {
          if (top.fns.has(e.name)) fail(e.at, `${e.name} is a function: call it`);
          fail(
            e.at,
            `${e.name} is not a parameter, local, loop counter or top-level const of this file`
          );
        }
        if (top.twice.has(e.name)) fail(e.at, `${e.name} is declared at the top more than once`);
        if (c.value === null)
          fail(
            e.at,
            `${e.name} is not a number: a kernel inlines only top-level const NAME = <number>`
          );
        if (!floatable(c.value))
          fail(e.at, `${e.name} is past a float's range, which the shaders compute in`);
        e.ref = c;
        e.ty = c.whole ? "int" : "float";
        if (c.whole) e.poly = polyConst(c.value);
        return;
      }
      case "list": {
        const b = find(e.obj);
        const what = `${e.obj}${e.prop === null ? "" : `.${e.prop}`}`;
        if (!b || (b.kind !== "U" && b.kind !== "F"))
          fail(
            e.at,
            `${what}[]: a kernel reads only its constants U.name[index] and its phases F[index]`
          );
        let length = opts.tracks;
        if (b.kind === "U") {
          if (e.prop === null) fail(e.at, `${e.obj} is read as ${e.obj}.name[index]`);
          if (!Object.hasOwn(opts.uniforms, e.prop))
            fail(
              e.at,
              `${what} is not one of the effect's uniforms (${Object.keys(opts.uniforms).join(", ")})`
            );
          length = opts.uniforms[e.prop];
          e.offset = prog.offsets.get(e.prop);
        } else if (e.prop !== null) fail(e.at, `${e.obj} is read as ${e.obj}[index]`);
        e.phases = b.kind === "F";
        expr(e.index);
        if (e.index.ty !== "int")
          fail(
            e.index.at,
            "an index is a whole number of loop counters, whole-number literals and consts with + - *"
          );
        const [lo, hi] = polyRange(e.index.poly!, range);
        e.lo = lo;
        e.hi = hi;
        if (lo < 0 || hi >= length)
          fail(e.index.at, `${what}[] reaches ${lo < 0 ? lo : hi}, outside its ${length} numbers`);
        /* as the C writes it, past the lists before it, the most of any target's */
        int32(
          polyAdd(e.index.poly!, polyConst(e.offset ?? 0)),
          e.index.at,
          `${what}[]'s index could pass 2^31 on the way, where int32 wraps`
        );
        e.ty = "float";
        e.ph = e.phases;
        return;
      }
      case "math":
        for (const a of e.args) {
          expr(a);
          number(a);
          if (e.fn !== "sin" && e.fn !== "cos") noPhase(a, `Math.${e.fn}`);
        }
        e.ty = "float";
        return;
      case "call": {
        const callee = prog.fns.get(e.fn)!;
        if (e.args.length !== callee.params.length)
          fail(e.at, `${e.fn} takes ${callee.params.length} arguments, not ${e.args.length}`);
        e.args.forEach((a, n) => {
          expr(a);
          number(a);
          if (a.ph) callee.params[n].phase = true;
        });
        e.ty = "float";
        return;
      }
      case "unary":
        expr(e.arg);
        if (e.op === "!") {
          condition(e.arg);
          e.ty = "bool";
          return;
        }
        number(e.arg);
        e.ty = e.arg.ty;
        e.ph = e.arg.ph;
        if (e.arg.poly) e.poly = polyMul(e.arg.poly, polyConst(-1));
        return;
      case "binary": {
        const { op, left: l, right: r } = e;
        expr(l);
        expr(r);
        if (op === "&&" || op === "||") {
          condition(l);
          condition(r);
          e.ty = "bool";
          return;
        }
        number(l);
        number(r);
        if (COMPARE.has(op)) {
          noPhase(l, "a comparison");
          noPhase(r, "a comparison");
          if (l.poly && r.poly) {
            const message =
              "this side of a comparison of integers could pass 2^31 on the way, where int32 wraps: write a number in it with a point to compare floats";
            int32(l.poly, l.at, message);
            int32(r.poly, r.at, message);
          }
          e.ty = "bool";
          return;
        }
        if (op !== "/" && l.poly && r.poly) {
          e.ty = "int";
          e.poly =
            op === "*" ? polyMul(l.poly, r.poly) : polyAdd(l.poly, r.poly, op === "-" ? -1 : 1);
          return;
        }
        e.ty = "float";
        if (op === "+" || op === "-") e.ph = l.ph || r.ph;
        else if (op === "*") {
          if ((l.ph && r.ty !== "int") || (r.ph && l.ty !== "int"))
            noPhase(l.ph ? l : r, "a product with a fraction");
          e.ph = l.ph || r.ph;
        } else {
          noPhase(l, "a division");
          noPhase(r, "a division");
        }
        return;
      }
      case "cond":
        expr(e.test);
        condition(e.test);
        expr(e.then);
        expr(e.else);
        number(e.then);
        number(e.else);
        e.ty = "float";
        e.ph = e.then.ph || e.else.ph;
        return;
    }
  };

  const stmts = (list: Stmt[], scope = new Map<string, Binding>()) => {
    scopes.push(scope);
    let stopped = false;
    for (const s of list) {
      if (stopped) fail(s.at, "this is never reached");
      stmt(s);
      stopped = stops(s);
    }
    scopes.pop();
  };
  const stmt = (s: Stmt): void => {
    switch (s.k) {
      case "decl": {
        if (s.init) {
          expr(s.init);
          number(s.init);
        }
        const b: Binding = { kind: "local", mutable: s.mutable, src: s, lo: 0, hi: 0 };
        declare(s.name, s.at, b);
        if (s.init?.ph) phase(b);
        return;
      }
      case "assign": {
        const b = find(s.name);
        if (!b) fail(s.at, `${s.name} is not declared in the kernel`);
        if (b.kind === "counter")
          fail(s.at, `${s.name} is a loop's counter: it changes only in the loop's head`);
        if (b.kind === "U" || b.kind === "F" || !b.mutable) fail(s.at, `${s.name} is a const`);
        expr(s.value);
        number(s.value);
        const v = s.value;
        if (s.op === "/=") noPhase(v, "a division");
        if (s.op === "*=" && v.ph) noPhase(v, "a product with a fraction");
        if (s.op === "/=" && b.src.phase) fail(s.at, `${s.name} holds a phase: it is not divided`);
        if (s.op === "*=" && b.src.phase && v.ty !== "int")
          fail(s.at, `${s.name} holds a phase: it is not scaled`);
        if (v.ph) phase(b);
        if (b.param) b.param.assigned = true;
        return;
      }
      case "if":
        expr(s.test);
        condition(s.test);
        stmts(s.then);
        if (s.else) stmts(s.else);
        return;
      case "for": {
        s.lo = whole(s.from);
        s.hi = whole(s.to) - (s.inclusive ? 0 : 1);
        if (s.hi < s.lo) fail(s.at, "this loop never runs");
        /* the counter steps once past its last value */
        if (s.lo < -INT_MAX - 1 || s.hi >= INT_MAX)
          fail(s.at, "a loop's counter runs inside int32");
        const scope = new Map<string, Binding>();
        scopes.push(scope);
        declare(s.counter, s.at, {
          kind: "counter",
          mutable: false,
          src: { phase: false },
          lo: s.lo,
          hi: s.hi
        });
        scopes.pop();
        loops++;
        stmts(s.body, scope);
        loops--;
        return;
      }
      case "return":
        expr(s.value);
        number(s.value);
        noPhase(s.value, kernel ? "the field" : `${fn.name}'s return`);
        return;
      case "break":
      case "continue":
        if (!loops) fail(s.at, `${s.k} is outside a loop`);
        return;
      case "block":
        stmts(s.body);
        return;
    }
  };

  scopes.push(new Map());
  fn.params.forEach((p, n) => {
    const kind = kernel && n === 2 ? "U" : kernel && n === 3 ? "F" : "param";
    const b: Binding = { kind, mutable: kind === "param", src: p, param: p, lo: 0, hi: 0 };
    declare(p.name, p.at, b, kernel);
  });
  stmts(fn.body);
  if (!fn.body.some(returns)) fail(fn.at, `${fn.name} ends without returning a number`);
  return grew;
}

/** The kernel and every function it calls, parsed and checked, callees before their callers. */
function program(source: string, opts: KernelOptions, fail: Fail): Program & { order: Fn[] } {
  const { name, kind, uniforms, tracks } = opts;
  if (!/^[a-z]+$/.test(kind)) fail(0, `the kind ${kind} is lower case letters`);
  if (!Number.isInteger(tracks) || tracks < 1)
    fail(0, `an effect has whole tracks, at least one, not ${tracks}`);
  const offsets = new Map<string, number>();
  let offset = 0;
  for (const [list, length] of Object.entries(uniforms)) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(list) || RESERVED.has(list) || list === "f")
      fail(
        0,
        `the uniform ${list} needs another name: letters and digits, not f nor a word GLSL, WGSL or C keeps`
      );
    if (!Number.isInteger(length) || length < 1)
      fail(0, `the uniform ${list} holds ${length} numbers`);
    offsets.set(list, offset);
    offset += length;
  }
  const tokens = tokenize(source, fail);
  const top = scanTop(tokens);
  const prog: Program = { opts, top, fns: new Map(), offsets, fail };
  const parse = (fnName: string, at: number) => {
    let fn = prog.fns.get(fnName);
    if (fn) return fn;
    const start = top.fns.get(fnName);
    if (start === undefined)
      fail(
        at,
        top.consts.has(fnName)
          ? `${fnName} is not a function declaration: write function ${fnName}(...) at the top level`
          : `${fnName} is not a top-level function of this file`
      );
    if (top.twice.has(fnName)) fail(at, `${fnName} is declared at the top more than once`);
    fn = parseFn(tokens, start, fail);
    prog.fns.set(fnName, fn);
    return fn;
  };
  /* every function the kernel reaches, depth first: a call back into one still open is recursion */
  const order: Fn[] = [];
  const open = new Set<string>();
  const done = new Set<string>();
  const reach = (fnName: string, at: number) => {
    if (open.has(fnName))
      fail(
        at,
        `${fnName} is called again from inside its own call: recursion is not in the kernel subset`
      );
    if (done.has(fnName)) return;
    const fn = parse(fnName, at);
    open.add(fnName);
    visitExprs(fn.body, e => {
      if (e.k === "call") reach(e.fn, e.at);
    });
    open.delete(fnName);
    done.add(fnName);
    order.push(fn);
  };
  reach(name, 0);
  const kernel = prog.fns.get(name)!;
  const sig = kernel.params.map(p => p.type).join(", ");
  if (
    sig !== "number, number, KernelU, ArrayLike<number>" ||
    (kernel.ret && kernel.ret !== "number")
  )
    fail(kernel.at, `a kernel is (x: number, y: number, U: KernelU, F: ArrayLike<number>): number`);
  for (const fn of order) {
    if (fn === kernel) continue;
    /* written k_<name>: the rule a local's name keeps, and no _ first, which would make it k__ */
    if (!nameable(fn.name) || fn.name.startsWith("_"))
      fail(
        fn.at,
        `name the function ${fn.name} in ${NAME_RULE}; a function's not beginning _ at all`
      );
    if (fn.params.some(p => p.type !== "number") || (fn.ret && fn.ret !== "number"))
      fail(fn.at, `${fn.name}'s parameters and its return are numbers`);
  }
  /* callers before callees, so a helper knows which of its parameters a phase reaches */
  for (const fn of [...order].reverse()) {
    nameOuts(fn, fn === kernel);
    while (checkPass(fn, fn === kernel, prog));
  }
  return { ...prog, order };
}

/** Each name a function declares as the targets write it: the kernel's parameters x, y, U and F whatever its author
    named them (the pages call kfield(x, y), and an author names an unused one _y), every other name itself, or with
    _v after it where a target keeps it or the kernel's parameters took it. */
function nameOuts(fn: Fn, kernel: boolean) {
  const fixed = kernel ? ["x", "y", "U", "F"] : [];
  const names = new Set<string>();
  fn.params.forEach((p, n) => {
    if (kernel) fn.outs.set(p.name, fixed[n]);
    else names.add(p.name);
  });
  const each = (list: Stmt[]): void => {
    for (const s of list) {
      if (s.k === "decl") names.add(s.name);
      else if (s.k === "for") {
        names.add(s.counter);
        each(s.body);
      } else if (s.k === "if") {
        each(s.then);
        if (s.else) each(s.else);
      } else if (s.k === "block") each(s.body);
    }
  };
  each(fn.body);
  const taken = new Set([...names, ...fixed]);
  for (const name of names) {
    let out = name;
    for (
      let n = 1;
      RESERVED.has(out) || fixed.includes(out) || (out !== name && taken.has(out));
      n++
    )
      out = `${name}_v${n > 1 ? n : ""}`;
    taken.add(out);
    fn.outs.set(name, out);
  }
}

/* ---- cost ---- */

/** What one call of a function takes, as SPEC counts it: + - * / and a compare each 1 (a compound assignment's
    operation too, && and || as compares), Math's functions as MATH says, a helper call its body, a loop its body times
    its count, an if or a ?: its test and its costlier side (the most one evaluation does); nothing for reading U and F,
    a negation, an integer's conversion or an index's arithmetic, which the GPU folds into the operations around them. */
function costOf(fn: Fn, costs: Map<string, number>): number {
  const expr = (e: Expr): number => {
    switch (e.k) {
      case "num":
      case "name":
      case "list":
        return 0;
      case "math":
        return e.fn === "PI"
          ? 0
          : MATH.get(e.fn)!.cost * Math.max(1, e.args.length - 1) +
              e.args.reduce((s, a) => s + expr(a), 0);
      case "call":
        return costs.get(e.fn)! + e.args.reduce((s, a) => s + expr(a), 0);
      case "unary":
        return expr(e.arg);
      case "binary":
        return 1 + expr(e.left) + expr(e.right);
      case "cond":
        return expr(e.test) + Math.max(expr(e.then), expr(e.else));
    }
  };
  const stmts = (list: Stmt[]): number => list.reduce((sum, s) => sum + stmt(s), 0);
  const stmt = (s: Stmt): number => {
    switch (s.k) {
      case "decl":
        return s.init ? expr(s.init) : 0;
      case "assign":
        return (s.op === "=" ? 0 : 1) + expr(s.value);
      case "if":
        return expr(s.test) + Math.max(stmts(s.then), s.else ? stmts(s.else) : 0);
      case "for":
        return (s.hi - s.lo + 1) * stmts(s.body);
      case "return":
        return expr(s.value);
      case "block":
        return stmts(s.body);
      default:
        return 0;
    }
  };
  return stmts(fn.body);
}

/* ---- the targets ---- */

type Target = "glsl" | "wgsl" | "c";
/** printed code and how tightly it binds: 1 ?:, 2 ||, 3 &&, 4 equality, 5 comparison, 6 + -, 7 * /, 8 unary, 9 an
    atom (a name, a call, a read, a literal) */
type Printed = [string, number];
const PREC: Record<string, number> = {
  "||": 2,
  "&&": 3,
  "<": 5,
  "<=": 5,
  ">": 5,
  ">=": 5,
  "+": 6,
  "-": 6,
  "*": 7,
  "/": 7
};
const EQUALS: Record<string, string> = { "===": "==", "!==": "!=", "==": "==", "!=": "!=" };

/** A float as every target writes one, with a decimal point; the C's parses to the very double. */
function floatText(v: number): Printed {
  const s = Object.is(v, -0) ? "-0.0" : String(v);
  const text = s.includes(".") ? s : s.includes("e") ? s.replace("e", ".0e") : `${s}.0`;
  return [text, text.startsWith("-") ? 8 : 9];
}
const wrap = ([text, prec]: Printed, under: number): string => (prec < under ? `(${text})` : text);

/** An integer with no counter in it, as the double JS computes it (-0 kept); undefined where a counter runs in it. */
function constantOf(e: Expr): number | undefined {
  switch (e.k) {
    case "num":
      return e.value;
    case "name":
      return e.ref && "value" in e.ref ? e.ref.value! : undefined;
    case "unary": {
      const v = constantOf(e.arg);
      return v === undefined ? undefined : -v;
    }
    case "binary": {
      const l = constantOf(e.left);
      const r = constantOf(e.right);
      if (l === undefined || r === undefined) return undefined;
      return e.op === "+" ? l + r : e.op === "-" ? l - r : l * r;
    }
    default:
      return undefined;
  }
}

/** A function in one target. */
function emitFn(fn: Fn, kernel: boolean, target: Target, prog: Program): string {
  const { kind } = prog.opts;
  const params = kernel ? fn.params.slice(0, 2) : fn.params;
  /* WGSL's parameters are constants: one the function assigns to keeps its name, which the pages call kfield by, and
     is copied into a variable, <name>_m, which the body reads and writes */
  const copies = new Map<string, string>();
  if (target === "wgsl") {
    const taken = new Set(fn.outs.values());
    for (const p of params)
      if (p.assigned) {
        const from = fn.outs.get(p.name)!;
        let name = `${from}_m`;
        for (let n = 2; taken.has(name); n++) name = `${from}_m${n}`;
        taken.add(name);
        copies.set(p.name, name);
      }
  }
  const out = (name: string) => copies.get(name) ?? fn.outs.get(name)!;
  const helper = (name: string) => (target === "c" ? `k_${kind}_${name}` : `k_${name}`);
  const polyText = (p: Poly): Printed => {
    const terms = [...p]
      .filter(([, c]) => c !== 0)
      .sort(([a], [b]) =>
        a === "" ? 1 : b === "" ? -1 : b.split("*").length - a.split("*").length || (a < b ? -1 : 1)
      );
    if (!terms.length) return ["0", 9];
    let text = "";
    for (const [key, c] of terms) {
      const names = key ? key.split("*").map(out).join(" * ") : "";
      const term = !key
        ? String(Math.abs(c))
        : Math.abs(c) === 1
          ? names
          : `${Math.abs(c)} * ${names}`;
      text = text ? `${text} ${c < 0 ? "-" : "+"} ${term}` : c < 0 ? `-${term}` : term;
    }
    if (terms.length > 1) return [text, 6];
    return [text, text.includes("*") ? 7 : text.startsWith("-") ? 8 : 9];
  };
  /* a list's number: in the shaders four to a vector, by the vector and the place in it (a swizzle where the index
     is a multiple of four past a constant), in the C U's lists laid end to end */
  const read = (e: Extract<Expr, { k: "list" }>): Printed => {
    let p = e.index.poly!;
    if (target === "c") {
      if (!e.phases) p = polyAdd(p, polyConst(e.offset!));
      return [`${out(e.obj)}[${polyText(p)[0]}]`, 9];
    }
    const base = e.phases
      ? target === "glsl"
        ? "uKF"
        : "kk.f"
      : target === "glsl"
        ? `uK_${e.prop}`
        : `kk.${e.prop}`;
    if ([...p].every(([key, c]) => key === "" || c % 4 === 0)) {
      const b = polyValue(p);
      const vec = new Map([...p].map(([key, c]) => [key, key === "" ? Math.floor(b / 4) : c / 4]));
      return [`${base}[${polyText(vec)[0]}].${"xyzw"[b - 4 * Math.floor(b / 4)]}`, 9];
    }
    /* every number the index reaches in one vector: that vector, the place in it the index less its start */
    const q = Math.floor(e.lo! / 4);
    if (Math.floor(e.hi! / 4) === q)
      return [`${base}[${q}][${polyText(polyAdd(p, polyConst(-4 * q)))[0]}]`, 9];
    const index = wrap(polyText(p), 7);
    return [`${base}[${index} / 4][${index} % 4]`, 9];
  };
  const ex = (e: Expr, want: Ty): Printed => {
    if (e.ty === "int") {
      if (want === "int") return polyText(e.poly!);
      /* an integer among floats is its own tree computed in floats, in JS's order, so it never wraps and -i is -0
         where i is 0, as in JS: a part with no counter in it the double JS makes of it, a counter converted, the
         rest the float arithmetic below */
      const v = constantOf(e);
      if (v !== undefined) {
        if (!floatable(v)) prog.fail(e.at, "this whole number is past a float's range");
        return floatText(v);
      }
      if (e.k === "name") {
        const c = out(e.name);
        return target === "c"
          ? [`(double)${c}`, 8]
          : [`${target === "glsl" ? "float" : "f32"}(${c})`, 9];
      }
    }
    switch (e.k) {
      case "num":
        return floatText(e.value);
      case "name":
        return e.ref && "value" in e.ref ? floatText(e.ref.value!) : [out(e.name), 9];
      case "list":
        return read(e);
      case "math": {
        if (e.fn === "PI") return floatText(Math.PI);
        /* min and max of more than two: each two in turn, as JS compares them */
        const fn = MATH.get(e.fn)![target];
        const [first, ...rest] = e.args.map(a => ex(a, "float")[0]);
        if (!rest.length) return [`${fn}(${first})`, 9];
        return [rest.reduce((acc, a) => `${fn}(${acc}, ${a})`, first), 9];
      }
      case "call":
        return [`${helper(e.fn)}(${e.args.map(a => ex(a, "float")[0]).join(", ")})`, 9];
      case "unary": {
        const arg = ex(e.arg, e.op === "!" ? "bool" : "float");
        const text =
          arg[1] < 8 || (e.op === "-" && arg[0].startsWith("-")) ? `(${arg[0]})` : arg[0];
        return [`${e.op}${text}`, 8];
      }
      case "binary": {
        const { op, left, right } = e;
        if (op === "&&" || op === "||") {
          const p = PREC[op];
          const l = ex(left, "bool");
          const r = ex(right, "bool");
          /* WGSL takes no && beside || unbracketed, and every target reads it more plainly so */
          const lt = l[1] < 4 && l[1] !== p ? `(${l[0]})` : wrap(l, p);
          const rt = r[1] < 4 ? `(${r[0]})` : r[0];
          return [`${lt} ${op} ${rt}`, p];
        }
        if (COMPARE.has(op)) {
          const want = left.ty === "int" && right.ty === "int" ? "int" : "float";
          const p = EQUALS[op] ? 4 : 5;
          return [
            `${wrap(ex(left, want), p)} ${EQUALS[op] ?? op} ${wrap(ex(right, want), p + 1)}`,
            p
          ];
        }
        const p = PREC[op];
        return [`${wrap(ex(left, "float"), p)} ${op} ${wrap(ex(right, "float"), p + 1)}`, p];
      }
      case "cond": {
        const test = ex(e.test, "bool");
        const then = ex(e.then, "float");
        const els = ex(e.else, "float");
        if (target === "wgsl") return [`select(${els[0]}, ${then[0]}, ${test[0]})`, 9];
        return [`${wrap(test, 2)} ? ${wrap(then, 2)} : ${wrap(els, 2)}`, 1];
      }
    }
  };

  const lines: string[] = [];
  const float = target === "glsl" ? "float" : target === "wgsl" ? "f32" : "double";
  const stmts = (list: Stmt[], ind: string) => {
    for (const s of list) stmt(s, ind);
  };
  /* an if's body and its else, an else of one if written else if */
  const ifRest = (s: Extract<Stmt, { k: "if" }>, ind: string): void => {
    stmts(s.then, `${ind}  `);
    const first = s.else?.[0];
    if (s.else?.length === 1 && first?.k === "if") {
      lines.push(`${ind}} else if (${ex(first.test, "bool")[0]}) {`);
      ifRest(first, ind);
      return;
    }
    if (s.else) {
      lines.push(`${ind}} else {`);
      stmts(s.else, `${ind}  `);
    }
    lines.push(`${ind}}`);
  };
  const stmt = (s: Stmt, ind: string): void => {
    switch (s.k) {
      case "decl": {
        const init = s.init ? ` = ${ex(s.init, "float")[0]}` : "";
        if (target === "wgsl")
          lines.push(`${ind}${s.mutable ? "var" : "let"} ${out(s.name)}: f32${init};`);
        else
          lines.push(
            `${ind}${target === "c" && !s.mutable ? "const " : ""}${float} ${out(s.name)}${init};`
          );
        return;
      }
      case "assign":
        lines.push(`${ind}${out(s.name)} ${s.op} ${ex(s.value, "float")[0]};`);
        return;
      case "if":
        lines.push(`${ind}if (${ex(s.test, "bool")[0]}) {`);
        ifRest(s, ind);
        return;
      case "for": {
        const c = out(s.counter);
        const head = target === "wgsl" ? `var ${c}: i32` : `int ${c}`;
        lines.push(
          `${ind}for (${head} = ${s.lo}; ${c} ${s.inclusive ? "<=" : "<"} ${s.hi + (s.inclusive ? 0 : 1)}; ${c}++) {`
        );
        stmts(s.body, `${ind}  `);
        lines.push(`${ind}}`);
        return;
      }
      case "return":
        lines.push(`${ind}return ${ex(s.value, "float")[0]};`);
        return;
      case "break":
      case "continue":
        lines.push(`${ind}${s.k};`);
        return;
      case "block":
        lines.push(`${ind}{`);
        stmts(s.body, `${ind}  `);
        lines.push(`${ind}}`);
        return;
    }
  };

  const name = kernel ? (target === "c" ? `kfield_${kind}` : "kfield") : helper(fn.name);
  const param = (p: Param) => fn.outs.get(p.name)!;
  const list = params.map(p => (target === "wgsl" ? `${param(p)}: f32` : `${float} ${param(p)}`));
  if (kernel && target === "c")
    list.push(`const double *${param(fn.params[2])}`, `const double *${param(fn.params[3])}`);
  if (target === "glsl") lines.push(`float ${name}(${list.join(", ")}) {`);
  else if (target === "wgsl") lines.push(`fn ${name}(${list.join(", ")}) -> f32 {`);
  else lines.push(`static double ${name}(${list.join(", ")}) {`);
  for (const [from, copy] of copies) lines.push(`  var ${copy}: f32 = ${fn.outs.get(from)};`);
  stmts(fn.body, "  ");
  lines.push("}");
  return lines.join("\n");
}

/** A kernel in GLSL ES 3.00, WGSL and C, and its cost, from its effect's file; throws, naming the line, at the first
    thing outside the kernel subset. */
export function compileKernel(source: string, options: KernelOptions): CompiledKernel {
  const fail: Fail = (pos, message) => {
    const before = source.slice(0, pos);
    const line = before.split("\n").length;
    const column = pos - before.lastIndexOf("\n");
    throw new Error(`${options.file ?? options.name}:${line}:${column}: ${message}`);
  };
  const prog = program(source, options, fail);
  const kernel = prog.fns.get(options.name)!;
  const costs = new Map<string, number>();
  for (const fn of prog.order) costs.set(fn.name, costOf(fn, costs));
  const emit = (target: Target) =>
    prog.order.map(fn => emitFn(fn, fn === kernel, target, prog)).join("\n\n");
  const vectors = (n: number) => Math.ceil(n / 4);
  const lists = Object.entries(options.uniforms);
  const glsl = [
    ...lists.map(([list, n]) => `uniform vec4 uK_${list}[${vectors(n)}];`),
    `uniform vec4 uKF[${vectors(options.tracks)}];`,
    "",
    emit("glsl")
  ].join("\n");
  const wgsl = [
    "struct KitKernel {",
    ...lists.map(([list, n]) => `  ${list}: array<vec4f, ${vectors(n)}>,`),
    `  f: array<vec4f, ${vectors(options.tracks)}>,`,
    "}",
    "",
    emit("wgsl")
  ].join("\n");
  return { glsl, wgsl, c: emit("c"), cost: costs.get(kernel.name)! };
}
