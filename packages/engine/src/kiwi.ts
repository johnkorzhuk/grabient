/* Kiwi (github.com/evanw/kiwi), the binary format Figma's clipboard carries its layers in: a writer, and a reader for
   the tests, of values under a schema given as definitions (figma-schema.ts), byte for byte as kiwi's own encoder
   writes them. A message writes each field it holds as its id and its value, in the definition's order, then 0; a
   struct writes every field in order, untagged; an enum writes its value's number; an array its length, then its
   items. Integers are varints (int zigzagged), 64-bit ones too (int64 zigzagged), written here from numbers within
   JavaScript's safe range, a bigint or a string; a float is its IEEE bits turned so the exponent leads, one 0 byte for
   zero, and a string is UTF-8 ended by 0. No code is generated, so no eval. */

/** A definition: its name, its kind (0 enum, 1 struct, 2 message) and its fields, an enum's as [name, value] and the
    others' as [name, type, isArray (1), id]. */
export type KiwiDef =
  | readonly [name: string, kind: 0, values: readonly (readonly [string, number])[]]
  | readonly [
      name: string,
      kind: 1 | 2,
      fields: readonly (readonly [name: string, type: string, isArray: number, id: number])[]
    ];

/* the platform's, in a browser, a Worker and Node alike; the engine's types name no platform */
declare const TextEncoder: new () => { encode(text: string): Uint8Array };
declare const TextDecoder: new () => { decode(bytes: Uint8Array): string };

type Value = unknown;
type Fields = readonly (readonly [string, string, number, number])[];

const f32 = new Float32Array(1);
const i32 = new Int32Array(f32.buffer);

/** The value as the root definition's bytes. Throws on a field or an enum value the schema lacks. */
export function encodeKiwi(defs: readonly KiwiDef[], root: string, value: Value): Uint8Array {
  const byName = new Map(defs.map(d => [d[0], d]));
  let out = new Uint8Array(4096);
  let n = 0;
  const room = (k: number) => {
    if (n + k <= out.length) return;
    const grown = new Uint8Array(Math.max(out.length * 2, n + k));
    grown.set(out);
    out = grown;
  };
  const byte = (b: number) => {
    room(1);
    out[n++] = b & 255;
  };
  const uint = (v: number) => {
    if (!(v >= 0 && v <= 0xffffffff)) throw new Error(`kiwi: ${v} is no uint`);
    do {
      const b = v & 127;
      v = Math.floor(v / 128);
      byte(v ? b | 128 : b);
    } while (v);
  };
  /* a 64-bit integer as a number, from a number, a bigint or a string, within `least` and 2^52 */
  const safe = (v: Value, least: number) => {
    const x = Number(v as number | bigint | string);
    if (!Number.isSafeInteger(x) || x < least || x > 2 ** 52)
      throw new Error(`kiwi: ${String(v)} is out of range`);
    return x;
  };
  /* a varint past 32 bits, by division */
  const varint = (v: number) => {
    let x = v;
    do {
      const b = x % 128;
      x = Math.floor(x / 128);
      byte(x ? b | 128 : b);
    } while (x);
  };
  /* a native type's bytes; false for a definition's name */
  const native = (type: string, v: Value): boolean => {
    switch (type) {
      case "bool":
        byte(v ? 1 : 0);
        break;
      case "byte":
        byte(v as number);
        break;
      case "int":
        uint((((v as number) << 1) ^ ((v as number) >> 31)) >>> 0);
        break;
      case "uint":
        uint(v as number);
        break;
      case "uint64":
        varint(safe(v, 0));
        break;
      case "int64": {
        const x = safe(v, -(2 ** 52));
        varint(x < 0 ? -2 * x - 1 : 2 * x);
        break;
      }
      case "float": {
        f32[0] = v as number;
        const bits = (i32[0] >>> 23) | (i32[0] << 9);
        if ((bits & 255) === 0) byte(0);
        else {
          room(4);
          out[n++] = bits & 255;
          out[n++] = (bits >> 8) & 255;
          out[n++] = (bits >> 16) & 255;
          out[n++] = (bits >>> 24) & 255;
        }
        break;
      }
      case "string": {
        const bytes = new TextEncoder().encode(v as string);
        if (bytes.includes(0)) throw new Error("kiwi: a string can't hold a null");
        room(bytes.length + 1);
        out.set(bytes, n);
        n += bytes.length;
        byte(0);
        break;
      }
      default:
        return false;
    }
    return true;
  };
  const put = (type: string, v: Value): void => {
    if (native(type, v)) return;
    const def = byName.get(type);
    if (!def) throw new Error(`kiwi: no type ${type}`);
    if (def[1] === 0) {
      const found = def[2].find(e => e[0] === v);
      if (!found) throw new Error(`kiwi: ${type} has no ${String(v)}`);
      uint(found[1]);
      return;
    }
    const fields = def[2] as Fields;
    const record = v as Record<string, Value>;
    if (def[1] === 2)
      for (const key of Object.keys(record))
        if (record[key] != null && !fields.some(f => f[0] === key))
          throw new Error(`kiwi: ${type} has no field ${key}`);
    for (const [name, fieldType, isArray, id] of fields) {
      const x = record[name];
      if (x == null) {
        if (def[1] === 1) throw new Error(`kiwi: ${type}.${name} is required`);
        continue;
      }
      if (def[1] === 2) uint(id);
      if (isArray) {
        const items = x as readonly Value[];
        uint(items.length);
        for (const item of items) put(fieldType, item);
      } else put(fieldType, x);
    }
    if (def[1] === 2) uint(0);
  };
  put(root, value);
  return out.slice(0, n);
}

