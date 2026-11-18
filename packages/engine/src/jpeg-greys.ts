/* A picture of greys as a JPEG: baseline, one component, the standard's own Huffman tables (ITU T.81 Annex K), which
   every browser and resvg read. The aurora's still carries its light so (aurora-svg.ts): a sample of light costs a
   bit of it, where a gradient's stop in an SVG costs some 47 bytes. Whole numbers and doubles alone, each rounded the
   same way everywhere, so one picture is the same bytes in the Worker, in a page and under Node. */

/** How a block's 64 numbers are ordered, the slowest changes first. */
const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20,
  13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52,
  45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63
];
/** How finely each of a block's 64 numbers is kept at quality 50: the standard's table for brightness. */
const STEPS = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113,
  92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99
];
/* the standard's Huffman tables for brightness: how many codes of each length 1 to 16, then their values in order */
const DC_COUNTS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_COUNTS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125];
const AC_VALUES = (
  "01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a" +
  "434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9" +
  "aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9fa"
)
  .match(/../g)
  ?.map(byte => Number.parseInt(byte, 16)) as number[];

/* a table's codes by value: the code's bits and how many */
function codes(counts: readonly number[], values: readonly number[]): [Uint16Array, Uint8Array] {
  const bits = new Uint16Array(256);
  const lengths = new Uint8Array(256);
  let code = 0;
  let next = 0;
  for (let length = 1; length <= 16; length++) {
    for (let i = 0; i < counts[length - 1]; i++) {
      bits[values[next]] = code++;
      lengths[values[next++]] = length;
    }
    code <<= 1;
  }
  return [bits, lengths];
}
const [DC_BITS, DC_LENGTHS] = codes(DC_COUNTS, DC_VALUES);
const [AC_BITS, AC_LENGTHS] = codes(AC_COUNTS, AC_VALUES);

/* the cosines a block is changed by, C[u * 8 + x] = c(u) / 2 * cos((2x + 1) u pi / 16), to seventeen places: written
   out, since no two engines need agree on the last bit of a cosine they work out */
const COSINES = [
  0.35355339059327373, 0.35355339059327373, 0.35355339059327373, 0.35355339059327373,
  0.35355339059327373, 0.35355339059327373, 0.35355339059327373, 0.35355339059327373,
  0.4903926402016152, 0.4157348061512726, 0.2777851165098011, 0.09754516100806417,
  -0.09754516100806417, -0.2777851165098011, -0.4157348061512726, -0.4903926402016152,
  0.46193976625564337, 0.19134171618254492, -0.19134171618254492, -0.46193976625564337,
  -0.46193976625564337, -0.19134171618254492, 0.19134171618254492, 0.46193976625564337,
  0.4157348061512726, -0.09754516100806417, -0.4903926402016152, -0.2777851165098011,
  0.2777851165098011, 0.4903926402016152, 0.09754516100806417, -0.4157348061512726,
  0.35355339059327373, -0.35355339059327373, -0.35355339059327373, 0.35355339059327373,
  0.35355339059327373, -0.35355339059327373, -0.35355339059327373, 0.35355339059327373,
  0.2777851165098011, -0.4903926402016152, 0.09754516100806417, 0.4157348061512726,
  -0.4157348061512726, -0.09754516100806417, 0.4903926402016152, -0.2777851165098011,
  0.19134171618254492, -0.46193976625564337, 0.46193976625564337, -0.19134171618254492,
  -0.19134171618254492, 0.46193976625564337, -0.46193976625564337, 0.19134171618254492,
  0.09754516100806417, -0.2777851165098011, 0.4157348061512726, -0.4903926402016152,
  0.4903926402016152, -0.4157348061512726, 0.2777851165098011, -0.09754516100806417
];

/** The JPEG of `greys` (a byte a pixel, `width` by `height`, rows from the top) at a `quality` of 1 to 100, as the
    standard scales its table, a few rows of blocks a step (each well under a millisecond). */
