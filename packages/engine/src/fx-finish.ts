/* An effect's soft and grain as every format draws them, the site's own picture the measure: the stage blurs an
   effect's layer by a Gaussian whose sigma is a share of the picture's longer side (view.ts effectSoftShare; Editor.tsx
   fxBlur, a CSS blur in cqmax), the blur reading clear past the picture's edges, so they go to the palette's gradient
   laid under the layer (a blob with no ground of its own excepted, whose edges go clear), and lays the grain's tile
   over all of it, a speck a pixel from the picture's corner (grain.ts, lib/picture.ts). Here are the parts a file,
   a copy, a clip and a shader draw it from alike: the sigma, the gradient under, the blur of a picture's pixels and
   the grain over them, and the SVG that does the same with a filter a browser runs and Figma's importer reads as a
   layer blur, its grain as tiles of the tile's image, which Figma imports one to one (it stretches a pattern's image
   over the whole picture). */
import { hexBytes } from "./color.ts";
import { type Stop, sampleStops } from "./curve.ts";
import { EFFECT_KINDS, type Effect, type EffectKind, groundParts } from "./effect.ts";
import { GRAIN_SIDE, grainAlpha, grainSpeck, grainTilesSvg } from "./grain.ts";
import type { Palette } from "./palette.ts";
import { drawnStops } from "./soft.ts";
import { linearLine } from "./svg.ts";
import {
  DEFAULT_ANGLE,
  DEFAULT_STEPS,
  effectSoftShare,
  finishOf,
  type Size,
  type Style
} from "./view.ts";

export { finishOf };

/** A view's soft and grain, 1 to 100 each, none where absent or 0. */
export interface Finish {
  soft?: number;
  grain?: number;
}
/** Whether a view has either. */
export const hasFinish = (finish: Finish | null | undefined): boolean =>
  !!(finish?.soft || finish?.grain);

/** An effect's soft as the Gaussian's sigma in a picture's pixels: a share of its longer side; 0 for none. */
export const effectBlurSigma = (soft: number | null | undefined, size: Size): number =>
  soft ? effectSoftShare(soft) * Math.max(size.width, size.height) : 0;

/** The gradient a soft effect's edges go to: the palette's linear gradient at the effect's angle (the blob's palette
    lies left to right), its stops blurred by the same soft (soft.ts), as the stage lays it under the layer. */
export interface Underlay {
  stops: Stop[];
  style: Style;
  angle: number;
  /** each stop's place along the line, where the soft placed them */
  at?: number[];
}
/** The gradient under an effect, or null where nothing is under it: a blob whose ground lets the page through, or
    that has none, stands clear, its soft edges thinning toward the page, as its files are clear. Laid under a ground
    that lets it through, the gradient would show through the ground everywhere, where the site shows the page. */
export function effectUnderlay(
  P: Palette,
  effect: Pick<Effect, "kind" | "look">,
  angle: number,
  soft?: number | null
): Underlay | null {
  if (effect.kind === "blob" && !(effect.look.bg && groundParts(effect.look.bg).alpha === 1))
    return null;
  const drawn = drawnStops(sampleStops(P, Math.max(DEFAULT_STEPS, P.anchors.length)), {
    style: "linearGradient",
    soft: soft ?? null
  });
  return {
    stops: drawn.stops,
    style: drawn.style,
    angle: underlayAngle(effect.kind, angle),
    ...(drawn.at ? { at: drawn.at } : {})
  };
}
/** The angle an effect's gradient runs at: the effect's, or left to right for the blob, which has none. */
export const underlayAngle = (kind: EffectKind, angle: number): number =>
  EFFECT_KINDS[kind].angle ? angle : DEFAULT_ANGLE;

/** A linear gradient's pixels as CSS paints `linear-gradient(angle, …)` in a box: three bytes a pixel, each pixel's
    middle read along the gradient's line, the stops blended in sRGB between their places (evenly spaced unless `at`
    says). */
