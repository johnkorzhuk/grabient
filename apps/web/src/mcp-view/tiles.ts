import { decodePalette, encodePalette } from "@grabient/engine/codec.ts";
import { cssLine, gradientCss, paletteCss } from "@grabient/engine/css.ts";
import { type Stop, sampleStops } from "@grabient/engine/curve.ts";
import type { Language } from "@grabient/engine/message.ts";
import { seedName } from "@grabient/engine/name.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { drawnStops } from "@grabient/engine/soft.ts";
import { artworkSvg } from "@grabient/engine/svg.ts";
import { SWATCH_FILES, type SwatchFormat } from "@grabient/engine/swatches.ts";
import {
  DEFAULT_ANGLE,
  DEFAULT_STEPS,
  DEFAULT_STYLE,
  finishOf,
  GRAIN_MAX,
  isStyle,
  parseView,
  SOFT_MAX,
  STEPS_MAX,
  STEPS_MIN,
  type Style,
  viewSearch
} from "@grabient/engine/view.ts";
import { VIEW_DATA } from "./page.ts";

/* The palettes the view draws. They come twice: the call's own arguments, to paint at once, then the answer's tiles,
   which confirm them. The arguments are read by the server's rules (server/mcp/args.ts, and show_palettes' one tile
   per palette and view), so the numbers match the tiles the model is answered with. A field a call leaves out is the
   one Grabient keeps the palette in, which only the answer knows: until then it is drawn at the default. Everything is
   drawn from the seed. Pure: no DOM. */

/** As many tiles as a sheet holds, and as many as show_palettes takes (server/mcp/tools/account.ts). */
export const SHEET_MAX = 24;
/** As long as the server lets a tile's title be (features/account/wire.ts PALETTE_TITLE_MAX). */
const TITLE_MAX = 80;
/* the names a call and each of its palettes may carry: the server refuses a call with any other */
const CALL = ["name", "palettes"];
const ITEM = ["seed", "style", "steps", "angle", "soft", "grain", "title"];
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

export interface TileView {
  style: Style;
  steps: number;
  angle: number;
  /** a blur along the gradient's line and film grain over it, 1 to 100 each, where the view has them */
  soft?: number;
  grain?: number;
}
/** Who brought a palette to Grabient, as the site credits it (server/gallery/credit.ts). */
export type TileCredit = { by: "grabient" } | { by: "person"; name: string };
/** A palette as the view shows it: its number in the sheet, its seed, its view and, where it has one, a title of its
    own: the one the model gave its tile, or a written one its colors bear out. Its credit comes with the view's own
    data alone. */
export interface Tile extends TileView {
  tile: number;
  seed: string;
  title?: string;
  credit?: TileCredit;
}

const named = (input: object, names: readonly string[]) =>
  Object.keys(input).every(name => names.includes(name));
/** Text as the server reads it: composed, never folded, and trimmed. */
const typed = (v: unknown): unknown => (typeof v === "string" ? v.normalize("NFC").trim() : v);
/** A whole number as the server reads one: the number, or one written as text. */
const whole = (v: unknown): number =>
  typeof v === "number"
    ? v
    : typeof v === "string" && NUMBER.test(v.trim())
      ? Number(v)
      : Number.NaN;

/** A text's characters as a reader counts them (an emoji with its joiners), or its code points where the browser
    cannot tell them apart. */
function characters(text: string): string[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  return Segmenter
    ? Array.from(
        new Segmenter(undefined, { granularity: "grapheme" }).segment(text),
        part => part.segment
      )
    : Array.from(text);
}

/** A title as it is shown: composed, on one line, no longer than a title may be. A longer one, which only an answer can
    carry, is cut between characters, never through one. */
function titleOf(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const title = v
    .normalize("NFC")
    .replace(/\p{Cs}/gu, "")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (title.length <= TITLE_MAX) return title || undefined;
  let kept = "";
  for (const character of characters(title)) {
    if (kept.length + character.length > TITLE_MAX) break;
    kept += character;
  }
  return kept || undefined;
}