export function* jpegOfGreysSteps(
  greys: Uint8Array,
  width: number,
  height: number,
  quality: number
): Generator<void, Uint8Array> {
  const scale = quality < 50 ? 5000 / quality : 200 - 2 * quality;
  const steps = STEPS.map(step =>
    Math.min(255, Math.max(1, Math.floor((step * scale + 50) / 100)))
  );
  const out: number[] = [];
  const word = (v: number) => out.push(v >> 8, v & 255);
  const part = (marker: number, bytes: readonly number[]) => {
    out.push(255, marker);
    word(bytes.length + 2);
    for (const byte of bytes) out.push(byte);
  };
  out.push(255, 0xd8);
  part(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  part(0xdb, [0, ...ZIGZAG.map(at => steps[at])]);
  part(0xc0, [8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0]);
  part(0xc4, [0, ...DC_COUNTS, ...DC_VALUES]);
  part(0xc4, [0x10, ...AC_COUNTS, ...AC_VALUES]);
  part(0xda, [1, 1, 0, 0, 63, 0]);
  /* the bits, the most significant first; a byte of all ones is followed by one of none */
  let held = 0;
  let count = 0;
  const put = (bits: number, length: number) => {
    held = (held << length) | bits;
    count += length;
    while (count >= 8) {
      const byte = (held >> (count - 8)) & 255;
      out.push(byte);
      if (byte === 255) out.push(0);
      count -= 8;
    }
    held &= (1 << count) - 1;
  };
  /* a number as the standard writes it: how many bits it takes, then those bits, a negative one's turned over */
  const size = (v: number) => {
    let n = 0;
    for (let a = v < 0 ? -v : v; a; a >>= 1) n++;
    return n;
  };
  const rest = (v: number, n: number) => put(v < 0 ? v + (1 << n) - 1 : v, n);
  const block = new Float64Array(64);
  const half = new Float64Array(64);
  const kept = new Int32Array(64);
  let before = 0;
  for (let by = 0; by < height; by += 8) {
    for (let bx = 0; bx < width; bx += 8) {
      /* the block, its last pixels repeated past the picture's edges, about zero */
      for (let y = 0; y < 8; y++) {
        const row = Math.min(height - 1, by + y) * width;
        for (let x = 0; x < 8; x++)
          block[y * 8 + x] = greys[row + Math.min(width - 1, bx + x)] - 128;
      }
      /* its cosine transform: along the rows, then down the columns */
      for (let y = 0; y < 8; y++)
        for (let u = 0; u < 8; u++) {
          let sum = 0;
          for (let x = 0; x < 8; x++) sum += COSINES[u * 8 + x] * block[y * 8 + x];
          half[y * 8 + u] = sum;
        }
      for (let u = 0; u < 8; u++)
        for (let v = 0; v < 8; v++) {
          let sum = 0;
          for (let y = 0; y < 8; y++) sum += COSINES[v * 8 + y] * half[y * 8 + u];
          const q = sum / steps[v * 8 + u];
          kept[v * 8 + u] = q < 0 ? -Math.floor(-q + 0.5) : Math.floor(q + 0.5);
        }
      /* the first number as its change from the block before, then the rest as runs of nothing and a number */
      const first = kept[0] - before;
      before = kept[0];
      const n = size(first);
      put(DC_BITS[n], DC_LENGTHS[n]);
      if (n) rest(first, n);
      let run = 0;
      for (let i = 1; i < 64; i++) {
        const v = kept[ZIGZAG[i]];
        if (!v) {
          run++;
          continue;
        }
        for (; run > 15; run -= 16) put(AC_BITS[0xf0], AC_LENGTHS[0xf0]);
        const m = size(v);
        put(AC_BITS[(run << 4) | m], AC_LENGTHS[(run << 4) | m]);
        rest(v, m);
        run = 0;
      }
      if (run) put(AC_BITS[0], AC_LENGTHS[0]);
    }
    if (by % 32 === 24) yield;
  }
  if (count) put((1 << (8 - count)) - 1, 8 - count);
  out.push(255, 0xd9);
  return Uint8Array.from(out);
}

/** The JPEG of greys, at once. */
export function jpegOfGreys(
  greys: Uint8Array,
  width: number,
  height: number,
  quality: number
): Uint8Array {
  const steps = jpegOfGreysSteps(greys, width, height, quality);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

const SIXTY_FOUR = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** Bytes in base64, as a data address carries them. */
export function base64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    out +=
      SIXTY_FOUR[a >> 2] +
      SIXTY_FOUR[((a & 3) << 4) | (b >> 4)] +
      (i + 1 < bytes.length ? SIXTY_FOUR[((b & 15) << 2) | (c >> 6)] : "=") +
      (i + 2 < bytes.length ? SIXTY_FOUR[c & 63] : "=");
  }
  return out;
}
