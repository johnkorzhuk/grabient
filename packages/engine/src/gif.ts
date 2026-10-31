/* An animated GIF (GIF89a) of frames drawn one after another: one color table for every frame, a loop forever, and
   each frame's delay in hundredths of a second. The table is cut from frames sampled across the loop (median cut, then
   a few rounds of moving each color to the middle of the pixels it stands for), and a pixel takes its nearest color
   through a lookup of six bits a channel, filled as colors are met. A GIF has no partial transparency: a pixel of four
   channels is drawn where its alpha passes a threshold of its own that stays put from frame to frame, so a soft edge
   is drawn as a spray of whole pixels and holds still while the edge moves. Opaque frames after the first are written
   as what changed: the box the changes fall in, the pixels in it that did not change left transparent, so the frame
   before shows through them, and a pixel whose color drifted less than `tolerance` from the one it shows keeps it.
   Frames with transparency are drawn whole on a cleared screen, the box their pixels fall in. */

export interface GifSource {
  width: number;
  height: number;
  /** 3 for RGB, 4 for RGBA */
  channels: 3 | 4;
  frames: number;
  /** Frame i's pixels, row after row. */
  frame: (i: number) => Uint8Array;
  /** Frame i's delay in hundredths of a second. */
  delay: (i: number) => number;
}

export interface GifOptions {
  /** Colors in the table, at most 255: one index is left for transparency. */
  colors?: number;
  /** How far an opaque pixel's color may drift from the color it showed in the frame before and keep it, squared and
      weighted as the table's colors are compared (2 red, 4 green, 3 blue): 0 changes every pixel that changed. */
  tolerance?: number;
  /** An ordered dither's reach in levels of a channel, against bands where the frames are smooth: 0 for none. */
  dither?: number;
  /** Awaited after each frame, so long work can let other work run. */
  pause?: () => Promise<void>;
}

/** Hundredths of a second for each of `frames` frames in `seconds`, rounded so they add up to the whole. */
export function gifDelays(frames: number, seconds: number): number[] {
  const at = (i: number) => Math.round((100 * seconds * i) / frames);
  return Array.from({ length: frames }, (_, i) => at(i + 1) - at(i));
}

/** Frames sampled for the color table. */
const SAMPLES = 6;
/** Rounds of moving each color to the middle of its pixels. */
const ROUNDS = 3;
/** How the eye weighs a difference in red, green and blue. */
const [WR, WG, WB] = [2, 4, 3];
/** A 4 by 4 Bayer matrix, from -0.5 to 0.5. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);

class Bytes {
  data = new Uint8Array(1 << 16);
  length = 0;
  room(n: number) {
    if (this.length + n <= this.data.length) return;
    let size = this.data.length * 2;
    while (size < this.length + n) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.data.subarray(0, this.length));
    this.data = grown;
  }
  byte(v: number) {
    this.room(1);
    this.data[this.length++] = v;
  }
  short(v: number) {
    this.byte(v & 255);
    this.byte((v >>> 8) & 255);
  }
  text(s: string) {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }
  result(): Uint8Array<ArrayBuffer> {
    return this.data.slice(0, this.length);
  }
}

/* The color table. */

/** A box of bins' spread along its widest channel, weighted as the eye weighs them, and that channel. */
function widest(bins: Int32Array, keys: Int32Array): { axis: number; range: number } {
  let r0 = 31;
  let r1 = 0;
  let g0 = 31;
  let g1 = 0;
  let b0 = 31;
  let b1 = 0;
  for (const bin of bins) {
    const k = keys[bin];
    const r = k >>> 10;
    const g = (k >>> 5) & 31;
    const b = k & 31;
    if (r < r0) r0 = r;
    if (r > r1) r1 = r;
    if (g < g0) g0 = g;
    if (g > g1) g1 = g;
    if (b < b0) b0 = b;
    if (b > b1) b1 = b;
  }
  const spans = [(r1 - r0) * Math.sqrt(WR), (g1 - g0) * Math.sqrt(WG), (b1 - b0) * Math.sqrt(WB)];
  const axis = spans.indexOf(Math.max(...spans));
  return { axis, range: spans[axis] };
}

