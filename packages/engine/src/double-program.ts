/* A straight-line program of double operations that a shader runs (glsl-double.ts) and JavaScript runs alike: written
   once as expressions (DoubleProgram), it becomes a list of instructions over registers, each one operation rounded as
   JavaScript rounds it, which a GLSL loop runs with one call of each operation (DOUBLE_RUN), so the shader stays
   small enough to compile in seconds anywhere, and which `evaluate` runs in JavaScript to the same bits. Sections are
   ranges a shader runs alone: a value one section leaves for another is pinned to its own register. */

/** The operations, by their codes. */
export const OP = {
  add: 0,
  sub: 1,
  trunc: 2,
  floor: 3,
  ceil: 4,
  mul: 5,
  div: 6,
  min: 7,
  max: 8,
  /** 1 where a < b, else 0 */
  lt: 9,
  /** the target's own value chooses: a where it is not 0, else b */
  choose: 10,
  /** rounded to the nearest float, as a Float32Array keeps it */
  f32: 11,
  /** a times 2 to the whole number b */
  scale2: 12,
  /** the float square root of a, a start for Newton's */
  sqrt0: 13,
  /** a times 10 to the b, rounded half up as toFixed rounds it */
  decimal: 15
} as const;
type OpName = keyof typeof OP;

/** A value a program computes, or a constant, or an input a shader writes before it runs. */
export class Value {
  readonly id: number;
  readonly kind: "constant" | "input" | "op";
  readonly name?: string;
  constructor(id: number, kind: "constant" | "input" | "op", name?: string) {
    this.id = id;
    this.kind = kind;
    this.name = name;
  }
}

interface Step {
  op: OpName;
  out: Value;
  a: Value;
  b: Value;
  /** the target's value read as `choose`'s condition */
  into?: Value;
}

export class DoubleProgram {
  private values = 0;
  readonly constants = new Map<string, Value>();
  readonly constantValues = new Map<Value, number>();
  readonly inputs = new Map<string, Value>();
  readonly steps: Step[] = [];
  /** values a shader reads or a later section uses: each pinned to a register of its own */
  readonly pinned = new Map<string, Value>();
  readonly sections: { name: string; from: number; to: number }[] = [];
  private zero = this.constant(0);

  constant(x: number): Value {
    const key = Object.is(x, -0) ? "-0" : String(x);
    let v = this.constants.get(key);
    if (!v) {
      v = new Value(this.values++, "constant");
      this.constants.set(key, v);
      this.constantValues.set(v, x);
    }
    return v;
  }
  input(name: string): Value {
    let v = this.inputs.get(name);
    if (!v) {
      v = new Value(this.values++, "input", name);
      this.inputs.set(name, v);
    }
    return v;
  }
  private step(op: OpName, a: Value, b: Value = this.zero): Value {
    const out = new Value(this.values++, "op");
    this.steps.push({ op, out, a, b });
    return out;
  }
  /** a value kept in a register of its own under `name`, for a shader to read or a later section to use */
  pin(name: string, v: Value): Value {
    const out = new Value(this.values++, "op", name);
    this.steps.push({ op: "add", out, a: v, b: this.constant(-0) });
    this.pinned.set(name, out);
    return out;
  }
  /** a slot a shader fills before a later section runs alone (a value an earlier section pins under the same name) */
  slot(name: string): Value {
    return this.input(name);
  }
  section(name: string, body: () => void): void {
    const from = this.steps.length;
    body();
    this.sections.push({ name, from, to: this.steps.length });
  }
  add = (a: Value, b: Value) => this.step("add", a, b);
  sub = (a: Value, b: Value) => this.step("sub", a, b);
  mul = (a: Value, b: Value) => this.step("mul", a, b);
  div = (a: Value, b: Value) => this.step("div", a, b);
  trunc = (a: Value) => this.step("trunc", a);
  floor = (a: Value) => this.step("floor", a);
  ceil = (a: Value) => this.step("ceil", a);
  min = (a: Value, b: Value) => this.step("min", a, b);
  max = (a: Value, b: Value) => this.step("max", a, b);
  lt = (a: Value, b: Value) => this.step("lt", a, b);
  f32 = (a: Value) => this.step("f32", a);
  scale2 = (a: Value, k: Value) => this.step("scale2", a, k);
  sqrt0 = (a: Value) => this.step("sqrt0", a);
  decimal = (a: Value, digits: number) => this.step("decimal", a, this.constant(digits));
  /** `yes` where `condition` is not 0, else `no` */
  choose(condition: Value, yes: Value, no: Value): Value {
    const out = new Value(this.values++, "op");
    this.steps.push({ op: "choose", out, a: yes, b: no, into: condition });
    return out;
  }
  c = (x: number) => this.constant(x);
}

