/* A search a reader made with Enter, counted for the Popular tags (server/search/counts.ts): the words and the page they
   were searched on, once per words and page in this tab. Nothing waits on it and nothing is shown; the Worker keeps only
   words, with no address, account or cookie. A tag pressed is a link and never comes here, nor do a palette, colors
   from a picture, Saved or an account's own collections. */
import { isServer } from "@solidjs/web";
import type { SearchPage } from "./bodies.ts";

const sent = new Set<string>();
const keyOf = (words: string, page: SearchPage) =>
  `${page}\n${words.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase()}`;

export function countSearch(words: string, page: SearchPage): void {
  const key = keyOf(words, page);
  if (isServer || !words.trim() || sent.has(key)) return;
  sent.add(key);
  // counting never stands in a search's way
  fetch("/api/searched", {
    method: "POST",
    keepalive: true,
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ words, page })
  }).catch(() => {});
}

/** These words were searched with Enter on this page in this tab: a palette used from their results answers them. */
export const searchedHere = (words: string, page: SearchPage): boolean =>
  sent.has(keyOf(words, page));