/** What a `seed` names, as the server reads one: a seed names its palette alone; an address names it in its last part
    or its `seed`, with the whole view its page draws. */
function paletteOf(seed: string): ({ palette: Palette } & Partial<TileView>) | null {
  if (seed.length > 400) return null;
  const own = decodePalette(seed);
  if (own) return { palette: own };
  let url: URL;
  try {
    url = new URL(seed, "https://palette.invalid");
  } catch {
    return null;
  }
  const last = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const palette =
    decodePalette(last.replace(/\.[a-z0-9]+$/i, "")) ??
    decodePalette(url.searchParams.get("seed") ?? "");
  if (!palette) return null;
  const { style, steps, angle, soft, grain } = parseView(url.searchParams);
  return { palette, style, steps, angle, ...finishOf({ soft, grain }) };
}

/* a soft or a grain as the server reads one: a whole number brought into 1 to its most, and one with no reading left
   out, as the call may leave it out */
function finishPart(v: unknown, most: number): number | undefined {
  const n = v === undefined || v === null ? Number.NaN : whole(v);
  return Number.isInteger(n) ? Math.min(most, Math.max(1, n)) : undefined;
}

/** One palette of a call as the server reads it, or null where the server refuses it. */
function paletteItem(raw: unknown): (TileView & { seed: string; title?: string }) | null {
  const input = typeof raw === "string" ? { seed: raw } : raw;
  if (!input || typeof input !== "object" || Array.isArray(input) || !named(input, ITEM))
    return null;
  const given = input as Record<string, unknown>;
  const seed = typed(given.seed);
  const title = typed(given.title);
  const said = typeof seed === "string" ? paletteOf(seed) : null;
  if (!said || (title != null && (typeof title !== "string" || title.length > TITLE_MAX)))
    return null;
  // a field beside the seed wins over the address's, null is a field left out, and a number may come as text
  const style = typed(given.style) ?? said.style ?? DEFAULT_STYLE;
  const steps = whole(given.steps ?? said.steps ?? DEFAULT_STEPS);
  const angle = whole(given.angle ?? said.angle ?? DEFAULT_ANGLE);
  const soft = finishPart(given.soft, SOFT_MAX) ?? said.soft;
  const grain = finishPart(given.grain, GRAIN_MAX) ?? said.grain;
  if (
    !isStyle(style) ||
    !Number.isInteger(steps) ||
    !Number.isInteger(angle) ||
    angle < 0 ||
    angle > 360
  )
    return null;
  // steps out of range are brought into it, never below the palette's keyframes
  const floor = Math.max(STEPS_MIN, said.palette.anchors.length);
  return {
    seed: encodePalette(said.palette),
    style,
    steps: Math.min(STEPS_MAX, Math.max(floor, steps)),
    angle,
    ...finishOf({ soft, grain }),
    title: titleOf(title)
  };
}

const sameView = (a: TileView & { seed: string }, b: TileView & { seed: string }) =>
  a.seed === b.seed &&
  a.style === b.style &&
  a.steps === b.steps &&
  a.angle === b.angle &&
  a.soft === b.soft &&
  a.grain === b.grain;

/** The tiles a call's arguments ask for, numbered as the server numbers them, or null where the server would refuse
    the call, so nothing is painted that the answer will not confirm. One tile per palette and view, titled by the
    first title given for it. */