/** The program as a shader runs it: registers for the constants first, then the inputs, then the pinned values, then
    the others, each reused once its value is read for the last time; and its instructions, five bits of operation and
    nine of each register (target, a, b). A `choose` first moves its condition into its target. */
export interface Compiled {
  registers: number;
  pool: number[];
  inputs: Map<string, number>;
  pinned: Map<string, number>;
  code: number[];
  sections: Map<string, { from: number; to: number }>;
}

export function compile(p: DoubleProgram): Compiled {
  const reg = new Map<Value, number>();
  const pool: number[] = [];
  for (const [v, x] of p.constantValues) {
    reg.set(v, pool.length);
    pool.push(x);
  }
  let next = pool.length;
  const inputs = new Map<string, number>();
  for (const [name, v] of p.inputs) {
    reg.set(v, next);
    inputs.set(name, next++);
  }
  const pinned = new Map<string, number>();
  const kept = new Set<Value>();
  for (const [name, v] of p.pinned) {
    /* a value pinned under a slot's name is written into the slot's register, where a later section reads it */
    const at = inputs.get(name) ?? next++;
    reg.set(v, at);
    pinned.set(name, at);
    kept.add(v);
  }
  /* the steps as instructions, a choose as a move of its condition into its target and then the choice; where each
     step's instructions start */
  const flat: { op: number; out: Value; a: Value; b: Value }[] = [];
  const startOf: number[] = [];
  for (const s of p.steps) {
    startOf.push(flat.length);
    if (s.op === "choose" && s.into)
      flat.push({ op: OP.add, out: s.out, a: s.into, b: p.constant(-0) });
    flat.push({ op: OP[s.op], out: s.out, a: s.a, b: s.b });
  }
  startOf.push(flat.length);
  const sections = new Map(
    p.sections.map(s => [s.name, { from: startOf[s.from], to: startOf[s.to] }] as const)
  );
  /* each value's last read; a register is reused once its value has been read for the last time */
  const last = new Map<Value, number>();
  flat.forEach((s, i) => {
    last.set(s.a, i);
    last.set(s.b, i);
  });
  const free: number[] = [];
  const code: number[] = [];
  flat.forEach((s, i) => {
    const ra = reg.get(s.a);
    const rb = reg.get(s.b);
    if (ra === undefined || rb === undefined) throw new Error("a value read before it is made");
    for (const v of new Set([s.a, s.b]))
      if (v.kind === "op" && !kept.has(v) && last.get(v) === i && v !== s.out) {
        const r = reg.get(v);
        if (r !== undefined) free.push(r);
      }
    let ro = reg.get(s.out);
    if (ro === undefined) {
      ro = free.length ? (free.pop() as number) : next++;
      reg.set(s.out, ro);
    }
    code.push((s.op | (ro << 5) | (ra << 14) | (rb << 23)) >>> 0);
  });
  if (next > 512) throw new Error(`the program needs ${next} registers`);
  return { registers: next, pool, inputs, pinned, code, sections };
}

const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);
/** toFixed's whole number: a positive double times 10^digits, rounded half up on its exact value */
function decimalOf(x: number, digits: number): number {
  if (x === 0) return 0;
  F64[0] = x;
  const hi = U32[1];
  const lo = U32[0];
  const e = ((hi >>> 20) & 0x7ff) - 1023;
  const m = (BigInt((hi & 0xfffff) | 0x100000) << 32n) | BigInt(lo);
  const p = m * 10n ** BigInt(digits);
  const shift = BigInt(52 - e);
  return Number((p + (1n << (shift - 1n))) >> shift);
}

/** Runs instructions in JavaScript on registers, as the GLSL does: from `from` to `to`. */
export function evaluate(c: Compiled, registers: number[], from = 0, to = c.code.length): number[] {
  const R = registers;
  for (let pc = from; pc < to; pc++) {
    const ins = c.code[pc];
    const op = ins & 31;
    const d = (ins >>> 5) & 511;
    const a = R[(ins >>> 14) & 511];
    const b = R[(ins >>> 23) & 511];
    let r: number;
    switch (op) {
      case OP.add:
        r = a + b;
        break;
      case OP.sub:
        r = a - b;
        break;
      case OP.trunc:
        r = Math.trunc(a);
        break;
      case OP.floor:
        r = Math.floor(a);
        break;
      case OP.ceil:
        r = Math.ceil(a);
        break;
      case OP.mul:
        r = a * b;
        break;
      case OP.div:
        r = a / b;
        break;
      case OP.min:
        r = b < a ? b : a;
        break;
      case OP.max:
        r = a < b ? b : a;
        break;
      case OP.lt:
        r = a < b ? 1 : 0;
        break;
      case OP.choose:
        r = R[d] !== 0 ? a : b;
        break;
      case OP.f32:
        r = Math.fround(a);
        break;
      case OP.scale2:
        r = a * 2 ** b;
        break;
      case OP.sqrt0:
        r = Math.fround(Math.sqrt(Math.fround(a)));
        break;
      case OP.decimal:
        r = decimalOf(a, b);
        break;
      default:
        throw new Error(`no operation ${op}`);
    }
    R[d] = r;
  }
  return R;
}

