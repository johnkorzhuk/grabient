import { decodePalette } from "@grabient/engine";
import { colorName } from "@grabient/engine/colorname.ts";
import { t } from "@grabient/i18n";
import { pageOf, type SavedItem, savedItems, type View } from "./model.ts";
import { accountForCopy, copyEngine } from "./session.ts";

/* Saved (/palettes/saved) drawn from the account's copy, once the copy has heard from the server: the account's likes,
   the latest first, paged as the server pages them. Online, words are the server's to rank (/api/saved); offline, the
   copy finds the palettes whose colors' names hold every word, in English or the reader's language. The Saved page
   loads this module; the counts are as old as the sync that brought each like, and are asked again as a list's are. */

/** The palettes of the account's keyframes' color names, said both ways. */
function colorWords(seed: string): string {
  const palette = decodePalette(seed);
  if (!palette) return "";
  const names = new Set(palette.anchors.map(a => colorName(a.l, a.c, a.own ?? a.h)));
  return [...names]
    .flatMap(name => [name, t(name)])
    .join(" ")
    .toLowerCase();
}
const matches = (seed: string, query: string) => {
  const words = colorWords(seed);
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every(word => words.includes(word));
};

export interface SavedPage {
  items: readonly SavedItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /** a search's words, answered by the copy's color names */
  query?: string;
  tier?: "offline";
}

/** A page of Saved from a view of the copy. With words, only offline: online, null, and the page asks the server. */
export function savedPageOf(
  view: View,
  params: { page: number; limit: number; query?: string },
  offline: boolean
): SavedPage | null {
  const query = params.query ?? "";
  if (query && !offline) return null;
  const all = query
    ? savedItems(view).filter(item => matches(item.kseed, query))
    : savedItems(view);
  return {
    ...pageOf(all, params.page, params.limit),
    ...(query ? { query, tier: "offline" as const } : {})
  };
}

/** Whether Saved can be drawn from the copy: the account is known, its copy open here and heard from the server, a
    browser new to the account having waited for its first sync, three seconds at most. A copy older than half a
    minute syncs behind the page. False: the page reads /api/saved. */
export async function savedReady(): Promise<boolean> {
  const user = await accountForCopy();
  if (!user) return false;
  const sync = await copyEngine();
  await sync.copySettled(user);
  if (!sync.copyReady(user)) return false;
  sync.freshen(user);
  return true;
}
