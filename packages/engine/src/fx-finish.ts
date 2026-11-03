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
import { EFFECT_KINDS, type Effect, type EffectKind } from "./effect.ts";
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
/** The gradient under an effect, or null where nothing is under it: a blob with no ground stands clear. */
export function effectUnderlay(
  P: Palette,
  effect: Pick<Effect, "kind" | "look">,
  angle: number,
  soft?: number | null
): Underlay | null {
  if (effect.kind === "blob" && !effect.look.bg) return null;
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
  const { width: w, height: h } = size;
  const out = new Uint8Array(w * h * 3);
  const n = hexes.length;
  if (!n) return out;
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
  for (let y = 0; y < h; y++) {
    const py = y + 0.5 - h / 2;
    for (let x = 0; x < w; x++) {
      const t = ((x + 0.5 - w / 2) * dx + py * dy) / length + 0.5;
      color(t, out, (y * w + x) * 3);
    }
  }
  return out;
}
/** An underlay's pixels in a box. */
export const underlayPixels = (underlay: Underlay, size: Size): Uint8Array<ArrayBuffer> =>
  linearGradientPixels(
    underlay.stops.map(s => s.hex),
    underlay.angle,
    size,
    underlay.at
  );

/** The three box blurs a browser runs for a Gaussian (Filter Effects 1, feGaussianBlur), as each box's reach before a
    pixel and after it: a box of d pixels, d from the sigma, three times; for an even d two of d, one leaning left and
    one right of the pixel, and one of d + 1. Each reads clear past the line's ends. None for a sigma too small. */
export function blurBoxes(sigma: number): [number, number][] {
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
  const passes = blurBoxes(sigma);
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
  const { width, height } = size;
  let out: Uint8ClampedArray | Uint8Array = rgba;
  const sigma = effectBlurSigma(finish.soft, size);
  if (sigma > 0) {
    if (underlay) {
      const blurred = blurRgba(rgba, width, height, sigma);
      const rgb = overUnder(blurred, underlayPixels(underlay, size), width, height);
      const opaque = new Uint8ClampedArray(width * height * 4);
      for (let i = 0, j = 0; i < opaque.length; i += 4, j += 3) {
        opaque[i] = rgb[j];
        opaque[i + 1] = rgb[j + 1];
        opaque[i + 2] = rgb[j + 2];
        opaque[i + 3] = 255;
      }
      out = opaque;
    } else out = blurRgba(rgba, width, height, sigma, true);
  }
  if (finish.grain) {
    if (out === rgba) out = Uint8ClampedArray.from(rgba);
    grainOverRgba(out, width, height, finish.grain);
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
    an SVG inside the finished one, blurred by the soft over the gradient under it (`underlay`, none for a clear blob)
    and clipped to the box, then the grain's tiles (`grain`, the tile's data URI at the grain's strength) over all.
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
  const picture = sigma
    ? `<g clip-path="url(#${ID.box})">${underlay ? `<rect width="${w}" height="${h}" fill="url(#${ID.under})"/>` : ""}<g filter="url(#${ID.soft})">${drawing}</g></g>`
    : drawing;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${credit}<defs>${defs}</defs>${picture}${grain ? grainTilesSvg(grain, size) : ""}</svg>`;
}
