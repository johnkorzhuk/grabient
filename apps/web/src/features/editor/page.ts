import { env } from "cloudflare:workers";
import type { ParamReader } from "@grabient/engine/view.ts";
import { locale } from "@grabient/i18n";
import { createIsomorphicFn } from "@tanstack/solid-start";
import { lazy } from "solid-js";
import { DEFAULT_FRAME, type RisingFrame } from "../../lib/orders.ts";
import { heading, headOf, type PageMeta, pageMeta } from "../../lib/page-meta.ts";
import { type PaletteFacts, paletteFacts } from "../../server/editor/facts.ts";
import { framesOffered } from "../../server/gallery/home.ts";
import { readSeedPage, type SeedPage } from "./address.ts";
import { metaPage, STATIC_CSS } from "./StaticPalette.tsx";

/* A palette's page as its route reads it. The server reads what only the database knows of the palette, once, for the
   page it renders (its title, the static page crawlers read, its Markdown), and which of Rising's frames are on; a
   palette the browser opens or makes later is named by its colors, and asks the server nothing. */

/** The router's search object as an address reads it: a number the router parsed is its digits again. */
export const searchReader = (search: Readonly<Record<string, unknown>>): ParamReader => ({
  get: name => {
    const value = search[name];
    return value === undefined || value === null
      ? null
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  }
});

/* The server reads the facts and names the palette once, for the head and the static page, and the page carries
   them: naming a palette takes a phone a moment, which the browser starting on the page spends on nothing. A palette
   the browser opens or makes later is named there, as it is drawn. */
const read = createIsomorphicFn()
  .server(async (page: SeedPage) => {
    const [facts, frames] = await Promise.all([
      paletteFacts(page.seed, page.palette, locale()),
      /* a flag's read is the isolate's own, kept a few seconds: the week's alone where it fails */
      framesOffered(env).catch((): RisingFrame[] => [DEFAULT_FRAME])
    ]);
    const meta = metaPage(page, facts);
    return { facts, frames, meta: pageMeta(meta), heading: heading(meta) };
  })
  .client(async (_page: SeedPage) => ({ facts: null }));

export interface PaletteData {
  page: SeedPage;
  facts: PaletteFacts | null;
  /** Rising's frames an admin has left on, as the server told the document: the sheet's order says them */
  frames?: RisingFrame[];
  /** the page's metadata and heading as the server wrote them */
  meta?: PageMeta;
  heading?: string;
}

/** The route's data for a palette's address, or null when the address is no palette's. */
export async function paletteData(
  id: string,
  search: Readonly<Record<string, unknown>>
): Promise<PaletteData | null> {
  const page = readSeedPage(id, searchReader(search));
  return page && { page, ...(await read(page)) };
}

/** The page's head: its title, description, canonical, card and structured data, from its palette and view, with the
    server's facts while they are this palette's. */
export const paletteHead = (data: PaletteData) => ({
  ...headOf(data.meta ?? pageMeta(metaPage(data.page, data.facts))),
  styles: [{ children: STATIC_CSS }]
});

/** A window this wide or less has no room for a side: the controls follow the strip, under the first screen. */
export const NARROW = 900;

/** The sheet, under the first screen. */
export const Sheet = lazy(() => import("./Sheet.tsx").then(m => ({ default: m.Sheet })));

/** The editor's code, asked for as soon as a palette's page starts. Beside the page the sheet's name shows under the
    picture and sizes it, so there the sheet's code comes with the editor's, and the first screen is whole from its
    first frame. */
export const loadEditor = () =>
  Promise.all([
    import("./Editor.tsx"),
    matchMedia(`(min-width: ${NARROW + 1}px)`).matches ? Sheet.preload() : null
  ]).then(([editor]) => editor);
