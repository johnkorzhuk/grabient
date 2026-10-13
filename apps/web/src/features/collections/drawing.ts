import { decodePalette } from "@grabient/engine";
import { sampleStops } from "@grabient/engine/curve.ts";
import { seedName } from "@grabient/engine/name.ts";
import { effectiveView, parseSize, type Style, viewSearch } from "@grabient/engine/view.ts";
import { formatDate, locale, localHref, t } from "@grabient/i18n";
import type { ListView } from "./params.ts";
import type { CollectionSummary } from "./types.ts";

/* A collection's palettes as its pages draw them: each in the page's view over the one the collection saved it in, its
   stops sampled at that view's steps, named by its colors in the reader's language, with its age told against the
   minute the page's data was read, which the server and hydration share. */

export interface Shown {
  seed: string;
  style: Style;
  steps: number;
  angle: number;
}

/** A palette's saved view under the page's, its steps never fewer than its keyframes. */
export function drawnAs(item: Shown, view: ListView): Shown {
  const drawn = effectiveView(item, view);
  const keyframes = decodePalette(item.seed)?.anchors.length ?? 0;
  return { seed: item.seed, ...drawn, steps: Math.max(drawn.steps, keyframes) };
}

/* a page draws the same palettes again and again: their stops are kept by seed and steps, the oldest going first */
const KEPT = 1024;
const stops = new Map<string, readonly string[]>();
export function hexesOf(seed: string, steps: number): readonly string[] {
  const key = `${seed}:${steps}`;
  let found = stops.get(key);
  if (!found) {
    const palette = decodePalette(seed);
    found = palette ? sampleStops(palette, steps).map(stop => stop.hex) : [];
    if (stops.size >= KEPT) stops.delete(stops.keys().next().value!);
    stops.set(key, found);
  }
  return found;
}

/** What a palette's colors call it, in the reader's language. */
export const nameOf = (p: Shown): string =>
  seedName(p.seed, p.style, p.steps, { t, locale: locale() }) || t("Palette");

/** The palette's page in the view it is drawn in, at the reader's size, in the reader's language. */
export const paletteHref = (p: Shown, size: string | "auto"): string =>
  localHref(`/${p.seed}${viewSearch({ ...p, size: size === "auto" ? null : parseSize(size) })}`);

const MONTH_YEAR: Intl.DateTimeFormatOptions = { month: "short", year: "numeric", timeZone: "UTC" };
const DAY = 86_400;
/** How old, as a list says it. */
export function relativeAge(ms: number, now: number): string {
  const s = Math.max(1, Math.round((now - ms) / 1000));
  if (s < 3600)
    return t("{count, plural, one {# minute} other {# minutes}}", {
      count: Math.max(1, Math.floor(s / 60))
    });
  if (s < DAY)
    return t("{count, plural, one {# hour} other {# hours}}", { count: Math.floor(s / 3600) });
  if (s < DAY * 30)
    return t("{count, plural, one {# day} other {# days}}", { count: Math.floor(s / DAY) });
  if (s < DAY * 365)
    return t("{count, plural, one {# month} other {# months}}", {
      count: Math.floor(s / (DAY * 30))
    });
  return formatDate(ms, MONTH_YEAR);
}
/** The minute a page's data was read in: the clock its ages are told against. */
export const minuteOf = (ms: number): number => Math.floor(ms / 60_000) * 60_000;

/** Who made a collection, as a page names them: Grabient for an agent's (its name for an admin), an account by its
    display name, else @username. Never an account's id. */
export const ownerLabel = (owner: CollectionSummary["owner"], admin = false): string =>
  owner.kind === "agent"
    ? admin
      ? t("{name} (agent)", { name: owner.name ?? t("agent") })
      : "Grabient"
    : owner.display || (owner.name ? `@${owner.name}` : t("Grabient user"));