export function linearGradientPixels(
  hexes: readonly string[],
  angle: number,
  size: Size,
  at?: readonly number[]
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(size.width * size.height * 3);
  gradientRows(hexes, angle, size, at, 0, size.height, out);
  return out;
}
/* The gradient's rows `from` to `to` of the box, written from the start of `out`. */
function gradientRows(
  hexes: readonly string[],
  angle: number,
  size: Size,
  at: readonly number[] | undefined,
  from: number,
  to: number,
  out: Uint8Array
) {
  const { width: w, height: h } = size;
  const n = hexes.length;
  if (!n) return;
  const bytes = hexes.map(hexBytes);
  const places = at ?? hexes.map((_, i) => (n > 1 ? i / (n - 1) : 0));
  const a = (angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const length = Math.abs(w * dx) + Math.abs(h * dy) || 1;
  const color = (t: number, into: Uint8Array, k: number) => {
    if (t <= places[0] || n === 1) {
      into[k] = bytes[0][0];
      into[k + 1] = bytes[0][1];
      into[k + 2] = bytes[0][2];
      return;
    }
    if (t >= places[n - 1]) {
      into[k] = bytes[n - 1][0];
      into[k + 1] = bytes[n - 1][1];
      into[k + 2] = bytes[n - 1][2];
      return;
    }
    let j = 1;
    while (j < n - 1 && places[j] < t) j++;
    const span = places[j] - places[j - 1];
    const u = span > 0 ? (t - places[j - 1]) / span : 1;
    for (let c = 0; c < 3; c++)
      into[k + c] = Math.round(bytes[j - 1][c] + (bytes[j][c] - bytes[j - 1][c]) * u);
  };
  for (let y = from; y < to; y++) {
    const py = y + 0.5 - h / 2;
    for (let x = 0; x < w; x++) {
      const t = ((x + 0.5 - w / 2) * dx + py * dy) / length + 0.5;
      color(t, out, ((y - from) * w + x) * 3);
    }
  }
}
/** An underlay's pixels in a box. */
export const underlayPixels = (underlay: Underlay, size: Size): Uint8Array<ArrayBuffer> =>
  linearGradientPixels(
    underlay.stops.map(s => s.hex),
    underlay.angle,
    size,
    underlay.at
  );
/* An underlay's rows `from` to `to`, from the start of `out`. */
const underlayRows = (underlay: Underlay, size: Size, from: number, to: number, out: Uint8Array) =>
  gradientRows(
    underlay.stops.map(s => s.hex),
    underlay.angle,
    size,
    underlay.at,
    from,
    to,
    out
  );

/* The three box blurs a browser runs for a Gaussian (Filter Effects 1, feGaussianBlur): a box of d pixels, d from the
   sigma, three times; for an even d two of d, one leaning left and one right of the pixel, and one of d + 1. Each
   reads clear past the line's ends. `line` holds one channel of a line, premultiplied, scaled by 256. */
function boxes(sigma: number): [number, number][] {
  const d = Math.floor(sigma * ((3 * Math.sqrt(2 * Math.PI)) / 4) + 0.5);
  if (d < 1) return [];
  if (d % 2 === 1) {
    const r = (d - 1) / 2;
    return [
      [r, r],
      [r, r],
      [r, r]
    ];
  }
  const half = d / 2;
  return [
    [half, half - 1],
    [half - 1, half],
    [half, half]
  ];
}
/* The three boxes over one line, which `line` holds from `pad` on, clear either side: each pass reads the one before
   past the line's ends, as the blur of a layer spreads past its box before the box clips it, so its edges thin to
   half rather than to a third. */
function boxLine(
  line: Float64Array,
  n: number,
  pad: number,
  scratch: Float64Array,
  passes: readonly [number, number][]
) {
  const total = n + 2 * pad;
  let src = line;
  let dst = scratch;
  for (const [left, right] of passes) {
    const size = left + right + 1;
    /* the window's sum as x moves: in at x + right, out at x - left */
    let sum = 0;
    for (let i = 0; i <= Math.min(right, total - 1); i++) sum += src[i];
    for (let x = 0; x < total; x++) {
      dst[x] = sum / size;
      const into = x + right + 1;
      const out = x - left;
      if (into < total) sum += src[into];
      if (out >= 0) sum -= src[out];
    }
    const swap = src;
    src = dst;
    dst = swap;
  }
  if (src !== line) line.set(src.subarray(0, total));
}

/** A picture's straight-alpha RGBA pixels blurred by a Gaussian of `sigma` pixels as a browser blurs a layer: three box
    blurs each way of the premultiplied pixels, reading clear past the picture's edges, so they thin toward them. The
    pixels come back premultiplied, ready to lay over what is under them (overUnder), unless `straight`. */
export function blurRgba(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  sigma: number,
  straight = false
): Uint8ClampedArray<ArrayBuffer> {
  const n = width * height;
  /* premultiplied, a channel 0 to 255 */
  const pre = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3];
    const k = a / 255;
    pre[i * 4] = rgba[i * 4] * k;
    pre[i * 4 + 1] = rgba[i * 4 + 1] * k;
    pre[i * 4 + 2] = rgba[i * 4 + 2] * k;
    pre[i * 4 + 3] = a;
  }
  const passes = boxes(sigma);
  if (passes.length) {
    /* room either side for the three passes' spread */
    const pad = passes.reduce((sum, [left, right]) => sum + Math.max(left, right), 0) + 1;
    const longest = Math.max(width, height) + 2 * pad;
    const line = new Float64Array(longest);
    const scratch = new Float64Array(longest);
    for (let c = 0; c < 4; c++) {
      for (let y = 0; y < height; y++) {
        const row = y * width * 4 + c;
        line.fill(0);
        for (let x = 0; x < width; x++) line[pad + x] = pre[row + x * 4];
        boxLine(line, width, pad, scratch, passes);
        for (let x = 0; x < width; x++) pre[row + x * 4] = line[pad + x];
      }
      for (let x = 0; x < width; x++) {
        const column = x * 4 + c;
        line.fill(0);
        for (let y = 0; y < height; y++) line[pad + y] = pre[column + y * width * 4];
        boxLine(line, height, pad, scratch, passes);
        for (let y = 0; y < height; y++) pre[column + y * width * 4] = line[pad + y];
      }
    }
  }
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const a = pre[i * 4 + 3];
    const k = straight ? (a > 0 ? 255 / a : 0) : 1;
    out[i * 4] = Math.round(pre[i * 4] * k);
    out[i * 4 + 1] = Math.round(pre[i * 4 + 1] * k);
    out[i * 4 + 2] = Math.round(pre[i * 4 + 2] * k);
    out[i * 4 + 3] = Math.round(a);
  }
  return out;
}

