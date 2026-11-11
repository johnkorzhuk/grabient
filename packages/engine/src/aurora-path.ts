/* The aurora's range as an address carries it (`path=`), written so that a person or a model writes one by hand:
     `line` or `curve`: how the heights after it are joined, by straight lines (a line, a jagged range) or by a smooth
     curve
     then heights from the box's left edge to its right, each from 0 (the box's bottom) to 100 (its top), a tenth at
     the finest, with commas between, as the site's addresses list things (lock=lightness,chroma): 2 to 64 of them
     and either word again wherever the joining changes: the heights after it are joined that way, the first of them
     to the height before the word
   Heights written plainly are evenly spaced. Or every height names its place first, `place:height`, the place from 0
   (the box's left edge) to 100 (its right), never falling: corners stand where they are put, two heights at one
   place are an upright wall, and the outline is level from the box's side to the first place and from the last to
   the other side.
   So `line,33,33` is a level line a third of the way up, `line,20,45` one that climbs, `curve,30,55,35,60,30` two
   hills, `line,25,25,curve,45,60,45,25,line,25,40,25` level ground, a smooth hill and a sharp peak, and
   `line,0:30,20:30,20:55,35:55,35:38,100:38` a block from 20 to 35 across, 55 high, on ground that steps from 30 to
   38. Where a line and a curve meet, the outline turns a corner: a run of curved pieces is the smooth curve through
   its own heights and bends by nothing outside them, so a line beside it never makes it dip or climb past what is
   written; a wall ends a run as a line does.
   A path as auroraPathOf writes it is the one spelling of its outline (a word only where the joining changes, places
   only where they are not the even spacing's, no leading zeros, no ".0"); any other spelling reads as the same
   outline, and a look keeps the one (auroraPath).

   Apart from the aurora's model, which draws it (aurora.ts), since effect.ts reads a look's path and every page's
   start loads effect.ts: this holds the reading and the writing alone. */
import { clamp01 } from "./math.ts";

const NUMBER = /^(?:100|\d{1,2})(?:\.\d)?$/;
/** The most heights a path has. */
export const AURORA_PATH_MOST = 64;

/** A path's parts: its heights (0 to 1 of the box's height); each one's place (0 to 1 across the box, never falling;
    two at one place are an upright wall); of each piece between two heights, whether a curve joins them (a wall is
    never curved); and whether the path names its places (else they are the even spacing's). */
export interface AuroraPathParts {
  heights: number[];
  places: number[];
  curved: boolean[];
  placed: boolean;
}

/** A path's parts, or null where it is not one. */
export function auroraPathParts(path: unknown): AuroraPathParts | null {
  if (typeof path !== "string") return null;
  let heights: number[] = [];
  /* places in thousandths of the box's width, whole numbers, so two written alike are the same place */
  let places: number[] = [];
  let curved: boolean[] = [];
  let curve: boolean | null = null;
  let word = false;
  let placed: boolean | null = null;
  for (const t of path.split(",")) {
    if (t === "line" || t === "curve") {
      /* a word is followed by a height, never by another word */
      if (word) return null;
      curve = t === "curve";
      word = true;
      continue;
    }
    const at = t.indexOf(":");
    const h = at < 0 ? t : t.slice(at + 1);
    if (curve === null || !NUMBER.test(h) || Number(h) > 100) return null;
    /* every height names its place, or none does */
    if (placed === null) placed = at >= 0;
    else if (placed !== at >= 0) return null;
    if (at >= 0) {
      const x = t.slice(0, at);
      if (!NUMBER.test(x) || Number(x) > 100) return null;
      const place = Math.round(Number(x) * 10);
      if (places.length && place < places[places.length - 1]) return null;
      places.push(place);
    }
    if (heights.length) curved.push(curve);
    heights.push(Number(h) / 100);
    word = false;
  }
  if (word || heights.length < 2 || heights.length > AURORA_PATH_MOST) return null;
  if (!placed)
    return {
      heights,
      places: heights.map((_, i) => i / (heights.length - 1)),
      curved,
      placed: false
    };
  /* a height written twice at one place is one height; a wall at the box's very side has nothing beside it */
  const keep = heights.map((h, i) => !(i && places[i] === places[i - 1] && h === heights[i - 1]));
  if (keep[1] !== false && places[1] === 0) keep[0] = false;
  const end = heights.length - 1;
  if (keep[end] && places[end - 1] === 1000 && keep[end - 1]) keep[end] = false;
  /* a piece goes with the height it ends at, but for a first height dropped, whose piece goes with it */
  curved = curved.filter((_, k) => (keep[0] ? keep[k + 1] : k > 0 && keep[k + 1]));
  heights = heights.filter((_, i) => keep[i]);
  places = places.filter((_, i) => keep[i]);
  if (heights.length < 2) return null;
  /* no more than two heights stand at one place */
  for (let i = 2; i < places.length; i++) if (places[i] === places[i - 2]) return null;
  return {
    heights,
    places: places.map(x => x / 1000),
    curved: curved.map((c, k) => c && places[k + 1] > places[k]),
    placed: true
  };
}