/** The registers a program starts from: its constants, then its inputs as given (0 for any not given). */
export function registersOf(c: Compiled, inputs: Record<string, number>): number[] {
  const R = new Array<number>(c.registers).fill(0);
  c.pool.forEach((x, i) => {
    R[i] = x;
  });
  for (const [name, i] of c.inputs) R[i] = inputs[name] ?? 0;
  return R;
}

/** The GLSL that runs a compiled program: its constant pool and its instructions as globals, the registers to declare
    where it runs (a local array, so a GPU makes it only for the fragments that run it), and the loop over the
    instructions from `from` to `to`, each operation the program uses called from one place; the last two unindented. `name` prefixes the
    globals and the registers, so a shader may run two programs, each over a register file of its own size. */
export function doubleRun(c: Compiled, dlit: (x: number) => string, name = "") {
  const rows = (items: string[], per: number) => {
    const out: string[] = [];
    for (let i = 0; i < items.length; i += per) out.push(`  ${items.slice(i, i + per).join(", ")}`);
    return out.join(",\n");
  };
  const [R, POOL, CODE] = ["R", "POOL", "CODE"].map(n => `${name}${n}`);
  const globals = `// The program's constants and its instructions: an operation, a target, a and b, five and nine bits each.
const uvec2 ${POOL}[${c.pool.length}] = uvec2[](
${rows(c.pool.map(dlit), 3)}
);
const uint ${CODE}[${c.code.length}] = uint[](
${rows(
  c.code.map(i => `0x${i.toString(16).padStart(8, "0")}u`),
  8
)}
);`;
  const registers = `uvec2 ${R}[${c.registers}];
for (int n = 0; n < ${c.pool.length}; n++) ${R}[n] = ${POOL}[n];`;
  /* the operations the program uses, each tested for in turn: a range test takes what the tests before it leave */
  const used = new Set(c.code.map(i => i & 31));
  const whole = [OP.trunc, OP.floor, OP.ceil].some(op => used.has(op));
  const cases = (
    [
      [
        "op <= 4u",
        [OP.add, OP.sub, OP.trunc, OP.floor, OP.ceil],
        whole
          ? `{
    // add, sub, trunc, floor, ceil: one addition, of the integer toward zero and a step where one is due
    uvec2 t = dTrunc(a);
    bool whole = op >= 2u;
    bool step = t != a && ((op == 3u && dSign(a) == 1u) || (op == 4u && dSign(a) == 0u));
    uvec2 y = whole ? (step ? (op == 3u ? dNeg(D_ONE) : D_ONE) : uvec2(0x80000000u, 0u)) : op == 1u ? dNeg(b) : b;
    r = dAdd(whole ? t : a, y);
  }`
          : "r = dAdd(a, op == 1u ? dNeg(b) : b);"
      ],
      ["op == 5u", [OP.mul], "r = dMul(a, b);"],
      ["op == 6u", [OP.div], "r = dDiv(a, b);"],
      [
        "op <= 9u",
        [OP.min, OP.max, OP.lt],
        `{
    bool less = dLt(a, b);
    r = op == 7u ? (dLt(b, a) ? b : a) : op == 8u ? (less ? b : a) : (less ? D_ONE : D_ZERO);
  }`
      ],
      ["op == 10u", [OP.choose], `r = dZero(${R}[d]) ? b : a;`],
      ["op == 11u", [OP.f32], "r = dFromFloat(dToFloat(a));"],
      ["op == 12u", [OP.scale2], "r = uvec2(a.x + (uint(dToInt(b)) << 20), a.y);"],
      ["op == 13u", [OP.sqrt0], "r = dFromFloat(sqrt(dToFloat(a)));"],
      ["op == 15u", [OP.decimal], "r = dDecimal(a, dToInt(b));"]
    ] as const
  ).filter(([, ops]) => ops.some(op => used.has(op)));
  const dispatch = cases
    .map(([test, , body], k) =>
      cases.length === 1
        ? body
        : k === 0
          ? `if (${test}) ${body}`
          : k < cases.length - 1
            ? `else if (${test}) ${body}`
            : `else ${body}`
    )
    .join("\n  ");
  const loop = (from: string, to: string) => `for (int pc = ${from}; pc < ${to}; pc++) {
  uint ins = ${CODE}[pc];
  uint op = ins & 31u;
  int d = int((ins >> 5) & 511u);
  uvec2 a = ${R}[int((ins >> 14) & 511u)], b = ${R}[int(ins >> 23)], r;
  ${dispatch}
  ${R}[d] = r;
}`;
  return { globals, registers, loop };
}