/** Premultiplied RGBA pixels laid over opaque RGB ones (source over): three bytes a pixel. */
export function overUnder(
  premultiplied: ArrayLike<number>,
  under: ArrayLike<number>,
  width: number,
  height: number
): Uint8Array<ArrayBuffer> {
  const n = width * height;
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const keep = 1 - premultiplied[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++)
      out[i * 3 + c] = Math.round(premultiplied[i * 4 + c] + under[i * 3 + c] * keep);
  }
  return out;
}

/* From a blur this wide (its box, d pixels, a sigma of about 6) it runs on the picture's cells (cellsOver), which
   stays within about a level of the browser's at a fraction of the time and memory; a narrower one runs as blurRgba
   does, by bands. Cells of two pixels under a box of 8, three or four cells a box, were off by a mean of 0.67 levels
   and up to 4 over hard bars of saturated colors. */
const CELLS_FROM = 12;
/** How many cells each of the three boxes spans, at least. */
const CELLS_A_BOX = 6;
/** Rows a band of the narrow blur keeps, which bounds what it holds at once. */
const BAND_ROWS = 128;

/* A box of `v` cells² variance as a sliding window: weight 1 from -r to r and `a` at ±(r + 1) (Gwosdek et al.'s
   extended box), so its variance is any, not only a whole box's. */
function extendedBox(v: number): { r: number; a: number } {
  const r = Math.max(0, Math.floor((Math.sqrt(12 * v + 1) - 1) / 2));
  const a = ((2 * r + 1) * (v - (r * (r + 1)) / 3)) / (2 * ((r + 1) ** 2 - v));
  return { r, a: Math.min(1, Math.max(0, a)) };
}
/* Three extended boxes over a line of `n` cells, four channels a cell, clear past its ends (the grid's own pad holds
   their spread), from `line` back into it. */