/** The value the root definition's bytes hold: kiwi's own reading, for tests and tools. */
export function decodeKiwi(defs: readonly KiwiDef[], root: string, bytes: Uint8Array): Value {
  const byName = new Map(defs.map(d => [d[0], d]));
  let at = 0;
  const byte = () => {
    if (at >= bytes.length) throw new Error("kiwi: past the end");
    return bytes[at++];
  };
  const uint = () => {
    let v = 0;
    let shift = 1;
    for (;;) {
      const b = byte();
      v += (b & 127) * shift;
      shift *= 128;
      if (!(b & 128)) return v;
    }
  };
  const get = (type: string): Value => {
    switch (type) {
      case "bool":
        return byte() !== 0;
      case "byte":
        return byte();
      case "int": {
        const v = uint();
        return v & 1 ? ~(v >>> 1) : v >>> 1;
      }
      case "uint":
      case "uint64":
        return uint();
      case "int64": {
        const v = uint();
        return v % 2 ? -(v + 1) / 2 : v / 2;
      }
      case "float": {
        const first = byte();
        if (first === 0) return 0;
        const bits = first | (byte() << 8) | (byte() << 16) | (byte() << 24);
        i32[0] = (bits << 23) | (bits >>> 9);
        return f32[0];
      }
      case "string": {
        const start = at;
        while (byte() !== 0);
        return new TextDecoder().decode(bytes.subarray(start, at - 1));
      }
    }
    const def = byName.get(type);
    if (!def) throw new Error(`kiwi: no type ${type}`);
    if (def[1] === 0) {
      const v = uint();
      return def[2].find(e => e[1] === v)?.[0] ?? v;
    }
    const fields = def[2] as Fields;
    const record: Record<string, Value> = {};
    const read = (fieldType: string, isArray: number) => {
      if (!isArray) return get(fieldType);
      const items: Value[] = [];
      for (let k = uint(); k > 0; k--) items.push(get(fieldType));
      return items;
    };
    if (def[1] === 1) {
      for (const [name, fieldType, isArray] of fields) record[name] = read(fieldType, isArray);
      return record;
    }
    for (;;) {
      const id = uint();
      if (id === 0) return record;
      const field = fields.find(f => f[3] === id);
      if (!field) throw new Error(`kiwi: ${type} has no field ${id}`);
      record[field[0]] = read(field[1], field[2]);
    }
  };
  return get(root);
}