/** Heights (0 to 1) as a path, each to the nearest tenth of a hundredth of the box's height; `curved` says of each
    piece whether a curve joins it, or of them all; `places` (0 to 1 across the box), where given and not the even
    spacing's own, are written before their heights. */
export function auroraPathOf(
  curved: boolean | readonly boolean[],
  heights: readonly number[],
  places?: readonly number[]
): string {
  const h = heights.slice(0, AURORA_PATH_MOST);
  const tenth = (v: number) => Math.round(clamp01(v) * 1000) / 10;
  const at = places?.map(tenth);
  const named = !!at && h.some((_, i) => Math.abs(at[i] - (100 * i) / (h.length - 1)) > 1e-9);
  const wall = (k: number) => named && !!at && at[k] === at[k + 1];
  /* a piece's joining; a wall has none of its own, and goes by the piece before it (the one after, at the start) */
  const of = (k: number): boolean => {
    let j = k;
    while (j > 0 && wall(j)) j--;
    while (j < h.length - 2 && wall(j)) j++;
    return typeof curved === "boolean" ? curved : curved[j] === true;
  };
  let out = "";
  for (let i = 0; i < h.length; i++) {
    /* the word before the first height is the first piece's; after it, one only where the joining changes */
    const piece = Math.max(0, i - 1);
    if (i === 0 || (i > 1 && of(piece) !== of(piece - 1)))
      out += `${i ? "," : ""}${of(piece) ? "curve" : "line"}`;
    out += `,${named && at ? `${at[i]}:` : ""}${tenth(h[i])}`;
  }
  return out;
}

/** The designed range, which a look that names no path draws: a jagged range that rises to a height left of the
    middle, dips at the middle and rises to a lower one on the right (aurora-path-kinds.ts makes it, the range of
    number 0, and aurora.test.ts holds the two together). Written out, so the server and every browser read the
    same heights whatever their sines round to. */
export const AURORA_DESIGNED_PATH =
  "line,40.9,42.5,43.9,41.8,40.3,38.9,38.4,36.6,36.8,38,39.8,42.3,42.3,43,45.5,47.4,47.8,45.8,44.7,43.9,40.2,36.8,33.2,34.5,36.6,38.2,40,40.5,42,43.5,43.9,44.8,45.7,43.3,41.5,37.6,36.4,37.6,37.7,38,41,41.3,41.6,41.8,41.6,42.2,43.9,42";

/** A path as a look keeps it: in its one spelling, and none for the designed range and for anything that is no
    path. A path with more than a wall at the box's very side is written with less than it was read with, so it is
    read and written until it reads as it is written: what a look keeps writes itself. */
export function auroraPath(value: unknown): string | null {
  let path = value;
  for (;;) {
    const parts = auroraPathParts(path);
    if (!parts) return null;
    /* heights written plainly stay plain: their even spacing is no tenth of the box's width to round to */
    const written = auroraPathOf(
      parts.curved,
      parts.heights,
      parts.placed ? parts.places : undefined
    );
    if (written === path) return written === AURORA_DESIGNED_PATH ? null : written;
    path = written;
  }
}