export function tilesFromArguments(args: unknown): Tile[] | null {
  if (!args || typeof args !== "object" || Array.isArray(args) || !named(args, CALL)) return null;
  // the server refuses a call that names no set
  if (nameFromArguments(args) === null) return null;
  const list = (args as { palettes?: unknown }).palettes;
  if (!Array.isArray(list) || !list.length || list.length > SHEET_MAX) return null;
  const tiles: Tile[] = [];
  for (const raw of list) {
    const item = paletteItem(raw);
    if (!item) return null;
    const held = tiles.find(tile => sameView(tile, item));
    if (held) {
      if (item.title && !held.title) held.title = item.title;
      continue;
    }
    const { title, ...view } = item;
    tiles.push({ tile: tiles.length + 1, ...view, ...(title ? { title } : {}) });
  }
  return tiles;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/* a username as the site keeps one (features/account/username.ts) */
const USERNAME = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,28}[A-Za-z0-9])?$/;
/** A credit as the view's data carries it, checked: none where it is anything else. */
function creditOf(raw: unknown): TileCredit | undefined {
  const value = record(raw);
  if (value?.by === "grabient") return { by: "grabient" };
  return value?.by === "person" && typeof value.name === "string" && USERNAME.test(value.name)
    ? { by: "person", name: value.name }
    : undefined;
}

/** The set's name a call gives, as the server takes it: none where the server would refuse it. */
export function nameFromArguments(args: unknown): string | null {
  const said = typed(record(args)?.name);
  return typeof said === "string" && said.length <= TITLE_MAX ? (titleOf(said) ?? null) : null;
}

/** A tile as an answer carries it, checked: an answer is data, never trusted to be well formed. In the view's own data
    a title is the tile's own; in the words only one marked `own` is. */
function tileOf(raw: unknown, at: number, words: boolean): Tile | null {
  const value = record(raw);
  const palette = typeof value?.seed === "string" ? decodePalette(value.seed) : null;
  if (
    !value ||
    !palette ||
    !isStyle(value.style) ||
    !Number.isInteger(value.steps) ||
    !Number.isInteger(value.angle)
  )
    return null;
  const title = !words || value.own === true ? titleOf(value.title) : undefined;
  const credit = words ? undefined : creditOf(value.credit);
  const floor = Math.max(STEPS_MIN, palette.anchors.length);
  return {
    tile: Number.isInteger(value.tile) ? (value.tile as number) : at + 1,
    seed: encodePalette(palette),
    style: value.style,
    steps: Math.min(STEPS_MAX, Math.max(floor, value.steps as number)),
    angle: Math.min(360, Math.max(0, value.angle as number)),
    ...finishOf({
      soft: finishPart(value.soft, SOFT_MAX),
      grain: finishPart(value.grain, GRAIN_MAX)
    }),
    ...(title ? { title } : {}),
    ...(credit ? { credit } : {})
  };
}

const originOf = (raw: unknown): string | undefined => {
  if (typeof raw !== "string") return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
};

/** What show_palettes answered: the view's own data in the answer's `_meta`, or in structuredContent, where answers a
    stored conversation holds carry it; else the JSON of its text block. Null for a refusal or an answer with no tile. */
export function sheetFromResult(
  result: unknown
): { tiles: Tile[]; origin?: string; name?: string } | null {
  const answer = record(result);
  if (!answer || answer.isError) return null;
  let data =
    [record(answer._meta)?.[VIEW_DATA], answer.structuredContent]
      .map(record)
      .find(held => held?.tiles) ?? null;
  const words = !data;
  if (words && Array.isArray(answer.content)) {
    const block = answer.content.map(record).find(part => part?.type === "text");
    try {
      data = typeof block?.text === "string" ? record(JSON.parse(block.text)) : null;
    } catch {
      data = null;
    }
  }
  const raw = Array.isArray(data?.tiles) ? data.tiles.slice(0, SHEET_MAX) : [];
  const tiles = raw
    .map((tile, i) => tileOf(tile, i, words))
    .filter((tile): tile is Tile => tile !== null);
  if (!tiles.length) return null;
  const name = titleOf(data?.name);
  return {
    tiles,
    origin: originOf(data?.origin) ?? raw.map(tile => originOf(record(tile)?.url)).find(Boolean),
    ...(name ? { name } : {})
  };
}

/* What a tile draws and hands over, all from its seed and view */