interface Box {
  bins: Int32Array;
  count: number;
}

/** Up to `most` colors, as [r, g, b], for the pixels `take` counts. */
function tableOf(take: (count: (r: number, g: number, b: number) => void) => void, most: number) {
  /* the pixels counted in bins of five bits a channel, with each bin's sum to find its middle */
  const counts = new Int32Array(1 << 15);
  const sums = new Float64Array(3 << 15);
  take((r, g, b) => {
    const key = ((r >>> 3) << 10) | ((g >>> 3) << 5) | (b >>> 3);
    counts[key]++;
    sums[3 * key] += r;
    sums[3 * key + 1] += g;
    sums[3 * key + 2] += b;
  });
  const used: number[] = [];
  for (let k = 0; k < counts.length; k++) if (counts[k]) used.push(k);
  if (!used.length) return [[0, 0, 0]];
  const keys = Int32Array.from(used);
  /* median cut: the box whose pixels times spread is most is cut at its median along its widest channel */
  const score = (box: Box) =>
    box.bins.length < 2 ? 0 : box.count * (widest(box.bins, keys).range + 1);
  let boxes: Box[] = [
    { bins: Int32Array.from(keys.keys()), count: used.reduce((n, k) => n + counts[k], 0) }
  ];
  const scores = [score(boxes[0])];
  while (boxes.length < most) {
    let best = -1;
    let top = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (scores[i] > top) {
        top = scores[i];
        best = i;
      }
    }
    if (best < 0) break;
    const box = boxes[best];
    const shift = [10, 5, 0][widest(box.bins, keys).axis];
    const sorted = Array.from(box.bins).sort(
      (a, b) => ((keys[a] >>> shift) & 31) - ((keys[b] >>> shift) & 31)
    );
    let half = counts[keys[sorted[0]]];
    let at = 1;
    while (at < sorted.length - 1 && half + counts[keys[sorted[at]]] <= box.count / 2) {
      half += counts[keys[sorted[at]]];
      at++;
    }
    const low = { bins: Int32Array.from(sorted.slice(0, at)), count: half };
    const high = { bins: Int32Array.from(sorted.slice(at)), count: box.count - half };
    boxes = [...boxes.slice(0, best), low, high, ...boxes.slice(best + 1)];
    scores.splice(best, 1, score(low), score(high));
  }
  /* each box's color the middle of its pixels, then each color moved to the middle of the bins nearest it */
  let colors = boxes.map(box => {
    let n = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (const bin of box.bins) {
      const k = keys[bin];
      n += counts[k];
      r += sums[3 * k];
      g += sums[3 * k + 1];
      b += sums[3 * k + 2];
    }
    return [r / n, g / n, b / n];
  });
  for (let round = 0; round < ROUNDS; round++) {
    const next = colors.map(() => [0, 0, 0, 0]);
    for (const k of keys) {
      const n = counts[k];
      const r = sums[3 * k] / n;
      const g = sums[3 * k + 1] / n;
      const b = sums[3 * k + 2] / n;
      let near = 0;
      let least = Infinity;
      for (let i = 0; i < colors.length; i++) {
        const c = colors[i];
        const d = WR * (c[0] - r) ** 2 + WG * (c[1] - g) ** 2 + WB * (c[2] - b) ** 2;
        if (d < least) {
          least = d;
          near = i;
        }
      }
      const to = next[near];
      to[0] += sums[3 * k];
      to[1] += sums[3 * k + 1];
      to[2] += sums[3 * k + 2];
      to[3] += n;
    }
    colors = next.map((c, i) => (c[3] ? [c[0] / c[3], c[1] / c[3], c[2] / c[3]] : colors[i]));
  }
  return colors.map(c => c.map(v => Math.min(255, Math.max(0, Math.round(v)))));
}

/* LZW, as the GIF's image data: codes of growing width packed low bit first into blocks of up to 255 bytes. The codes
   met so far are found by hashing the code before and the next index, a table small enough to stay in the cache. */

const HASH_BITS = 13;
const MASK = (1 << HASH_BITS) - 1;
const slotKeys = new Int32Array(1 << HASH_BITS);
const slotCodes = new Int16Array(1 << HASH_BITS);

