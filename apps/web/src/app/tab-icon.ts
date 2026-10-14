import { decodePalette } from "@grabient/engine/codec.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { dominantColors } from "@grabient/engine/dominant.ts";
import { type MarkScheme, markSvg, markWeek, svgDataUrl, weekPicture } from "@grabient/ui/mark.ts";
import type { Frame } from "./shell.ts";

/* The tab's icon: the mark, the wordmark's bar along the icon's foot (@grabient/ui/mark.ts). A page whose address
   names what it shows wears the colors it paints: a palette on its page, a collection on its page, a search on its
   list. Every other page wears the week's, whose files take a new address each week. The server writes the first
   icon into the head from what the page's loader paints (routes/__root.tsx), and the frame keeps it with the page
   from then on (Shell.tsx), loading this module when the icon first changes.

   The head names a light icon and a dark one. Chrome draws an SVG icon once, in the scheme it had, and keeps the
   picture by its address, so each scheme has an address of its own; Firefox takes the last one and draws it live,
   so the dark one holds both schemes. Safari and Google Search take the fixed tile the head names beside them. */

/** A page as its icon reads it. */
export interface Tab {
  frame: Frame;
  /** the page's path, without its language */
  path: string;
  /** what the page searches for, or nothing */
  words: string;
  /** the palettes the page paints, by seed, in its order */
  seeds: readonly string[];
}

/** A palette's icon reads its whole curve at this many points, more than a tab's bar can tell apart, whatever steps
    its page draws. */
const ICON_STOPS = 16;
/** The lists' own addresses: the home, the palettes and the collections in each order. */
const LIST = /^\/(?:palettes|collections)?(?:\/|$)/;

function along(seed: string): string[] {
  const palette = decodePalette(seed);
  return palette ? sampleStops(palette, ICON_STOPS).map(stop => stop.hex) : [];
}

/** The colors a page's icon wears, or none where it wears the week's. One palette is read along its curve, several
    by the colors they share most; a search by a palette wears that palette. */
export function iconColors(tab: Tab): readonly string[] {
  if (tab.frame !== "app") return [];
  const like = along(tab.words);
  if (like.length) return like;
  if (!tab.words && LIST.test(tab.path)) return [];
  return tab.seeds.length === 1 ? along(tab.seeds[0]) : dominantColors(tab.seeds);
}

/* the week's addresses, kept for the last week asked: its picture's name is a hash of both drawings */
let weekly: { week: string; hrefs: Record<MarkScheme, string> } | undefined;

/** Where a browser of each scheme reads the icon: the mark in these colors as data addresses, the light one drawn
    for its scheme alone, or with no colors the week's files, whose `v` names their picture. */
export function iconHrefs(colors: readonly string[], week: string): Record<MarkScheme, string> {
  if (colors.length) {
    return { light: svgDataUrl(markSvg(colors, "light")), dark: svgDataUrl(markSvg(colors)) };
  }
  if (weekly?.week !== week) {
    const v = weekPicture(week);
    weekly = {
      week,
      hrefs: { light: `/favicon/${week}.svg?v=${v}`, dark: `/favicon/${week}-dark.svg?v=${v}` }
    };
  }
  return weekly.hrefs;
}

/** The head's two icons for a page, as the server writes them. */
export function iconLinks(tab: Tab, now = Date.now()) {
  const hrefs = iconHrefs(iconColors(tab), markWeek(now));
  return (["light", "dark"] as const).map(scheme => ({
    rel: "icon",
    href: hrefs[scheme],
    type: "image/svg+xml",
    sizes: "any",
    media: `(prefers-color-scheme: ${scheme})`
  }));
}

/** An edit changes a palette's page many times a second, and a browser fetches and keeps every icon it is given. */
const WRITE_MS = 350;
const links = () =>
  document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
/* the week the first page named, which a tab left open past Sunday keeps */
let week: string | undefined;
let wanted: Tab | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let written = 0;

function write() {
  timer = undefined;
  written = Date.now();
  if (!wanted) return;
  week ??=
    /\/favicon\/(\d{4}-w\d{2})/.exec(links()[0]?.getAttribute("href") ?? "")?.[1] ??
    markWeek(written);
  const hrefs = iconHrefs(iconColors(wanted), week);
  for (const link of links()) {
    const href = hrefs[link.media.includes("dark") ? "dark" : "light"];
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
  }
}

/** Sets the tab's icon to a page's, in the browser: the first of a burst at once, then at most one in WRITE_MS, the
    last always. */
export function showIcon(tab: Tab): void {
  wanted = tab;
  if (timer === undefined)
    timer = setTimeout(write, Math.max(0, WRITE_MS - (Date.now() - written)));
}
