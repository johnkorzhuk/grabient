/* What a palette shows on its examples page, and what reads on it. Each part draws the palette in the look the page
   gives it (looks.ts), or says how it draws it otherwise. Where words stand on a picture, the colors under them say which ink
   reads there, by WCAG 2's contrast: a gradient's are read off its geometry (the line, the cone or the circle the CSS
   draws, for a box of a given shape), the fluted glass's as all six of its colors, which its drifting discs carry
   anywhere in it, lit and shaded by its ribs, a blob's as all its colors over its ground, which the page's own is
   where it has none, the silk's as its dye's line lit and
   shaded by its folds, and the rosette's and the papercut's as every color they lay, which their motion carries
   anywhere in them. A soft picture reads farther: a gradient's blur along its line, an effect's over the box and the
   gradient under it, as far as the blur reaches. */
import { hexToSrgb, lchToSrgb, srgbToLch, type Triple, toHex } from "@grabient/engine/color.ts";
import { CONTRAST_LARGE, CONTRAST_TEXT, contrast } from "@grabient/engine/contrast.ts";
import { sampleHex, sampleLCH, sampleSrgb, sampleStops } from "@grabient/engine/curve.ts";
import { EFFECT_KINDS, type Effect, groundParts, isVectorKind } from "@grabient/engine/effect.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import {
  DEFAULT_ANGLE,
  DEFAULT_STEPS,
  effectSoftShare,
  isSwatchStyle,
  SOFT_MAX,
  type Style,
  type View
} from "@grabient/engine/view.ts";

/** The palette as a part of the page shows it: its seed, its colors, the view of its look with its soft and grain,
    and the effect it plays where the look is one. */
export interface Shown {
  seed: string;
  palette: Palette;
  view: Pick<View, "style" | "steps" | "angle" | "soft" | "grain">;
  effect: Effect | null;
}

export type Theme = "light" | "dark";

/** Each theme's ink as tokens.css has it: a light theme's on a light picture, a dark theme's on a dark one. */
export const THEME_INK: Readonly<Record<Theme, string>> = { light: "#17171b", dark: "#ececea" };
/** Each theme's page ground, which a blob with no ground of its own stands on. */
export const THEME_GROUND: Readonly<Record<Theme, string>> = { light: "#f3f2ee", dark: "#0c0c0e" };

/** Where a blob's colors are read along its palette, as the engine reads a blob's lights (blobBackdrop). */
const BLOB_PLACES = 9;
/** The places the silk's and the rosette's colors are read at along their palette, as the editor lists them
    (engine/effect-code.ts effectColors): end to end at six places. */
const CURVE_PLACES = 6;
/** The papercut's sheets, each one of the palette's colors at even steps along it (engine/papercut.ts PAPERCUT_LOOK). */
export const PAPERCUT_SHEETS = 12;

/** The colors a picture of the palette is drawn with, in order: a gradient's stops or its bands at the view's steps,
    the glass's six, the blob's palette at nine places, the silk's and the rosette's at six, the papercut's sheets. */
export function drawnColors(s: Shown): string[] {
  let colors = drawn.get(s);
  if (!colors) {
    const kind = s.effect?.kind;
    colors =
      kind === "glass"
        ? glassColors(s.palette)
        : kind === "blob"
          ? Array.from({ length: BLOB_PLACES }, (_, i) =>
              sampleHex(s.palette, i / (BLOB_PLACES - 1))
            )
          : sampleStops(
              s.palette,
              kind === "papercut" ? PAPERCUT_SHEETS : kind ? CURVE_PLACES : s.view.steps
            ).map(stop => stop.hex);
    drawn.set(s, colors);
  }
  return colors;
}
/* each picture's colors, worked out once: a page's checks read them for each part of the picture they try */
const drawn = new WeakMap<Shown, string[]>();

