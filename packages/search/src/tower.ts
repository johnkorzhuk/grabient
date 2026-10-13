/* The search model in plain arithmetic, so a Worker, Node and the training code compute the same numbers (within 2e-5 of
   test/fixtures/model-check.json). Two sides meet in one space of `d` dimensions:
     palette side  features -> Linear -> GELU -> Linear -> unit vector
     text side     an embedding minus its training mean -> Linear -> unit vector
   A model file is one JSON header line, then little-endian float32: W0 (hid x din), b0, W1 (d x hid), b1, Wt (d x demb),
   bt, mu (demb). train/export.py writes it. */

export interface Tower {
  din: number;
  hid: number;
  d: number;
  demb: number;
  /** the Workers AI model the text side was trained on */
  embedder: string;
  /** changes whenever the palette side does: vectors of two versions never share a snapshot */
  version: string;
  W0: Float32Array;
  b0: Float32Array;
  W1: Float32Array;
  b1: Float32Array;
  Wt: Float32Array;
  bt: Float32Array;
  mu: Float32Array;
}

type Head = Pick<Tower, "din" | "hid" | "d" | "demb" | "embedder" | "version">;

export function loadTower(bytes: ArrayBuffer | Uint8Array): Tower {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const nl = u8.indexOf(10);
  if (nl < 0) throw new Error("Not a search model file");
  // The header is ASCII, so it needs no decoder and the package stays free of DOM and Node types.
  const head = JSON.parse(String.fromCharCode(...u8.subarray(0, nl))) as Head;
  // A copy puts the floats on a 4-byte boundary. Uint8Array's own slice: a Node Buffer's slice is a view of a shared pool.
  const body: Uint8Array = Uint8Array.prototype.slice.call(u8, nl + 1);
  const f = new Float32Array(body.buffer, body.byteOffset, body.byteLength >> 2);
  const { din, hid, d, demb } = head;
  if (f.length !== hid * din + hid + d * hid + d + d * demb + d + demb) {
    throw new Error("Search model file has the wrong size");
  }
  let at = 0;
  const take = (n: number) => {
    const part = f.subarray(at, at + n);
    at += n;
    return part;
  };
  return {
    ...head,
    W0: take(hid * din),
    b0: take(hid),
    W1: take(d * hid),
    b1: take(d),
    Wt: take(d * demb),
    bt: take(d),
    mu: take(demb)
  };
}

// Abramowitz and Stegun 7.1.26, within 1.5e-7 of erf: the exact GELU the model was trained with.
function erf(x: number): number {
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return Math.sign(x) * (1 - poly * Math.exp(-a * a));
}
const gelu = (x: number) => 0.5 * x * (1 + erf(x / Math.SQRT2));

function unit(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

/** Palette features (features.ts) to the palette's vector. */
export function paletteSide(m: Tower, features: ArrayLike<number>): Float32Array {
  if (features.length !== m.din) throw new Error(`Expected ${m.din} palette features`);
  const h = new Float32Array(m.hid);
  const z = new Float32Array(m.d);
  for (let i = 0; i < m.hid; i++) {
    let s = m.b0[i];
    const row = i * m.din;
    for (let j = 0; j < m.din; j++) s += m.W0[row + j] * features[j];
    h[i] = gelu(s);
  }
  for (let i = 0; i < m.d; i++) {
    let s = m.b1[i];
    const row = i * m.hid;
    for (let j = 0; j < m.hid; j++) s += m.W1[row + j] * h[j];
    z[i] = s;
  }
  return unit(z);
}

/** A text embedding from the model's embedder to the query's vector. */
export function textSide(m: Tower, embedding: ArrayLike<number>): Float32Array {
  if (embedding.length !== m.demb) throw new Error(`Expected a ${m.demb}-dimension embedding`);
  const z = new Float32Array(m.d);
  for (let i = 0; i < m.d; i++) {
    let s = m.bt[i];
    const row = i * m.demb;
    for (let j = 0; j < m.demb; j++) s += m.Wt[row + j] * (embedding[j] - m.mu[j]);
    z[i] = s;
  }
  return unit(z);
}