/** The indices of a box of `width` by `height` from `start`, rows `stride` apart. */
function lzw(
  indices: Uint8Array,
  start: number,
  width: number,
  height: number,
  stride: number,
  least: number,
  out: Bytes
) {
  const length = width * height;
  const clear = 1 << least;
  const end = clear + 1;
  let next = end + 1;
  let size = least + 1;
  const keys = slotKeys;
  const codes = slotCodes;
  keys.fill(-1);
  /* at most a code and a half a pixel, a block's length byte in every 255 and the clears */
  out.room(Math.ceil(length * 1.6) + 1024);
  const data = out.data;
  data[out.length++] = least;
  let block = out.length;
  let at = block + 1;
  let bits = clear;
  let held = size;
  let code = indices[start];
  let p = start;
  let rowEnd = start + width;
  for (let i = 1; i < length; i++) {
    p++;
    if (p === rowEnd) {
      p += stride - width;
      rowEnd += stride;
    }
    const k = indices[p];
    const key = (code << 8) | k;
    let h = Math.imul(key, 0x9e3779b1) >>> (32 - HASH_BITS);
    let found = -1;
    for (;;) {
      const s = keys[h];
      if (s === key) {
        found = codes[h];
        break;
      }
      if (s === -1) break;
      h = (h + 1) & MASK;
    }
    if (found >= 0) {
      code = found;
      continue;
    }
    bits |= code << held;
    held += size;
    while (held >= 8) {
      data[at++] = bits & 255;
      bits >>>= 8;
      held -= 8;
      if (at === block + 256) {
        data[block] = 255;
        block = at++;
      }
    }
    if (next === 4096) {
      /* the table is full: a clear, and codes start again */
      bits |= clear << held;
      held += size;
      while (held >= 8) {
        data[at++] = bits & 255;
        bits >>>= 8;
        held -= 8;
        if (at === block + 256) {
          data[block] = 255;
          block = at++;
        }
      }
      next = end + 1;
      size = least + 1;
      keys.fill(-1);
    } else {
      if (next >= 1 << size) size++;
      keys[h] = key;
      codes[h] = next++;
    }
    code = k;
  }
  for (const last of [code, end]) {
    bits |= last << held;
    held += size;
    while (held >= 8) {
      data[at++] = bits & 255;
      bits >>>= 8;
      held -= 8;
      if (at === block + 256) {
        data[block] = 255;
        block = at++;
      }
    }
  }
  if (held > 0) {
    data[at++] = bits & 255;
    if (at === block + 256) {
      data[block] = 255;
      block = at++;
    }
  }
  /* the last block's length, then an empty block to end the data */
  const rest = at - block - 1;
  if (rest > 0) {
    data[block] = rest;
    data[at++] = 0;
  } else data[block] = 0;
  out.length = at;
}

/** Frame pixels to indices: `now` takes each pixel's index, `ink` (opaque frames) what the frame writes, nothing where
    a pixel did not change, and `box` the rows and columns the written pixels fall in, top, bottom, left, right, or -1
    where there are none. A function of its own, so its loops keep their arrays at hand. */
