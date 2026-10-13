import { cssLine } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import {
  DEFAULT_ANGLE,
  DEFAULT_STEPS,
  DEFAULT_STYLE,
  isSwatchStyle,
  STEPS_MIN,
  type Style,
  viewSearch
} from "@grabient/engine/view.ts";

/* A palette as the account's tools answer it: one card in every list, and a made card for a palette a call made,
   changed or inspected. All of it comes from the seed and the view: no database, no drawing. */

/** A view as a call may name it: any of the three left out. */
export interface ViewGiven {
  style?: Style;
  steps?: number;
  angle?: number;
}
/** A palette a call named: its canonical seed, and the view the call or its address gave. */
export interface PaletteGiven extends ViewGiven {
  seed: string;
}
/** A palette in the view an answer draws it in. */
export interface Shown {
  seed: string;
  palette: Palette;
  style: Style;
  steps: number;
  angle: number;
}

/** A palette in the view a call names. A field left out is `held`'s, the view Grabient shows the palette in, else the
    default. Held steps stand only for a style of their kind, bands or a blend. Steps nothing gives show every color: a
    band a color, or for a blend the fewest stops from 7 up that land on each (7, 7, 7, 9, 11, 7, 8 for 2 to 8
    colors). A view draws every color a palette has, so fewer steps are raised to that many. */
export function shown(
  seed: string,
  palette: Palette,
  given: ViewGiven,
  held: ViewGiven = {}
): Shown {
  const style = given.style ?? held.style ?? DEFAULT_STYLE;
  const colors = palette.anchors.length;
  const bands = isSwatchStyle(style);
  const heldKind = held.style === undefined ? undefined : isSwatchStyle(held.style);
  const kept = given.steps ?? (heldKind === bands ? held.steps : undefined);
  let steps = kept ?? (bands ? colors : DEFAULT_STEPS);
  if (kept === undefined && !bands) while ((steps - 1) % (colors - 1)) steps++;
  return {
    seed,
    palette,
    style,
    steps: Math.max(STEPS_MIN, colors, steps),
    angle: given.angle ?? held.angle ?? DEFAULT_ANGLE
  };
}

/** What an answer says where a view draws more steps than were asked, or than two colors make as bands. */
export function raised(s: Shown, asked?: number): string[] {
  if (s.steps === STEPS_MIN && s.palette.anchors.length < STEPS_MIN && isSwatchStyle(s.style)) {
    return ["A view draws at least three bands, so the middle one is the blend of the two colors."];
  }
  return asked !== undefined && asked < s.steps
    ? [`Steps were raised to ${s.steps}, the number of colors the palette has.`]
    : [];
}

const query = (s: Shown) => viewSearch({ style: s.style, steps: s.steps, angle: s.angle });
/** A palette's page in a view. */
export const addressOf = (origin: string, s: Shown) => `${origin}/${s.seed}${query(s)}`;
/** One of a palette's files in a view: the seed plus the format, as the Worker serves them. */
export const fileOf = (origin: string, s: Shown, format: "png" | "svg" | "css") =>
  `${origin}/${s.seed}.${format}${query(s)}`;

/** The colors a card lists. A swatch view's bands, past 12 the band nearest each of the palette's own colors, so each
    is one the view draws; else its own colors, one a keyframe, which a gradient blends between. */
export function colorsOf(s: Shown): string[] {
  const own = s.palette.anchors.length;
  const stops = sampleStops(s.palette, isSwatchStyle(s.style) ? s.steps : own);
  const kept =
    stops.length > 12
      ? Array.from(
          { length: own },
          (_, i) => stops[Math.round((i * (stops.length - 1)) / (own - 1))]!
        )
      : stops;
  return kept.map(stop => stop.hex);
}

/** A palette as every answer shows it. `more` is what a list knows of it besides: its likes, when it was saved. */
export const card = (
  origin: string,
  s: Shown,
  title: string,
  more: Record<string, unknown> = {}
) => ({
  seed: s.seed,
  url: addressOf(origin, s),
  title,
  colors: colorsOf(s),
  style: s.style,
  steps: s.steps,
  angle: s.angle,
  ...more
});

/** CSS past this many steps is left to the palette's file. */
const CSS_STEPS_MAX = 32;

/** A palette made, changed or inspected: the card, its CSS, its files in its view (`card` is its share picture), then
    what `more` adds, and `notes` joined as one note. An app that draws the view (`drawn`) is given no file: a model
    handed a picture's address sets it in its reply as a picture, which some apps hold back instead of drawing. */
export const madeCard = (
  origin: string,
  s: Shown,
  title: string,
  notes: readonly string[],
  more: Record<string, unknown> = {},
  drawn = false
) => ({
  ...card(origin, s, title),
  ...(s.steps > CSS_STEPS_MAX
    ? {}
    : { css: cssLine(sampleStops(s.palette, s.steps), s.style, s.angle, "hex") }),
  ...(drawn
    ? {}
    : {
        files: {
          png: fileOf(origin, s, "png"),
          svg: fileOf(origin, s, "svg"),
          css: fileOf(origin, s, "css"),
          card: `${origin}/api/og?seed=${s.seed}${query(s).replace("?", "&")}`
        }
      }),
  ...more,
  ...(notes.length ? { note: notes.join(" ") } : {})
});
