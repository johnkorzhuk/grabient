/* The painter: a palette in its view as pixels, a share card's chips and wordmark, and the wedges of several palettes.
   Each pixel is read at its middle from the view's stops by CSS's geometry over the box it fills: linear along the
   gradient line, radial out to the corners, angular clockwise from the angle off the top. A gradient style blends its
   stops and a swatch style draws hard bands. Drawn straight into a buffer, a picture has no seams between wedges and
   needs no rasterizer to start up. */
import { luminance } from "@grabient/engine/color.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { isSwatchStyle, type Style, type View } from "@grabient/engine/view.ts";
import { HEX_CHARS, HEX_SIZES } from "./hex-glyphs.data.ts";
import { encodePng } from "./png.ts";
import { BAR, MARGIN } from "./size.ts";
import { WORDMARK } from "./wordmark.data.ts";

/** An sRGB color in 0 to 255, unrounded: a stop as the curve gives it. */
export type Rgb = readonly number[];

/** What a picture shows of one palette: its stops in order, laid out by the style and the angle. */
export interface Look {
  colors: readonly Rgb[];
  style: Style;
  angle: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Canvas {
  width: number;
  data: Uint8Array;
}

const toRgb = (rgb: readonly number[]) => rgb.map(v => v * 255);

/** A palette in a view as a picture shows it: the view's stops. */
export const lookOf = (P: Palette, view: Pick<View, "style" | "steps" | "angle">): Look => ({
  colors: sampleStops(P, view.steps).map(stop => toRgb(stop.rgb)),
  style: view.style,
  angle: view.angle
});

/** A palette's own colors, one to a keyframe, read as a view's stops are: what a card's chips show. */
export const keyframeColors = (P: Palette): Rgb[] =>
  sampleStops(P, P.anchors.length).map(stop => toRgb(stop.rgb));

function blendAt(canvas: Canvas, at: number, a: Rgb, b: Rgb, mix: number) {
  canvas.data[at] = Math.round(a[0] + (b[0] - a[0]) * mix);
  canvas.data[at + 1] = Math.round(a[1] + (b[1] - a[1]) * mix);
  canvas.data[at + 2] = Math.round(a[2] + (b[2] - a[2]) * mix);
}

/** The stops at `t` from 0 to 1: as hard bands, or blended between the two stops it falls between. */
function colorAt(canvas: Canvas, at: number, colors: readonly Rgb[], bands: boolean, t: number) {
  const n = colors.length;
  const position = bands ? Math.min(n - 1, Math.floor(t * n)) : t * (n - 1);
  const index = Math.floor(position);
  blendAt(canvas, at, colors[index], colors[Math.min(n - 1, index + 1)], position - index);
}

function paintLook(canvas: Canvas, look: Look, box: Box) {
  const { width, height } = box;
  const angle = (look.angle * Math.PI) / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const line = Math.abs(width * sin) + Math.abs(height * cos);
  const radius = Math.hypot(width, height) / 2;
  const radial = look.style.startsWith("radial");
  const angular = look.style.startsWith("angular");
  const bands = isSwatchStyle(look.style);
  for (let y = 0; y < height; y++) {
    const dy = y + 0.5 - height / 2;
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - width / 2;
      let t = radial
        ? Math.hypot(dx, dy) / radius
        : angular
          ? (Math.atan2(dx, -dy) - angle) / (2 * Math.PI)
          : (dx * sin - dy * cos) / line + 0.5;
      if (angular) t -= Math.floor(t);
      t = Math.min(1, Math.max(0, t));
      colorAt(canvas, ((box.y + y) * canvas.width + box.x + x) * 3, look.colors, bands, t);
    }
  }
}

/* Chips: a row this tall at the card's foot, and a hex at least this far inside its chip. */
const CHIP_ROW = 92;
const CHIP_INSET = 12;