function indexFrame(
  pixels: Uint8Array,
  W: number,
  H: number,
  channels: number,
  frame: { now: Uint8Array; before: Uint8Array; ink: Uint8Array; whole: boolean; keep: boolean },
  look: {
    threshold: Uint8Array;
    shift: Int8Array;
    dither: number;
    tolerance: number;
    flat: Int32Array;
    lookup: Int16Array;
    nearest: (key: number) => number;
    none: number;
  },
  box: Int32Array
) {
  const { now, before, ink, whole, keep } = frame;
  const { threshold, shift, dither, tolerance, flat, lookup, nearest, none } = look;
  const alpha = channels === 4;
  let top = -1;
  let bottom = -1;
  let left = W;
  let right = -1;
  for (let y = 0, p = 0, o = 0; y < H; y++) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < W; x++, p++, o += channels) {
      let index = none;
      if (!alpha || pixels[o + 3] > threshold[p]) {
        let r = pixels[o];
        let g = pixels[o + 1];
        let b = pixels[o + 2];
        let drift = Infinity;
        if (keep) {
          const c = 3 * before[p];
          const dr = flat[c] - r;
          const dg = flat[c + 1] - g;
          const db = flat[c + 2] - b;
          drift = WR * dr * dr + WG * dg * dg + WB * db * db;
        }
        if (drift <= tolerance) index = before[p];
        else {
          if (dither) {
            const s = shift[p];
            r = Math.min(255, Math.max(0, r + s));
            g = Math.min(255, Math.max(0, g + s));
            b = Math.min(255, Math.max(0, b + s));
          }
          const key = ((r >>> 2) << 12) | ((g >>> 2) << 6) | (b >>> 2);
          const kept = lookup[key];
          index = kept >= 0 ? kept : nearest(key);
        }
      }
      now[p] = index;
      if (alpha) {
        if (index === none) continue;
      } else if (!whole && index === before[p]) {
        ink[p] = none;
        continue;
      } else ink[p] = index;
      if (first < 0) first = x;
      last = x;
    }
    if (first < 0) continue;
    if (top < 0) top = y;
    bottom = y;
    if (first < left) left = first;
    if (last > right) right = last;
  }
  box[0] = top;
  box[1] = bottom;
  box[2] = left;
  box[3] = right;
}

/** lowbias32 */
function hash(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}

/** Each pixel's alpha threshold, the same in every frame and every part of a GIF. */
function thresholds(N: number): Uint8Array {
  const threshold = new Uint8Array(N);
  for (let p = 0; p < N; p++) threshold[p] = 1 + (hash(p ^ 0x51ed27) % 254);
  return threshold;
}

/** The frames of a loop of `frames` that its color table is cut from. */
export function gifSamples(frames: number): number[] {
  const count = Math.min(SAMPLES, frames);
  return [...new Set(Array.from({ length: count }, (_, s) => Math.floor((s * frames) / count)))];
}

/** A GIF's color table, at most `most` colors, from frames sampled across its loop (gifSamples), as [r, g, b] each. */
export function gifTable(
  samples: readonly Uint8Array[],
  size: { width: number; height: number },
  channels: 3 | 4,
  most = 255
): number[][] {
  const N = size.width * size.height;
  const threshold = channels === 4 ? thresholds(N) : null;
  return tableOf(
    count => {
      for (const pixels of samples) {
        for (let p = 0, o = 0; p < N; p++, o += channels) {
          if (threshold && pixels[o + 3] <= threshold[p]) continue;
          count(pixels[o], pixels[o + 1], pixels[o + 2]);
        }
      }
    },
    Math.max(2, Math.min(255, most))
  );
}

/** The bits an index of the table takes, one index past its colors standing for nothing. */
const bitsOf = (table: readonly number[][]) => {
  let bits = 1;
  while (1 << bits < table.length + 1) bits++;
  return bits;
};

/** A GIF's start: its screen, its color table and a loop forever. */
export function gifStart(
  size: { width: number; height: number },
  table: readonly number[][]
): Uint8Array<ArrayBuffer> {
  const bits = bitsOf(table);
  const out = new Bytes();
  out.text("GIF89a");
  out.short(size.width);
  out.short(size.height);
  out.byte(0x80 | (7 << 4) | (bits - 1));
  out.byte(table.length);
  out.byte(0);
  for (let i = 0; i < 1 << bits; i++) {
    const c = table[i] ?? [0, 0, 0];
    out.byte(c[0]);
    out.byte(c[1]);
    out.byte(c[2]);
  }
  out.byte(0x21);
  out.byte(0xff);
  out.byte(11);
  out.text("NETSCAPE2.0");
  out.byte(3);
  out.byte(1);
  out.short(0);
  out.byte(0);
  return out.result();
}

/** A GIF's end. */
export const GIF_END: Uint8Array<ArrayBuffer> = Uint8Array.of(0x3b);

/** Frames `from` to `to` of the source, written against the table: what goes between a GIF's start and its end. The
    first is drawn whole, so a GIF's frames can be written in parts, each by work of its own, and joined in order. */
