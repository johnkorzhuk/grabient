import type { ParamReader } from "@grabient/engine/view.ts";
import { locale } from "@grabient/i18n";
import { createIsomorphicFn } from "@tanstack/solid-start";
import { pageHead } from "../../lib/page-meta.ts";
import { type PaletteFacts, paletteFacts } from "../../server/editor/facts.ts";
import { readSeedPage, type SeedPage } from "./address.ts";

/* A palette's page as its route reads it. The server reads what only the database knows of the palette, once, for the
   page it renders (its title, the static page crawlers read, its Markdown); a palette the browser opens or makes
   later is named by its colors, and asks the server nothing. */

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

const factsFor = createIsomorphicFn()
  .server((page: SeedPage) => paletteFacts(page.seed, page.palette, locale()))
  .client((): PaletteFacts | null => null);

export interface PaletteData {
  page: SeedPage;
  facts: PaletteFacts | null;
}

/** The route's data for a palette's address, or null when the address is no palette's. */
export async function paletteData(
  id: string,
  search: Readonly<Record<string, unknown>>
): Promise<PaletteData | null> {
  const page = readSeedPage(id, searchReader(search));
  return page && { page, facts: await factsFor(page) };
}

/** The page's head: its title, description, canonical, card and structured data, from its palette and view, with the
    server's facts while they are this palette's. */
export const paletteHead = (data: PaletteData) =>
  pageHead({
    kind: "palette",
    seed: data.page.seed,
    palette: data.page.palette,
    view: data.page.view,
    ...(data.facts?.written ? { written: data.facts.written } : {}),
    heldBy: data.facts?.heldBy ?? []
  });
