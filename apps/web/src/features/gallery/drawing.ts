import { decodePalette } from "@grabient/engine";
import { sampleStops } from "@grabient/engine/curve.ts";
import { seedName } from "@grabient/engine/name.ts";
import { effectiveView, parseSize, type Style, viewSearch } from "@grabient/engine/view.ts";
import { formatDate, locale, localHref, t } from "@grabient/i18n";
import { madePalettes, madeView } from "@grabient/search/colors.ts";
import type { ListView } from "./address.ts";
import type { PaletteItem } from "./schema.ts";

/* A palette as a list draws it: in the list's view over its own, its stops sampled at that view's steps, named by
   its colors in the reader's language, and the way into its editor in that view. */

export interface Shown {
  seed: string;
  style: Style;
  steps: number;
  angle: number;
}

/** A palette's own view under a list's, its steps never fewer than its keyframes. */
export function drawnAs(item: Shown, view: ListView): Shown {
  const drawn = effectiveView(item, view);
  const keyframes = decodePalette(item.seed)?.anchors.length ?? 0;
  return { seed: item.seed, ...drawn, steps: Math.max(drawn.steps, keyframes) };
}

/* A page reads the same palettes again and again, and each reading samples and fits the whole curve: the hexes are
   kept by seed and steps, the oldest going first. */
const HEXES_KEPT = 1024;
const hexes = new Map<string, readonly string[]>();
export function hexesOf(seed: string, steps: number): readonly string[] {
  const key = `${seed}:${steps}`;
  let stops = hexes.get(key);
  if (!stops) {
    const palette = decodePalette(seed);
    stops = palette ? sampleStops(palette, steps).map(stop => stop.hex) : [];
    if (hexes.size >= HEXES_KEPT) hexes.delete(hexes.keys().next().value!);
    hexes.set(key, stops);
  }
  return stops;
}

/** What a palette's colors call it, in the reader's language. */
export const nameOf = (p: Shown): string =>
  seedName(p.seed, p.style, p.steps, { t, locale: locale() }) || t("Palette");

/** The palette's page in the view it is drawn in, at the size the reader set, in the reader's language. */
export const paletteHref = (p: Shown, size: string | "auto"): string =>
  localHref(`/${p.seed}${viewSearch({ ...p, size: size === "auto" ? null : parseSize(size) })}`);

/* Past a year an age is the month and year in UTC, as grabient.com wrote it. */
const MONTH_YEAR: Intl.DateTimeFormatOptions = { month: "short", year: "numeric", timeZone: "UTC" };
const DAY = 86_400;

/** How old, as a list says it, against a minute-grained clock both sides share. */
export function relativeAge(ms: number, now: number): string {
  const s = Math.max(1, Math.round((now - ms) / 1000));
  if (s < 3600) {
    return t("{count, plural, one {# minute} other {# minutes}}", {
      count: Math.max(1, Math.floor(s / 60))
    });
  }
  if (s < DAY)
    return t("{count, plural, one {# hour} other {# hours}}", { count: Math.floor(s / 3600) });
  if (s < DAY * 30)
    return t("{count, plural, one {# day} other {# days}}", { count: Math.floor(s / DAY) });
  /* twelve thirty-day months fall short of a year: from then on it is the month it was */
  if (s < DAY * 360) {
    return t("{count, plural, one {# month} other {# months}}", {
      count: Math.floor(s / (DAY * 30))
    });
  }
  return formatDate(ms, MONTH_YEAR);
}

/** The clock ages are told against: the minute the page's data was read in, so the server and hydration agree. */
export const minuteOf = (ms: number): number => Math.floor(ms / 60_000) * 60_000;

/** The palettes a search's colors make, as cards draw them: each in the view its place in the row starts in, liked by
    nobody yet and held by no list, so it tells no age. */
export const madeItems = (colors: readonly string[]): PaletteItem[] =>
  madePalettes(colors).map((seed, place) => ({
    kseed: seed,
    ...madeView(seed, place),
    likes: 0,
    createdAt: 0
  }));
