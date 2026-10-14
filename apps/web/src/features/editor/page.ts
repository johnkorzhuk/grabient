import { env } from "cloudflare:workers";
import type { ParamReader } from "@grabient/engine/view.ts";
import { DEFAULT_LOCALE, locale } from "@grabient/i18n";
import { createIsomorphicFn } from "@tanstack/solid-start";
import { createStore, lazy } from "solid-js";
import { DEFAULT_FRAME, type RisingFrame } from "../../lib/orders.ts";
import { heading, headOf, type PageMeta, pageMeta } from "../../lib/page-meta.ts";
import { getJson } from "../../lib/query.ts";
import { paletteFacts } from "../../server/editor/facts.ts";
import { framesOffered } from "../../server/gallery/home.ts";
import { isSeed, readSeedPage, type SeedPage } from "./address.ts";
import { PaletteFacts } from "./facts.ts";
import { metaPage, STATIC_CSS } from "./StaticPalette.tsx";

/* A palette's page as its route reads it. The server reads what only the database knows of the palette, once, for the
   page it renders (its title, the static page crawlers read, its Markdown), and which of Rising's frames are on. A
   palette the browser opens later has the same facts in English, the only language its written words are worn in,
   asked for as a reader reaches its card, or else as its page opens; one an edit makes is named by its colors and asks
   the server nothing. */

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

/* The facts the server told this tab of the palettes it opened or may open next, by seed: the answers on their way, and
   each answer once it has come, which the editor draws from as it lands. The page is read again with each change of
   view and on Back, Forward or an undo, and a palette's written title outlasts them. The last few are kept. Only the
   browser writes them. */
const KNOWN_KEPT = 40;
/** How long a press waits for an answer asked for ahead of it before its page opens named by its colors: a moment,
    since the editor takes an answer that comes later as it lands. */
const ASK_MS = 150;
const known = new Map<string, Promise<PaletteFacts | null>>();
const [settled, setSettled] = createStore<Record<string, PaletteFacts>>({});
function know(seed: string, facts: Promise<PaletteFacts | null>) {
  known.delete(seed);
  known.set(seed, facts);
  const oldest = known.size > KNOWN_KEPT ? known.keys().next().value : undefined;
  if (oldest) known.delete(oldest);
  // written as the answer comes, never while a component that hands one in is drawn
  void facts.then(came =>
    setSettled(draft => {
      if (oldest) delete draft[oldest];
      if (came && known.get(seed) === facts) draft[seed] = came;
    })
  );
}
/** What the server said of a palette this tab asked about, once its answer has come: reactive. */
export const factsOf = (seed: string): PaletteFacts | undefined => settled[seed];
/** The editor hands in the data it opened with: the server's facts, where the document came with them. */
export function keepFacts(data: PaletteData) {
  if (data.facts) know(data.page.seed, Promise.resolve(data.facts));
}
/** In the browser, in English, asks the server what it knows of a palette a press may open: as the pointer, the focus
    or a tap reaches its card, so the answer is in by the press, and else as its page opens. Never of a palette an
    edit made: its history entry names the palette its page opened on, which is another. */
export function askFacts(seed: string, state?: unknown): void {
  const opened = (state as { edits?: { opened?: unknown } } | undefined)?.edits?.opened;
  const made = opened !== undefined && opened !== seed;
  if (known.has(seed) || made || locale() !== DEFAULT_LOCALE || !isSeed(seed)) return;
  know(
    seed,
    getJson(`/api/palette-facts?${new URLSearchParams({ seed })}`, PaletteFacts).catch(() => {
      // asked again the next time
      known.delete(seed);
      return null;
    })
  );
}

/* The server reads the facts and names the palette once, for the head and the static page, and the page carries
   them: naming a palette takes a phone a moment, which the browser starting on the page spends on nothing. A palette
   the browser opens or makes later is named there, as it is drawn, by the facts it was given. */
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
  .client(async (page: SeedPage) => {
    const asked = known.get(page.seed);
    if (!asked) return { facts: null };
    const late = new Promise<null>(done => setTimeout(done, ASK_MS, null));
    return { facts: await Promise.race([asked, late]) };
  });

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
    server's facts while they are this palette's: those its page was read with, or those the tab was told since. */
export const paletteHead = (data: PaletteData) => ({
  ...headOf(
    data.meta ?? pageMeta(metaPage(data.page, data.facts ?? factsOf(data.page.seed) ?? null))
  ),
  styles: [{ children: STATIC_CSS }]
});

/** The tab's title for a palette's page, as its head writes it. */
export const paletteTitle = (page: SeedPage, facts: PaletteFacts | null): string =>
  pageMeta(metaPage(page, facts)).title;

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