/** A part of a box, as fractions of its width and height from its top left corner. */
export interface Part {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
/** The part as a right-to-left page lays it: the same distance from the other side. */
export const mirrored = (p: Part): Part => ({ x0: 1 - p.x1, y0: p.y0, x1: 1 - p.x0, y1: p.y1 });

/** The color at `t`, 0 to 1, of colors laid along a gradient's line as CSS lays them: blended in sRGB between stops
    spread from end to end (as D3's piecewise interpolateRgb blends a scale), or a band of each, all as wide (D3's
    quantize). */
export function colorAt(colors: readonly string[], t: number, bands: boolean): string {
  const n = colors.length;
  const u = Math.min(1, Math.max(0, t));
  if (bands || n < 2) return colors[Math.min(n - 1, Math.floor(u * n))];
  const x = u * (n - 1);
  const i = Math.min(n - 2, Math.floor(x));
  const A = hexToSrgb(colors[i]) ?? [0, 0, 0];
  const B = hexToSrgb(colors[i + 1]) ?? [0, 0, 0];
  return toHex(A.map((v, k) => v + (B[k] - v) * (x - i)));
}

/** Where along a gradient's line a point of a box `aspect` times as wide as tall stands, 0 to 1, as CSS draws the
    style: a linear gradient's line at the angle, a conic gradient's turn from the angle round the center, a circle's
    distance from the center to the farthest corner. */
function placeOf(style: Style, angle: number, aspect: number, x: number, y: number): number {
  const dx = (x - 0.5) * aspect;
  const dy = y - 0.5;
  if (style.startsWith("radial")) return Math.hypot(dx, dy) / Math.hypot(aspect / 2, 0.5);
  const turn = (angle * Math.PI) / 180;
  if (style.startsWith("angular")) {
    const around = (Math.atan2(dx, -dy) * 180) / Math.PI;
    return ((((around - angle) % 360) + 360) % 360) / 360;
  }
  const length = Math.abs(aspect * Math.sin(turn)) + Math.abs(Math.cos(turn));
  return 0.5 + (dx * Math.sin(turn) - dy * Math.cos(turn)) / length;
}

/* The glass (engine/glass.ts) lays its six colors as soft discs over a ground of its second, which drift along its
   ribs over its loop, blurs them and bends them through its ribs, whose light multiplies each by a factor of its lens's
   gray, 1 + shade · (skew · x − x² + 1/3) for x from −1 to 1, 0.944 at its least and 1.021 at its most: every color it
   shows anywhere is a blend of its six, darkened or lightened so far (GLASS_LIGHT, held to the engine's by a test). */
const GLASS_LIGHT = [0.94, 1.03] as const;
const glasses = new WeakMap<Palette, string[]>();
/** Every color the glass shows: each of its six at its ribs' least light and at their most. */
function glassLit(P: Palette): string[] {
  let all = glasses.get(P);
  if (!all) {
    all = [
      ...new Set(
        glassColors(P).flatMap(hex => {
          const rgb = hexToSrgb(hex) ?? [0, 0, 0];
          return GLASS_LIGHT.map(light => toHex(rgb.map(v => v * light)));
        })
      )
    ];
    glasses.set(P, all);
  }
  return all;
}

/** A blob's colors as they may stand anywhere: all of them, and its ground, the page's own in both themes where it has
    none, since a server draws the page before it knows the reader's theme. */
function blobColors(effect: Effect, colors: readonly string[]): string[] {
  const ground = effect.look.bg?.slice(0, 7);
  return [...colors, ...(ground ? [ground] : [THEME_GROUND.dark, THEME_GROUND.light])];
}

/* The silk (engine/silk.ts) dyes its palette's curve along a line at its angle, turned by its drape's tilt, through the
   middle of the square that covers its box, and lays that dye three ways: as dyed, lifted where a fold's crest catches
   the light, and deepened in a fold's valley. A pixel is lerp(lerp(base, shade, V), lift, C) for the valley V and the
   crest C its folds lay there, which swing over the loop, so every color it shows is a blend of the three at its
   place. These are the silk's own numbers (SILK_DESIGN), written again so the page carries none of its drawing; a
   test holds them to the engine's. */
const SILK = {
  /** the dye's places along its line, as its table holds them (LUT_N) */
  places: 32,
  /** the light's lift toward white and its chroma; the shade's depth, its chroma and a yellow's warm turn, degrees */
  liftL: 0.4,
  liftC: 1,
  shadeL: 0.5,
  shadeC: 1.15,
  warm: 26,
  /** the dye's line turned from the angle's, degrees: as designed, and the least and most a shape turns it */
  tilt: -24,
  tilts: [-32, -16]
} as const;

/** How near a hue is to yellow's, 1 at it and 0 past 55 degrees either way: how far the silk's shade turns it warm. */
function yellowness(H: number): number {
  const d = ((((H - 100) % 360) + 540) % 360) - 180;
  const x = Math.max(0, 1 - Math.abs(d) / 55);
  return x * x * (3 - 2 * x);
}

/** The silk's dye at its places, dyed, lit and shaded, as the engine bakes its table (bakeDye). */
interface Dye {
  base: string[];
  lift: string[];
  shade: string[];
}
const dyes = new WeakMap<Palette, Dye>();
function dyeOf(P: Palette): Dye {
  let dye = dyes.get(P);
  if (!dye) {
    dye = { base: [], lift: [], shade: [] };
    for (let i = 0; i < SILK.places; i++) {
      const at = i / (SILK.places - 1);
      const [L, C, H] = sampleLCH(P, at);
      dye.base.push(toHex(sampleSrgb(P, at)));
      dye.lift.push(toHex(lchToSrgb(L + (1 - L) * SILK.liftL, C * SILK.liftC, H)));
      dye.shade.push(
        toHex(lchToSrgb(L * (1 - SILK.shadeL), C * SILK.shadeC, H - SILK.warm * yellowness(H)))
      );
    }
    dyes.set(P, dye);
  }
  return dye;
}

/** Where along the silk's dye a point of a box `aspect` times as wide as tall stands, 0 to 1: its line at `angle`
    through the middle of the square that covers the box, from corner to corner of that square as CSS's line runs. */
function dyePlace(angle: number, aspect: number, x: number, y: number): number {
  const turn = (angle * Math.PI) / 180;
  const sin = Math.sin(turn);
  const cos = Math.cos(turn);
  const along =
    ((x - 0.5) * aspect * sin - (y - 0.5) * cos) /
    (Math.max(aspect, 1) * (Math.abs(sin) + Math.abs(cos)));
  return Math.min(1, Math.max(0, 0.5 + along));
}

/** The silk's colors under any part of a box: its dye, dyed, lit and shaded, at the ends of the stretch of its line the
    part covers and at each place between, at its tilt, or at every tilt a shape of its own may give it. */
function silkParts(s: Shown, aspect: number): (part: Part) => string[] {
  const dye = dyeOf(s.palette);
  const tilts = s.effect?.look.shape
    ? Array.from({ length: SILK.tilts[1] - SILK.tilts[0] + 1 }, (_, i) => SILK.tilts[0] + i)
    : [SILK.tilt];
  return part => {
    let [a, b] = [1, 0];
    for (const tilt of tilts)
      for (const x of [part.x0, part.x1])
        for (const y of [part.y0, part.y1]) {
          const u = dyePlace(s.view.angle + tilt, aspect, x, y);
          a = Math.min(a, u);
          b = Math.max(b, u);
        }
    return [
      ...new Set([dye.base, dye.lift, dye.shade].flatMap(line => colorsOver(line, a, b, false)))
    ];
  };
}

/* The rosette (engine/rosette.ts) lays its petals in rings that ripple out from a glowing heart over its loop, each
   petal one place of its palette's curve as a gradient from a deep base through its color to a lit tip, so every color
   it lays passes over every part of it. Its rings read the curve out and back over 34 petals or 21, and a shape that
   runs its colors round the flower reads it anywhere, which a reading every 32nd of the way stands for. These are the
   rosette's own numbers (ROSETTE_DESIGN), held to the engine's by a test. */
const ROSETTE = {
  /** its petals' gradient stops, each a tone: below 0 the ring's shade, 0 its color, above 0 its tint */
  tones: [-0.75, -0.3, 0, 0.45],
  /** how deep the shade goes (its lightness's factor) and how far the tint toward white */
  shadeF: 0.42,
  tintF: 0.55,
  /** the places its petals read the curve at: every 17th and 21st of the way (its rings over 34 petals and 21, read
      from either end), and every 32nd */
  readings: [17, 21, 32]
} as const;

/** A color darker, its hue kept rich, as the rosette shades it: a yellow's shade turns toward amber, never olive. */
function rosetteShade(c: Triple, f: number, chroma: number): Triple {
  const [L, C, H] = srgbToLch(c);
  const h = ((H % 360) + 360) % 360;
  let turn = 0;
  if (C > 0.02 && h > 60 && h < 140) {
    const w =
      (h < 70 ? (h - 60) / 10 : h > 130 ? (140 - h) / 10 : 1) * Math.min(1, (C - 0.02) / 0.03);
    turn = -w * (h - 55) * Math.min(1, (1 - f) * 2.4);
  }
  return lchToSrgb(L * f, C * chroma, H + turn);
}
/** A color lighter, toward white, as the rosette tints it, a dark color keeping its chroma. */
function rosetteTint(c: Triple, f: number): Triple {
  const [L, C, H] = srgbToLch(c);
  return lchToSrgb(L + (1 - L) * f, C * (1 - 0.35 * f + 0.4 * (1 - L) * (1 - L)), H);
}

/** Every color the rosette lays: each place its petals read, in each of their gradient's tones, the heart's glow from
    either end of the palette, and the ground under it, the palette's deepest color shaded. */
const rosettes = new WeakMap<Palette, string[]>();
function rosetteColors(P: Palette): string[] {
  let all = rosettes.get(P);
  if (!all) {
    const laid = new Set<string>();
    const places = new Set(
      ROSETTE.readings.flatMap(n => Array.from({ length: n + 1 }, (_, k) => k / n))
    );
    for (const at of places) {
      const c = sampleSrgb(P, at);
      for (const tone of ROSETTE.tones)
        laid.add(
          toHex(
            tone < 0
              ? rosetteShade(c, 1 + tone * (1 - ROSETTE.shadeF), 1 - 0.1 * tone)
              : tone > 0
                ? rosetteTint(c, tone * ROSETTE.tintF)
                : c
          )
        );
    }
    for (const end of [0, 1]) {
      const c = sampleSrgb(P, end);
      const L = srgbToLch(c)[0];
      laid.add(toHex(rosetteTint(c, 0.35 * L * L)));
    }
    let deepest = sampleSrgb(P, 0);
    let least = 2;
    for (let i = 0; i <= 16; i++) {
      const c = sampleSrgb(P, i / 16);
      const L = srgbToLch(c)[0];
      if (L < least) [least, deepest] = [L, c];
    }
    laid.add(toHex(rosetteShade(deepest, 0.5, 1)));
    all = [...laid];
    rosettes.set(P, all);
  }
  return all;
}

/* The papercut (engine/papercut.ts) cuts its palette into sheets of paper, one color each, stacked in a relief whose
   hills drift and whose waves roll over its loop, so any sheet may surface anywhere in it. A sheet shows its face, a
   lit edge where its cut faces the light, and the shadows the sheets above it cast on it, its own paper deeper (a
   yellow's turned toward ochre): every color it lays is a blend of these. These are the papercut's own numbers
   (PAPERCUT_LOOK), held to the engine's by a test. */
const PAPERCUT = {
  wallLift: 0.05,
  shadowDepth: 0.55,
  shadowChroma: 1.15,
  ochre: 28,
  yellow: 100
} as const;
const papercuts = new WeakMap<Palette, string[]>();
function papercutColors(P: Palette): string[] {
  let all = papercuts.get(P);
  if (!all) {
    const faces = Array.from({ length: PAPERCUT_SHEETS }, (_, i) =>
      toHex(sampleSrgb(P, i / (PAPERCUT_SHEETS - 1)))
    );
    const lch = faces.map(hex => srgbToLch(hexToSrgb(hex) ?? [0, 0, 0]));
    const walls = lch.map(([L, C, H]) =>
      toHex(lchToSrgb(Math.min(1, L + PAPERCUT.wallLift), C * 0.9, H))
    );
    /* sheet k's shadow falls on sheet k - 1, that paper deeper */
    const shadows = lch.map((_, k) => {
      const [L, C, H] = lch[Math.max(0, k - 1)];
      const off = ((((H - PAPERCUT.yellow) % 360) + 540) % 360) - 180;
      const turn = PAPERCUT.ochre * Math.max(0, 1 - Math.abs(off) / 45) * Math.min(1, C / 0.06);
      return toHex(lchToSrgb(L * PAPERCUT.shadowDepth, C * PAPERCUT.shadowChroma, H - turn));
    });
    all = [...new Set([...faces, ...walls, ...shadows])];
    papercuts.set(P, all);
  }
  return all;
}

/** The whole of a box, as a part of it. */
const WHOLE: Part = { x0: 0, y0: 0, x1: 1, y1: 1 };
/** Every color a picture of the palette shows anywhere, those every color in it is a blend of: the colors it is drawn
    with, and the lights and shades the silk, the rosette and the papercut lay them in. */
export const shownColors = (s: Shown): string[] =>
  isVectorKind(s.effect?.kind) ? colorsOfParts(s, 1)(WHOLE) : drawnColors(s);

/** The colors under a part of a box `aspect` times as wide as tall where the palette is its picture, as the page shows
    it: those every color there is a blend of (colorsOfParts). */
export const colorsUnder = (s: Shown, part: Part, aspect: number): string[] =>
  colorsOfParts(s, aspect)(part);

/** The least contrast an ink has on any of the colors. */
export const worstContrast = (ink: string, colors: readonly string[]): number =>
  colors.reduce((least, color) => Math.min(least, contrast(ink, color)), 21);

/** White or black, whichever reads better on every one of the colors, with the least contrast it has there. */
export function inkOn(colors: readonly string[]): { ink: string; ratio: number } {
  const white = worstContrast("#ffffff", colors);
  const black = worstContrast("#000000", colors);
  return white >= black ? { ink: "#ffffff", ratio: white } : { ink: "#000000", ratio: black };
}

/** The theme whose ink reads on every one of the colors at `need` at least, the better of the two where both do; null
    where neither does. */
export function themeOn(colors: readonly string[], need: number = CONTRAST_TEXT): Theme | null {
  const dark = worstContrast(THEME_INK.dark, colors);
  const light = worstContrast(THEME_INK.light, colors);
  const best = dark >= light ? "dark" : "light";
  return Math.max(dark, light) >= need ? best : null;
}

/** The WCAG level text reaches at a contrast: AAA from 7, AA from 4.5, AA for large text from 3, none under that. */
export const contrastLevel = (ratio: number): "AAA" | "AA" | "AA Large" | null =>
  ratio >= 7 ? "AAA" : ratio >= CONTRAST_TEXT ? "AA" : ratio >= CONTRAST_LARGE ? "AA Large" : null;

/** A contrast as the page writes it: two places, never rounded up, so 4.496 is 4.49 and does not pass at 4.5. */
export const twoPlaces = (ratio: number): number => Math.floor(ratio * 100) / 100;

/** The palette's own color that stands out most from a page's ground: what a blob with no ground of its own is given
    where its clear parts must show, such as inside a headline's letters, so every letter reads on the page. */
export function groundOn(page: string, colors: readonly string[]): string {
  return colors.reduce(
    (best, color) => (contrast(color, page) > contrast(best, page) ? color : best),
    colors[0] ?? "#808080"
  );
}

/** The stretches of the line a part of a box `aspect` times as wide as tall covers, each from `a` to `b` in 0 to 1, as
    CSS draws the style: a linear gradient's between its corners' places; a circle's from the part's point nearest the
    center (the center where the part holds it) to its farthest corner; a cone's the least turn holding its corners,
    the whole turn where the part holds the center, and two stretches where it crosses the turn's start. */
function stretchesOf(style: Style, angle: number, aspect: number, part: Part): [number, number][] {
  const places = [
    [part.x0, part.y0],
    [part.x1, part.y0],
    [part.x0, part.y1],
    [part.x1, part.y1]
  ].map(([x, y]) => placeOf(style, angle, aspect, x, y));
  if (style.startsWith("radial")) {
    const nearX = Math.min(Math.max(0.5, part.x0), part.x1);
    const nearY = Math.min(Math.max(0.5, part.y0), part.y1);
    return [[placeOf(style, angle, aspect, nearX, nearY), Math.max(...places)]];
  }
  if (style.startsWith("angular")) {
    if (part.x0 <= 0.5 && part.x1 >= 0.5 && part.y0 <= 0.5 && part.y1 >= 0.5) return [[0, 1]];
    /* the turn less the widest gap between neighboring corners, the one across the start first */
    const turns = places.sort((a, b) => a - b);
    let [from, to, gap] = [turns[0], turns[3], 1 - turns[3] + turns[0]];
    for (let i = 0; i < 3; i++)
      if (turns[i + 1] - turns[i] > gap)
        [from, to, gap] = [turns[i + 1], turns[i] + 1, turns[i + 1] - turns[i]];
    return to <= 1
      ? [[from, to]]
      : [
          [from, 1],
          [0, to - 1]
        ];
  }
  return [[Math.min(...places), Math.max(...places)]];
}

/** The colors laid along a gradient's line from `a` to `b` of which every color between is a blend: those at its ends
    and each stop between; of bands, each band it crosses. */
function colorsOver(colors: readonly string[], a: number, b: number, bands: boolean): string[] {
  const n = colors.length;
  const from = Math.min(1, Math.max(0, a));
  const to = Math.min(1, Math.max(0, b));
  if (bands || n < 2)
    return colors.slice(
      Math.min(n - 1, Math.floor(from * n)),
      Math.min(n - 1, Math.floor(to * n)) + 1
    );
  const stops = colors.filter((_, k) => from < k / (n - 1) && k / (n - 1) < to);
  return [colorAt(colors, from, false), ...stops, colorAt(colors, to, false)];
}

/** The colors under any part of a box `aspect` times as wide as tall where the palette is its picture: those every
    color there is a blend of, the colors at the ends of each stretch of the line the part covers and each stop between
    (the silk's its dye's line, lit and shaded), a blob's all of its colors and its ground, and every color the glass,
    the rosette or the papercut lays. A part's corners and the point nearest the
    middle say which stretch it covers, so no stop between two points read goes unseen. A soft gradient's stretch is
    widened by as far as its blur reaches along the line; a soft effect's part by as far as its blur reaches over the
    box, the gradient under it too, which its edges thin to. */
export function colorsOfParts(s: Shown, aspect: number): (part: Part) => string[] {
  const effect = s.effect;
  const soft = s.view.soft ?? 0;
  if (!effect)
    return lineParts(
      drawnColors(s),
      s.view.style,
      s.view.angle,
      aspect,
      soft ? REACH * lineSigma(s.view.style, soft) : 0
    );
  const shown = effectParts(s, effect, aspect);
  if (!soft) return shown;
  const share = REACH * effectSoftShare(soft);
  /* the gradient a soft effect's edges thin to, none under a blob that stands on the page (fx-finish.ts
     effectUnderlay): the palette's at its steps or its keyframes, along the effect's angle, the blob's left to right */
  const under = bare(effect)
    ? null
    : lineParts(
        sampleStops(s.palette, Math.max(DEFAULT_STEPS, s.palette.anchors.length)).map(
          stop => stop.hex
        ),
        "linearGradient",
        EFFECT_KINDS[effect.kind].angle ? s.view.angle : DEFAULT_ANGLE,
        aspect,
        REACH * lineSigma("linearGradient", soft)
      );
  return part => {
    const reached = spread(part, share, aspect);
    return [...new Set([...shown(reached), ...(under?.(reached) ?? [])])];
  };
}

/** The colors under parts of an effect's picture, as colorsOfParts reads them before a soft. */
function effectParts(s: Shown, effect: Effect, aspect: number): (part: Part) => string[] {
  if (effect.kind === "blob") {
    const all = blobColors(effect, drawnColors(s));
    return () => all;
  }
  if (effect.kind === "silk") return silkParts(s, aspect);
  const all =
    effect.kind === "rosette"
      ? rosetteColors(s.palette)
      : effect.kind === "papercut"
        ? papercutColors(s.palette)
        : glassLit(s.palette);
  return () => all;
}

/** The colors under parts of `colors` drawn in a style at an angle: each stretch of the line a part covers, widened by
    `reach` either way (round the turn's start for a cone, which a blur wraps across), at its ends and each stop
    between, or each band it crosses. */
function lineParts(
  colors: readonly string[],
  style: Style,
  angle: number,
  aspect: number,
  reach: number
): (part: Part) => string[] {
  const bands = isSwatchStyle(style);
  const around = style.startsWith("angular");
  const widened = ([a, b]: [number, number]): [number, number][] => {
    const [from, to] = [a - reach, b + reach];
    if (!around || to - from >= 1) return [[from, to]];
    return [
      [Math.max(0, from), Math.min(1, to)],
      ...(from < 0 ? ([[1 + from, 1]] as [number, number][]) : []),
      ...(to > 1 ? ([[0, to - 1]] as [number, number][]) : [])
    ];
  };
  return part => [
    ...new Set(
      stretchesOf(style, angle, aspect, part)
        .flatMap(widened)
        .flatMap(([a, b]) => colorsOver(colors, a, b, bands))
    )
  ];
}

/** How far a blur reaches, in its deviations: past three, it takes nothing that shows. */
const REACH = 3;
/** A soft's deviation along its style's line at SOFT_MAX, as a share of the line: 0.08 of a 16:9 picture's D (the
    square root of its area) along its width for a linear style, to its corner for a radial one, and round the circle
    a third of the way out for an angular one. engine/soft.ts's own (softSigma), written again so the page carries
    none of the blur's code, which loads only where a picture is soft; a test holds them to it. */
const SIGMA_FULL = {
  linear: 0.08 / (16 / 12),
  radial: 0.08 / (Math.hypot(16, 9) / 2 / 12),
  angular: 0.08 / (2 * Math.PI * 0.32)
} as const;
/** A soft's deviation along its style's line, as a share of the line: eased as engine/soft.ts eases it. */
export const lineSigma = (style: Style, soft: number): number =>
  SIGMA_FULL[
    style.startsWith("radial") ? "radial" : style.startsWith("angular") ? "angular" : "linear"
  ] *
  (Math.min(SOFT_MAX, Math.max(0, soft)) / SOFT_MAX) ** 1.6;

/** A part spread by `share` of a box's longer side on every side, within the box, the box `aspect` times as wide as
    tall: how far an effect's blur reaches from it. */
function spread(part: Part, share: number, aspect: number): Part {
  const x = share * Math.max(1, 1 / aspect);
  const y = share * Math.max(aspect, 1);
  return {
    x0: Math.max(0, part.x0 - x),
    y0: Math.max(0, part.y0 - y),
    x1: Math.min(1, part.x1 + x),
    y1: Math.min(1, part.y1 + y)
  };
}

/** Whether an effect stands on the page with no ground of its own under it: a blob with none, or one the page shows
    through (features/list/card-effect.tsx standsBare). */
export const bare = (effect: Effect | null): boolean =>
  effect?.kind === "blob" && !(effect.look.bg && groundParts(effect.look.bg).alpha === 1);