function cellLine(line: Float32Array, scratch: Float32Array, n: number, r: number, a: number) {
  const norm = 1 / (2 * r + 1 + 2 * a);
  let src = line;
  let dst = scratch;
  for (let pass = 0; pass < 3; pass++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let i = 0; i <= Math.min(r, n - 1); i++) sum += src[i * 4 + c];
      for (let x = 0; x < n; x++) {
        const below = x - r - 1;
        const above = x + r + 1;
        const ends = (below >= 0 ? src[below * 4 + c] : 0) + (above < n ? src[above * 4 + c] : 0);
        dst[x * 4 + c] = (sum + a * ends) * norm;
        if (above < n) sum += src[above * 4 + c];
        if (x - r >= 0) sum -= src[(x - r) * 4 + c];
      }
    }
    const swap = src;
    src = dst;
    dst = swap;
  }
  if (src !== line) line.set(src.subarray(0, n * 4));
}

/* A wide blur on the picture's cells, f pixels a side: their premultiplied sums, blurred by three boxes of the
   variance the browser's three take (blurRgba) less what the cells and their bilinear read back take, then read back
   at each pixel, over the gradient where one is given. Over the effects' frames, 800 by 400 to 2400 by 1260, it stays
   within a mean of 0.2 levels and at most 2 of the browser's blur (blurRgba's, over its gradient); at the largest
   picture it takes 175 to 340 ms where that took 580 to 740, and it holds no copy of the picture but the one it
   writes. */