/** The colors the view draws: its stops, never fewer than its keyframes. */
export function stopsOf(tile: { seed: string; steps: number }): Stop[] {
  const palette = decodePalette(tile.seed);
  return palette ? sampleStops(palette, Math.max(tile.steps, palette.anchors.length)) : [];
}
/** A view's stops as its picture draws them: a soft one's blurred along the line where they stand (engine/soft.ts). */
const drawnOf = (stops: readonly Stop[], view: TileView) => drawnStops(stops, view);
/** The picture's CSS background, as a card on the site draws it: a soft view's blurred stops; the grain stands over it
    as a layer of its own (grain.ts). */
export const artOf = (stops: readonly Stop[], view: TileView) => {
  const drawn = drawnOf(stops, view);
  return gradientCss(
    drawn.stops.map(stop => stop.hex),
    drawn.style,
    view.angle,
    undefined,
    drawn.at
  );
};
/** What CSS copies: the one OKLCH line a gallery card copies, so one strip copies the same thing everywhere, a soft
    view's blurred stops at their places, and the grain's tile (`grain`, a ready `url("data:…")`) over them. */
export const cssOf = (stops: readonly Stop[], view: TileView, grain?: string) => {
  const drawn = drawnOf(stops, view);
  return cssLine(drawn.stops, drawn.style, view.angle, "oklch", {
    ...(drawn.at ? { at: drawn.at } : {}),
    ...(view.grain && grain ? { grain } : {})
  });
};
/** The palette's CSS file in this view, as the site serves it: a soft view's blurred stops at their places, and the
    grain's tile (`grain`, a ready `url("data:…")`) over them. */
export const cssFileOf = (stops: readonly Stop[], tile: Tile, address: string, grain?: string) => {
  const drawn = drawnOf(stops, tile);
  return paletteCss(
    drawn.stops,
    { style: drawn.style, angle: tile.angle },
    address,
    "oklch",
    null,
    {
      ...(drawn.at ? { at: drawn.at } : {}),
      ...(tile.grain && grain ? { grain } : {})
    }
  );
};
/** The site's own SVG file of this view, at the view's size, crediting the site: a soft view's blurred stops, and the
    grain's tiles (`grain`, the tile's data URI at its strength). */
export const svgOf = (stops: readonly Stop[], tile: Tile, origin: string, grain?: string) => {
  const drawn = drawnOf(stops, tile);
  return artworkSvg(drawn.stops, tile, tile.seed, origin || undefined, undefined, {
    style: drawn.style,
    ...(drawn.at ? { at: drawn.at } : {}),
    ...(grain ? { grain } : {})
  });
};
const query = (tile: Tile) =>
  viewSearch({ style: tile.style, steps: tile.steps, angle: tile.angle, ...finishOf(tile) });
/** The palette's page on the site, in this view. */
export const paletteUrl = (origin: string, tile: Tile) => `${origin}/${tile.seed}${query(tile)}`;
export type FileFormat = "svg" | "png" | "css" | "md" | SwatchFormat;
/** One of the palette's files on the site, in this view. */
export const fileUrl = (origin: string, tile: Tile, format: FileFormat) =>
  `${origin}/${tile.seed}.${format === "tokens" ? SWATCH_FILES.tokens.extension : format}${query(tile)}`;
/** What the app's model is told of the palette a person chose in full screen: its tile and seed, the view it is drawn
    in now, and its address there, so "make this one warmer" names a palette. English, as a tool's answer is. */
export const chosenWords = (tile: Tile, origin: string): string =>
  `The person chose tile ${tile.tile} of the Grabient palette sheet, seed ${tile.seed}. It is drawn there now with style ${tile.style}, steps ${tile.steps}, angle ${tile.angle}${tile.soft ? `, soft ${tile.soft}` : ""}${tile.grain ? `, grain ${tile.grain}` : ""}.${origin ? ` Its address in this view: ${paletteUrl(origin, tile)}` : ""}`;
/** A tile's name: its title, or what its colors are called in the view, in the reader's words. */
export const nameOf = (tile: Tile, language?: Language): string =>
  tile.title || seedName(tile.seed, tile.style, tile.steps, language) || tile.seed;
/** Whether the style turns with the angle: a radial one does not. */
export const takesAngle = (style: Style) => !style.startsWith("radial");