const decoded = (base64: string) => Uint8Array.from(atob(base64), char => char.charCodeAt(0));
async function inflate(base64: string): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([decoded(base64)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface Glyphs {
  height: number;
  widths: readonly number[];
  starts: readonly number[];
  mask: Uint8Array;
}
// Masks are constant data: inflated once per isolate, on the first card.
let wordmark: Promise<Uint8Array> | undefined;
let glyphs: Promise<Glyphs[]> | undefined;
const wordmarkMask = () => (wordmark ??= inflate(WORDMARK.mask));
const glyphSets = () =>
  (glyphs ??= Promise.all(
    HEX_SIZES.map(async set => {
      let at = 0;
      const starts = set.widths.map(width => {
        const start = at;
        at += width * set.height;
        return start;
      });
      return { height: set.height, widths: set.widths, starts, mask: await inflate(set.mask) };
    })
  ));

/** One color over a pixel at a share of 0 to 1. */
function lay(canvas: Canvas, at: number, color: Rgb, share: number) {
  for (let c = 0; c < 3; c++) {
    canvas.data[at + c] = Math.round(canvas.data[at + c] * (1 - share) + color[c] * share);
  }
}

/** WCAG's choice between black and white: whichever contrasts more with a color of this luminance. */
const blackReads = (L: number) => (L + 0.05) / 0.05 >= 1.05 / (L + 0.05);

/* The wordmark at the card's top left, in near black or near white by the mean light of what lies under it (every
   fourth pixel each way), and its bar running these colors left to right. */
async function paintWordmark(canvas: Canvas, colors: readonly Rgb[]) {
  const mask = await wordmarkMask();
  let light = 0;
  let count = 0;
  for (let y = 0; y < WORDMARK.height; y += 4) {
    for (let x = 0; x < WORDMARK.width; x += 4) {
      const at = ((MARGIN + y) * canvas.width + MARGIN + x) * 3;
      light += luminance([
        canvas.data[at] / 255,
        canvas.data[at + 1] / 255,
        canvas.data[at + 2] / 255
      ]);
      count++;
    }
  }
  const tone = blackReads(light / count) ? 10 : 250;
  const ink = [tone, tone, tone];
  for (let y = 0; y < WORDMARK.height; y++) {
    for (let x = 0; x < WORDMARK.width; x++) {
      const alpha = mask[y * WORDMARK.width + x] / 255;
      if (alpha) lay(canvas, ((MARGIN + y) * canvas.width + MARGIN + x) * 3, ink, alpha);
    }
  }
  const n = colors.length;
  for (let y = BAR.y; y < BAR.y + BAR.height; y++) {
    for (let x = BAR.x; x < BAR.x + BAR.width; x++) {
      const position = ((x - BAR.x) / (BAR.width - 1)) * (n - 1);
      const index = Math.floor(position);
      const at = (y * canvas.width + x) * 3;
      blendAt(canvas, at, colors[index], colors[Math.min(index + 1, n - 1)], position - index);
    }
  }
}

interface Chip {
  x: number;
  width: number;
  rgb: number[];
  hex: string;
}
const hexOf = (rgb: readonly number[]) =>
  `#${rgb.map(v => v.toString(16).padStart(2, "0")).join("")}`;

/** A chip to a color across the width, each filled with the 8-bit color its hex names; neighbors of one hex are one
    chip. */
function chipsAcross(colors: readonly Rgb[], width: number): Chip[] {
  const chips: Chip[] = [];
  const n = colors.length;
  colors.forEach((exact, i) => {
    const rgb = exact.map(Math.round);
    const hex = hexOf(rgb);
    const end = Math.round((width * (i + 1)) / n);
    const last = chips.at(-1);
    if (last?.hex === hex) last.width = end - last.x;
    else {
      const x = Math.round((width * i) / n);
      chips.push({ x, width: end - x, rgb, hex });
    }
  });
  return chips;
}
const textWidth = (set: Glyphs, text: string) =>
  [...text].reduce((sum, char) => sum + set.widths[HEX_CHARS.indexOf(char)], 0);

function paintText(canvas: Canvas, set: Glyphs, text: string, left: number, top: number, ink: Rgb) {
  let along = left;
  for (const char of text) {
    const g = HEX_CHARS.indexOf(char);
    const width = set.widths[g];
    for (let y = 0; y < set.height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = set.mask[set.starts[g] + y * width + x] / 255;
        if (alpha) lay(canvas, ((top + y) * canvas.width + along + x) * 3, ink, alpha);
      }
    }
    along += width;
  }
}

/* The chips along the card's foot, each with its hex in black or white, at the largest size whose widest hex fits the
   narrowest chip. */
async function paintChips(canvas: Canvas, colors: readonly Rgb[], top: number) {
  const chips = chipsAcross(colors, canvas.width);
  const narrowest = Math.min(...chips.map(chip => chip.width));
  const set = (await glyphSets()).find(
    s => Math.max(...chips.map(chip => textWidth(s, chip.hex))) + 2 * CHIP_INSET <= narrowest
  );
  for (const chip of chips) {
    const row = new Uint8Array(chip.width * 3);
    for (let x = 0; x < chip.width; x++) row.set(chip.rgb, x * 3);
    for (let y = top; y < top + CHIP_ROW; y++)
      canvas.data.set(row, (y * canvas.width + chip.x) * 3);
    if (!set) continue;
    const ink = blackReads(luminance(chip.rgb.map(v => v / 255))) ? [0, 0, 0] : [255, 255, 255];
    const left = chip.x + Math.round((chip.width - textWidth(set, chip.hex)) / 2);
    paintText(canvas, set, chip.hex, left, top + Math.round((CHIP_ROW - set.height) / 2), ink);
  }
}

const canvasOf = (width: number, height: number): Canvas => ({
  width,
  data: new Uint8Array(width * height * 3)
});

/** A palette's picture: its look over every pixel. */
export function drawPicture(look: Look, width: number, height: number) {
  const canvas = canvasOf(width, height);
  paintLook(canvas, look, { x: 0, y: 0, width, height });
  return encodePng(width, height, canvas.data);
}

/** A share card: the look from edge to edge with the wordmark at its top left and, given its keyframes' colors, a chip
    to each along its foot. The card carries no other words: whoever shows it titles it. */
export async function drawCard(
  look: Look,
  chips: readonly Rgb[] | null,
  width: number,
  height: number
): Promise<Uint8Array<ArrayBuffer>> {
  const canvas = canvasOf(width, height);
  const top = chips ? height - CHIP_ROW : height;
  paintLook(canvas, look, { x: 0, y: 0, width, height: top });
  if (chips) await paintChips(canvas, chips, top);
  await paintWordmark(canvas, look.colors);
  return encodePng(width, height, canvas.data);
}

/** Where the first of `count` wedges begins, clockwise from the top: turned so its middle runs through the wordmark's
    middle (175, 64.5 on a 1200 by 630 card, scaled with the picture). */
const mix = (into: number[], with_: readonly number[], part: number) => {
  for (let i = 0; i < 3; i++) into[i] = into[i]! + (with_[i]! - into[i]!) * part;
};
/** A wedge's color `t` of the way out from the middle: blended between two stops, or a band whose edges are a pixel
    soft, so its rings are smooth (`ring`, a band's width in pixels). */
function wedgeColor(
  into: number[],
  colors: readonly Rgb[],
  bands: boolean,
  t: number,
  ring: number
) {
  const n = colors.length;
  if (!bands) {
    const position = t * (n - 1);
    const index = Math.min(n - 1, Math.floor(position));
    const a = colors[index]!;
    const b = colors[Math.min(n - 1, index + 1)]!;
    for (let i = 0; i < 3; i++) into[i] = a[i]! + (b[i]! - a[i]!) * (position - index);
    return;
  }
  const position = Math.min(n, t * n);
  const index = Math.min(n - 1, Math.floor(position));
  const a = colors[index]!;
  for (let i = 0; i < 3; i++) into[i] = a[i]!;
  const inside = (position - index) * ring;
  const left = ring - inside;
  if (left < 0.5 && index < n - 1) mix(into, colors[index + 1]!, 0.5 - left);
  else if (inside < 0.5 && index > 0) mix(into, colors[index - 1]!, 0.5 - inside);
}

export function wedgeStart(count: number, width: number, height: number): number {
  const x = (175 / 1200) * width - width / 2;
  const y = (64.5 / 630) * height - height / 2;
  return Math.atan2(x, -y) - Math.PI / count;
}

/** Several palettes as one picture: equal wedges about its middle, clockwise, each its palette running out from the
    middle at its own steps, as rings for a swatch style and a blend for a gradient. A branded one is their share card:
    the wordmark stands on the first wedge and its bar runs the first palette's colors. */
export async function drawWedges(
  looks: readonly Look[],
  width: number,
  height: number,
  branded: boolean
): Promise<Uint8Array<ArrayBuffer>> {
  const canvas = canvasOf(width, height);
  const n = looks.length;
  const radius = Math.hypot(width, height) / 2;
  const start = wedgeStart(n, width, height);
  const bands = looks.map(look => isSwatchStyle(look.style));
  const rings = looks.map(look => radius / look.colors.length);
  const own: number[] = [0, 0, 0];
  const next: number[] = [0, 0, 0];
  for (let y = 0; y < height; y++) {
    const dy = y + 0.5 - height / 2;
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - width / 2;
      let around = (Math.atan2(dx, -dy) - start) / (2 * Math.PI);
      around -= Math.floor(around);
      const from = Math.hypot(dx, dy);
      const out = Math.min(1, from / radius);
      const step = around * n;
      const k = Math.min(n - 1, Math.floor(step));
      wedgeColor(own, looks[k].colors, bands[k], out, rings[k]);
      /* a pixel on a wedge's side is shared with the wedge beside it as far as the side crosses it: its distance from
         the side, along the arc it stands on, gives each its part */
      const arc = (2 * Math.PI * from) / n;
      const after = (k + 1 - step) * arc;
      const before = (step - k) * arc;
      const side = after < 0.5 ? (k + 1) % n : before < 0.5 ? (k + n - 1) % n : -1;
      if (side >= 0) {
        wedgeColor(next, looks[side].colors, bands[side], out, rings[side]);
        mix(own, next, 0.5 - Math.min(after, before));
      }
      const at = (y * width + x) * 3;
      canvas.data[at] = Math.round(own[0]!);
      canvas.data[at + 1] = Math.round(own[1]!);
      canvas.data[at + 2] = Math.round(own[2]!);
    }
  }
  if (branded) await paintWordmark(canvas, looks[0].colors);
  return encodePng(width, height, canvas.data);
}