function cellsOver(
  rgba: ArrayLike<number>,
  size: Size,
  passes: readonly [number, number][],
  underlay: Underlay | null
): Uint8ClampedArray<ArrayBuffer> {
  const { width: w, height: h } = size;
  const d = passes[0][0] + passes[0][1] + 1;
  const variance = passes.reduce(
    (sum, [left, right]) => sum + ((left + right + 1) ** 2 - 1) / 12,
    0
  );
  const f = Math.max(2, Math.floor(d / CELLS_A_BOX));
  /* the variance a bilinear read adds, over a pixel's places in its cell */
  let read = 0;
  for (let k = 0; k < f; k++) {
    const u = (k + 0.5) / f - 0.5;
    const phase = u - Math.floor(u);
    read += phase * (1 - phase) * f;
  }
  const box = extendedBox((variance - (f * f - 1) / 12 - read) / (3 * f * f));
  const pad = 3 * (box.r + 1) + 2;
  const gw = Math.ceil(w / f) + 2 * pad;
  const gh = Math.ceil(h / f) + 2 * pad;
  const cells = new Float32Array(gw * gh * 4);
  /* each pixel's premultiplied channels into its cell, a cell's sum over f² */
  const share = 1 / (f * f);
  const column = new Int32Array(w);
  for (let x = 0; x < w; x++) column[x] = (Math.floor(x / f) + pad) * 4;
  for (let y = 0; y < h; y++) {
    const row = (Math.floor(y / f) + pad) * gw * 4;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const alpha = rgba[i + 3];
      if (!alpha) continue;
      const k = (alpha / 255) * share;
      const at = row + column[x];
      cells[at] += rgba[i] * k;
      cells[at + 1] += rgba[i + 1] * k;
      cells[at + 2] += rgba[i + 2] * k;
      cells[at + 3] += alpha * share;
    }
  }
  const longest = Math.max(gw, gh) * 4;
  const line = new Float32Array(longest);
  const scratch = new Float32Array(longest);
  for (let y = 0; y < gh; y++) {
    const row = cells.subarray(y * gw * 4, (y + 1) * gw * 4);
    line.set(row);
    cellLine(line, scratch, gw, box.r, box.a);
    row.set(line.subarray(0, gw * 4));
  }
  for (let x = 0; x < gw; x++) {
    for (let y = 0; y < gh; y++)
      for (let c = 0; c < 4; c++) line[y * 4 + c] = cells[(y * gw + x) * 4 + c];
    cellLine(line, scratch, gh, box.r, box.a);
    for (let y = 0; y < gh; y++)
      for (let c = 0; c < 4; c++) cells[(y * gw + x) * 4 + c] = line[y * 4 + c];
  }
  /* read back: each pixel's place among the cells' middles, across, then two rows of cells read across at a time */
  const left = new Int32Array(w);
  const across = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / f - 0.5 + pad;
    left[x] = Math.floor(u);
    across[x] = u - left[x];
  }
  const rowAt = (j: number, into: Float32Array) => {
    const base = j * gw * 4;
    for (let x = 0; x < w; x++) {
      const i = base + left[x] * 4;
      const t = across[x];
      for (let c = 0; c < 4; c++)
        into[x * 4 + c] = cells[i + c] + (cells[i + 4 + c] - cells[i + c]) * t;
    }
  };
  let upper = new Float32Array(w * 4);
  let lower = new Float32Array(w * 4);
  let held = -2;
  const out = new Uint8ClampedArray(w * h * 4);
  const ground = underlay ? new Uint8Array(w * 3) : null;
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / f - 0.5 + pad;
    const j = Math.floor(v);
    const s = v - j;
    if (j === held + 1) {
      const swap = upper;
      upper = lower;
      lower = swap;
      rowAt(j + 1, lower);
    } else if (j !== held) {
      rowAt(j, upper);
      rowAt(j + 1, lower);
    }
    held = j;
    if (ground && underlay) underlayRows(underlay, size, y, y + 1, ground);
    for (let x = 0; x < w; x++) {
      const k = x * 4;
      const o = (y * w + x) * 4;
      const alpha = upper[k + 3] + (lower[k + 3] - upper[k + 3]) * s;
      if (ground) {
        const keep = 1 - alpha / 255;
        for (let c = 0; c < 3; c++)
          out[o + c] = Math.round(
            upper[k + c] + (lower[k + c] - upper[k + c]) * s + ground[x * 3 + c] * keep
          );
        out[o + 3] = 255;
        continue;
      }
      if (alpha <= 0) continue;
      for (let c = 0; c < 3; c++)
        out[o + c] = Math.round(((upper[k + c] + (lower[k + c] - upper[k + c]) * s) * 255) / alpha);
      out[o + 3] = Math.round(alpha);
    }
  }
  return out;
}

/* A narrow blur as blurRgba runs it, a band of rows at a time with the rows its reach reads either side, laid over
   the gradient where one is given. */
function bandsOver(
  rgba: Uint8Array | Uint8ClampedArray,
  size: Size,
  sigma: number,
  passes: readonly [number, number][],
  underlay: Underlay | null
): Uint8ClampedArray<ArrayBuffer> {
  const { width: w, height: h } = size;
  const reach = passes.reduce((sum, [left, right]) => sum + Math.max(left, right), 0) + 1;
  const out = new Uint8ClampedArray(w * h * 4);
  const ground = underlay ? new Uint8Array(w * BAND_ROWS * 3) : null;
  for (let top = 0; top < h; top += BAND_ROWS) {
    const bottom = Math.min(h, top + BAND_ROWS);
    const from = Math.max(0, top - reach);
    const to = Math.min(h, bottom + reach);
    const blurred = blurRgba(
      rgba.subarray(from * w * 4, to * w * 4),
      w,
      to - from,
      sigma,
      !underlay
    );
    const kept = blurred.subarray((top - from) * w * 4, (bottom - from) * w * 4);
    if (!ground || !underlay) {
      out.set(kept, top * w * 4);
      continue;
    }
    underlayRows(underlay, size, top, bottom, ground);
    for (let i = 0, j = 0, o = top * w * 4; i < kept.length; i += 4, j += 3, o += 4) {
      const keep = 1 - kept[i + 3] / 255;
      out[o] = Math.round(kept[i] + ground[j] * keep);
      out[o + 1] = Math.round(kept[i + 1] + ground[j + 1] * keep);
      out[o + 2] = Math.round(kept[i + 2] + ground[j + 2] * keep);
      out[o + 3] = 255;
    }
  }
  return out;
}