export async function gifFrames(
  source: GifSource,
  table: readonly number[][],
  from: number,
  to: number,
  { tolerance = 0, dither = 0, pause = async () => {} }: Omit<GifOptions, "colors"> = {}
): Promise<Uint8Array<ArrayBuffer>> {
  const { width: W, height: H, channels } = source;
  const N = W * H;
  const alpha = channels === 4;
  const threshold = alpha ? thresholds(N) : new Uint8Array(0);
  /* each pixel's dither, in levels */
  const shift = new Int8Array(dither ? N : 0);
  for (let y = 0, p = 0; dither && y < H; y++) {
    for (let x = 0; x < W; x++, p++) shift[p] = Math.round(dither * BAYER[(y & 3) * 4 + (x & 3)]);
  }
  const flat = Int32Array.from(table.flat());
  const colors = table.length;
  /* the index after the colors stands for nothing: a transparent pixel, or one that did not change */
  const none = colors;
  const least = Math.max(2, bitsOf(table));

  /* a pixel's nearest color, looked up by six bits a channel and worked out the first time each is met */
  const lookup = new Int16Array(1 << 18).fill(-1);
  const nearest = (key: number) => {
    const R = ((key >>> 12) << 2) + 2;
    const G = (((key >>> 6) & 63) << 2) + 2;
    const B = ((key & 63) << 2) + 2;
    let near = 0;
    let best = Infinity;
    for (let i = 0, c = 0; i < colors; i++, c += 3) {
      const d = WR * (flat[c] - R) ** 2 + WG * (flat[c + 1] - G) ** 2 + WB * (flat[c + 2] - B) ** 2;
      if (d < best) {
        best = d;
        near = i;
      }
    }
    lookup[key] = near;
    return near;
  };

  const out = new Bytes();
  let now = new Uint8Array(N);
  let before = new Uint8Array(N);
  /* what an opaque frame writes: its pixel where it changed, nothing where it did not */
  const ink = new Uint8Array(alpha ? 0 : N);
  const edges = new Int32Array(4);
  for (let i = from; i < to; i++) {
    const pixels = source.frame(i);
    const keep = !alpha && tolerance > 0 && i > from;
    /* with transparency every drawn pixel is written, else what changed since the frame before, in the box they fall
       in */
    const whole = alpha || i === from;
    indexFrame(
      pixels,
      W,
      H,
      channels,
      { now, before, ink, whole, keep },
      { threshold, shift, dither, tolerance, flat, lookup, nearest, none },
      edges
    );
    let [top, bottom, left, right] = edges;
    /* nothing to draw: one pixel, left as it is */
    if (top < 0) {
      top = bottom = left = right = 0;
      (alpha ? now : ink)[0] = none;
    }
    const written = alpha ? now : ink;
    const swap = before;
    before = now;
    now = swap;
    /* graphic control: transparent frames are cleared when the next is drawn, opaque ones stay under it */
    out.byte(0x21);
    out.byte(0xf9);
    out.byte(4);
    out.byte(((alpha ? 2 : 1) << 2) | 1);
    out.short(source.delay(i));
    out.byte(none);
    out.byte(0);
    /* the frame's box */
    out.byte(0x2c);
    out.short(left);
    out.short(top);
    out.short(right - left + 1);
    out.short(bottom - top + 1);
    out.byte(0);
    lzw(written, top * W + left, right - left + 1, bottom - top + 1, W, least, out);
    await pause();
  }
  return out.result();
}

/** Byte arrays one after another. */
export function joinBytes(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The GIF of the frames, in one piece. */
export async function encodeGif(
  source: GifSource,
  { colors: most = 255, ...options }: GifOptions = {}
): Promise<Uint8Array<ArrayBuffer>> {
  /* the frames the table is cut from, kept to be written in their turn */
  const sampled = new Map(gifSamples(source.frames).map(i => [i, source.frame(i)]));
  const table = gifTable([...sampled.values()], source, source.channels, most);
  const frames = await gifFrames(
    {
      ...source,
      frame: i => {
        const kept = sampled.get(i);
        sampled.delete(i);
        return kept ?? source.frame(i);
      }
    },
    table,
    0,
    source.frames,
    options
  );
  return joinBytes([gifStart(source, table), frames, GIF_END]);
}
