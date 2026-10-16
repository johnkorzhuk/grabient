import { seedName } from "@grabient/engine/name.ts";
import { type SizeChoice, type Style, viewSearch } from "@grabient/engine/view.ts";
import { DEFAULT_LOCALE, formatDate, locale, localHref, t } from "@grabient/i18n";
import { madePalettes, madeView } from "@grabient/search/colors.ts";
import type { Drawn } from "../../lib/palette.ts";
import type { CollectionSummary } from "../collections/types.ts";
import { drawnIn, type ListView, type ViewDraft } from "../list/appearance.ts";
import type { PaletteItem } from "./schema.ts";

/* What a list says of a palette beside its picture: its name by its colors in the reader's language, its age, and the
   way into its editor in the view the list draws it in (the frame's drawnIn). And what a page hands the frame to
   paint its bar and its water with. */

/** A list's palette as it was saved: what the list's view is laid over. */
export const ownOf = (item: Pick<PaletteItem, "kseed" | "style" | "steps" | "angle">): Drawn => ({
  seed: item.kseed,
  style: item.style,
  steps: item.steps,
  angle: item.angle
});

/** A palette's picture while the header's control sets the list's view: the steps and angle on their way to the
    address at once, and the style a tile previews. Its link, name and selection keep the address's view. */
export function picturedAs(
  own: Drawn,
  view: ListView,
  draft: ViewDraft | null,
  peek: Style | null
): Drawn {
  const drawn = drawnIn(own, view, draft);
  return peek ? { ...drawn, style: peek } : drawn;
}

/** The frame reads at most this many of a page's palettes. */
const PAINTED = 8;

/** The palettes a list has on screen first, as the list draws them: what the frame paints. */
export const paintOf = (
  items: readonly Pick<PaletteItem, "kseed" | "style" | "steps" | "angle">[],
  view: ListView
): Drawn[] => items.slice(0, PAINTED).map(item => drawnIn(ownOf(item), view));

/** The home's: its head's palettes, then the first two of each collection, as a searched home may hold no head. */
export const homePaint = (
  head: readonly PaletteItem[],
  groups: readonly Pick<CollectionSummary, "preview">[],
  view: ListView
): Drawn[] =>
  paintOf(
    [
      ...head.slice(0, PAINTED),
      ...groups
        .slice(0, PAINTED)
        .flatMap(group => group.preview.slice(0, 2).map(p => ({ ...p, kseed: p.seed })))
    ],
    view
  );

/* Naming reads a palette's colors at many points, and a card says its name twice and again when the feed draws it
   live: kept by language, seed and view, the oldest going first. */
const NAMES_KEPT = 1024;
const names = new Map<string, string>();
/** What a palette's colors call it, in the reader's language. */
export function nameOf(p: Drawn): string {
  const language = locale();
  const key = `${language}:${p.seed}:${p.style}:${p.steps}`;
  let name = names.get(key);
  if (name === undefined) {
    name = seedName(p.seed, p.style, p.steps, { t, locale: language }) || t("Palette");
    if (names.size >= NAMES_KEPT) names.delete(names.keys().next().value!);
    names.set(key, name);
  }
  return name;
}

/** What a list's card calls a palette: in English, the title written for it while the card draws it as it was listed,
    the one view its page wears that title in; else what its colors call it. */
export const cardName = (item: Pick<PaletteItem, "style" | "steps" | "title">, shown: Drawn) =>
  item.title && locale() === DEFAULT_LOCALE && shown.style === item.style && shown.steps === item.steps
    ? item.title
    : nameOf(shown);

/** The palette's page in the view it is drawn in, at the size the reader set, in the reader's language. */
export const paletteHref = (p: Drawn, size: SizeChoice | null): string =>
  localHref(`/${p.seed}${viewSearch({ ...p, size })}`);

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