/** A picture's straight-alpha RGBA pixels blurred by a Gaussian of `sigma` pixels as a browser blurs a layer (clear
    past its edges, which thin toward them), over the gradient under it where one is given, opaque then, else straight
    alpha. A wide blur runs on cells of the picture (cellsOver), a narrow one by bands of rows as blurRgba runs it, so
    neither holds more than the picture it writes: at the largest picture an address asks for, 2400 by 1260, the
    whole-picture blur's premultiplied copy alone was 48 MB of an isolate's 128. */
export function blurOver(
  rgba: Uint8Array | Uint8ClampedArray,
  size: Size,
  sigma: number,
  underlay: Underlay | null
): Uint8ClampedArray<ArrayBuffer> {
  const passes = boxes(sigma);
  if (passes.length && passes[0][0] + passes[0][1] + 1 >= CELLS_FROM)
    return cellsOver(rgba, size, passes, underlay);
  return bandsOver(rgba, size, sigma, passes, underlay);
}

/* the tile's specks at a grain: each speck's alpha, and whether it is white */
function tileAt(grain: number) {
  const alpha = new Uint8Array(GRAIN_SIDE * GRAIN_SIDE);
  const white = new Uint8Array(GRAIN_SIDE * GRAIN_SIDE);
  for (let y = 0; y < GRAIN_SIDE; y++)
    for (let x = 0; x < GRAIN_SIDE; x++) {
      const { white: w, size } = grainSpeck(x, y);
      alpha[y * GRAIN_SIDE + x] = grainAlpha(size, grain);
      white[y * GRAIN_SIDE + x] = w ? 255 : 0;
    }
  return { alpha, white };
}

/** Lays the tile at a grain over straight-alpha RGBA pixels in place (source over), the tile's corner at the
    picture's: where a picture is clear, the specks stand alone at their own alpha, as the site's layer lays them over
    the page. */
export function grainOverRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  grain: number
): void {
  if (!grain) return;
  const { alpha, white } = tileAt(grain);
  for (let y = 0; y < height; y++) {
    const row = (y & (GRAIN_SIDE - 1)) * GRAIN_SIDE;
    for (let x = 0; x < width; x++) {
      const k = row + (x & (GRAIN_SIDE - 1));
      const a = alpha[k];
      if (!a) continue;
      const v = white[k];
      const at = (y * width + x) * 4;
      const below = rgba[at + 3];
      if (below === 255) {
        for (let c = 0; c < 3; c++)
          rgba[at + c] = Math.round((rgba[at + c] * (255 - a) + v * a) / 255);
        continue;
      }
      /* straight alpha: out = a·v + (1 - a)·below, over the alphas' sum */
      const ta = a / 255;
      const ba = (below / 255) * (1 - ta);
      const oa = ta + ba;
      for (let c = 0; c < 3; c++) rgba[at + c] = Math.round((v * ta + rgba[at + c] * ba) / oa);
      rgba[at + 3] = Math.round(oa * 255);
    }
  }
}

/** An effect's frame finished as the site paints it: blurred by the soft (sigma `effectBlurSigma` of the box) over the
    gradient under it, or clear where it has none, and the grain over all. Takes straight-alpha RGBA pixels and gives
    them back, opaque wherever an underlay or the effect itself covers the box. A frame with neither comes back as it
    is. */
export function finishPixels(
  rgba: Uint8ClampedArray | Uint8Array,
  size: Size,
  finish: Finish,
  underlay: Underlay | null
): Uint8ClampedArray<ArrayBuffer> | Uint8ClampedArray | Uint8Array {
  const sigma = effectBlurSigma(finish.soft, size);
  let out: Uint8ClampedArray | Uint8Array =
    sigma > 0 ? blurOver(rgba, size, sigma, underlay) : rgba;
  if (finish.grain) {
    if (out === rgba) out = Uint8ClampedArray.from(rgba);
    grainOverRgba(out, size.width, size.height, finish.grain);
  }
  return out;
}

