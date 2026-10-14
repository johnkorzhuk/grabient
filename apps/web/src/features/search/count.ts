/* A search a reader made with Enter, counted for the Popular tags (server/search/counts.ts): the words and the page they
   were searched on, once per words and page in this tab. Nothing waits on it and nothing is shown; the Worker keeps only
   words, with no address, account or cookie. A tag pressed is a link and never comes here, nor do a palette, colors
   from a picture, Saved or an account's own collections. Where analytics is on, GA4 hears the search, the tag pressed
   and what a search found. */
import { isServer } from "@solidjs/web";
import { trackEvent } from "../analytics/analytics.ts";
import type { SearchPage } from "./bodies.ts";

const sent = new Set<string>();
const keyOf = (words: string, page: SearchPage) =>
  `${page}\n${words.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase()}`;

export function countSearch(words: string, page: SearchPage): void {
  const key = keyOf(words, page);
  if (isServer || !words.trim() || sent.has(key)) return;
  sent.add(key);
  trackEvent("search", { search_term: words, surface: page });
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

/* the searches a tag led to in this tab, and the answers already told, by words and page */
const tagged = new Set<string>();
const answered = new Set<string>();

/** A tag under the search pressed: which, and where it stood. The answer that follows says a tag asked for it. */
export function tagPressed(tag: { label: string; href?: string }, index: number, page: SearchPage) {
  let words = tag.label;
  try {
    words = new URL(tag.href ?? "", location.origin).searchParams.get("q") ?? words;
  } catch {
    // a tag with no address searches its label
  }
  tagged.add(keyOf(words, page));
  trackEvent("select_tag", { tag: tag.label, position: index, surface: page });
}

/** What a search found, once its answer is the page's: the kind of search, how its words were read and how many it
    found, once per words and page in this tab. */
export function searchAnswered(
  words: string,
  page: SearchPage,
  found: {
    kind?: "image" | "palette" | "colors";
    tier?: string;
    results: number;
    collections?: number;
  }
): void {
  const key = keyOf(words, page);
  if (isServer || !words || answered.has(key)) return;
  answered.add(key);
  trackEvent("view_search_results", {
    search_term: words,
    search_type: tagged.has(key) ? "tag" : (found.kind ?? "words"),
    ...(found.tier ? { tier: found.tier } : {}),
    results: found.results,
    ...(found.collections !== undefined ? { collections: found.collections } : {}),
    surface: page
  });
}