/* ids the finish adds to an SVG, named so none meets one an effect's own drawing writes */
const ID = { box: "gfx-box", soft: "gfx-soft", under: "gfx-under", grain: "gfx-grain" } as const;
const fmt = (v: number) => Number(v.toFixed(3)).toString();

/* the root element of an SVG document and what follows it */
function rootOf(svg: string): { open: string; inner: string } | null {
  const body = svg.replace(/^\s*<\?xml[^>]*\?>\s*/, "");
  const open = /^<svg\b[^>]*>/.exec(body)?.[0];
  if (!open || !body.trimEnd().endsWith("</svg>")) return null;
  return { open, inner: body.slice(open.length, body.trimEnd().length - "</svg>".length) };
}

/** An effect's SVG document finished as the site paints it, in a box of its pixels: its drawing, whole and untouched as
    an SVG inside the finished one, clipped to the box and blurred by the soft over the gradient under it (`underlay`,
    none for a clear blob), clipped again, then the grain's tiles (`grain`, the tile's data URI at the grain's strength) over all.
    Where its root names the box alone (`0 0 width height`), its drawing stands in a group instead, which a design tool
    reads as plainly. The blur is in sRGB, as a CSS blur is; its sigma is `effectBlurSigma`. Credit comments stay at
    the top. */
export function finishSvg(
  svg: string,
  size: Size,
  finish: Finish,
  over: { underlay?: Underlay | null; grain?: string | null } = {}
): string {
  if (!hasFinish(finish)) return svg;
  const root = rootOf(svg);
  if (!root) return svg;
  const { width: w, height: h } = size;
  const sigma = effectBlurSigma(finish.soft, size);
  const grain = finish.grain && over.grain ? over.grain : null;
  if (!sigma && !grain) return svg;
  /* credit comments first in the document */
  const credit = /^\s*((?:<!--[\s\S]*?-->\s*)+)/.exec(root.inner)?.[1] ?? "";
  const inner = root.inner.slice(credit.length);
  const viewBox = /\sviewBox="([^"]*)"/
    .exec(root.open)?.[1]
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const plain =
    !!viewBox &&
    viewBox[0] === 0 &&
    viewBox[1] === 0 &&
    viewBox[2] === w &&
    viewBox[3] === h &&
    !/\s(class|style|preserveAspectRatio)=/.test(root.open);
  const nested = root.open
    .replace(/\s(width|height|x|y)="[^"]*"/g, "")
    .replace(/^<svg\b/, `<svg x="0" y="0" width="${w}" height="${h}"`);
  const drawing = plain ? `<g>${inner}</g>` : `${nested}${inner}</svg>`;
  const underlay = sigma && over.underlay ? over.underlay : null;
  const defs = [
    `<clipPath id="${ID.box}"><rect width="${w}" height="${h}"/></clipPath>`,
    underlay
      ? `<linearGradient id="${ID.under}" gradientUnits="userSpaceOnUse" ${linearLine(underlay.angle, w, h)}>${underlay.stops
          .map(
            (s, i) =>
              `<stop offset="${(underlay.at ? underlay.at[i] : i / Math.max(1, underlay.stops.length - 1)).toFixed(5)}" stop-color="${s.hex}"/>`
          )
          .join("")}</linearGradient>`
      : "",
    sigma
      ? `<filter id="${ID.soft}" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${fmt(sigma)}"/></filter>`
      : ""
  ].join("");
  /* the drawing clipped to the box before it is blurred as well as after: Chromium blurs what a drawing paints past
     the filter's region into its edges, where Firefox and a CSS blur read clear, so a rosette's petals past the box
     kept its edges from thinning in Chromium alone */
  const picture = sigma
    ? `<g clip-path="url(#${ID.box})">${underlay ? `<rect width="${w}" height="${h}" fill="url(#${ID.under})"/>` : ""}<g filter="url(#${ID.soft})"><g clip-path="url(#${ID.box})">${drawing}</g></g></g>`
    : drawing;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${credit}<defs>${defs}</defs>${picture}${grain ? grainTilesSvg(grain, size) : ""}</svg>`;
}
