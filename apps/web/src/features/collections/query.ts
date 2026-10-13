import { decodePalette, encodePalette } from "@grabient/engine";
import { delocalizePath } from "@grabient/i18n";
import { slugWords, typedCollection } from "./address.ts";
import {
  COLLECTION_LIMIT,
  type CollectionListParams,
  frameOf,
  intIn,
  OWN_COLLECTION_LIMIT
} from "./params.ts";

/* The words a collections search is asked for, as every address and answer writes them, so one search has one
   address and one cache key. */

const QUERY_MAX = 100;
const OLD_ID = /^[_~][A-Za-z0-9_-]{6,}$/;
const LIST_PAGE = /^\/(?:(?:palettes|collections)(?:\/rising(?:\/(?:3m|1y))?|\/saved)?)?$/;
const PALETTE_HOSTS = new Set([
  "grabient.com",
  "www.grabient.com",
  "grabient-lite.jkorzhuk.workers.dev",
  "grabient4.jkorzhuk.workers.dev"
]);

/** Words as a search takes them: compatibility forms, one space, at most a hundred characters, no control characters;
    "" for anything else. */
export function collectionQuery(raw: string | null | undefined): string {
  const q = (raw ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what is refused
  return q.length > QUERY_MAX || /[\u0000-\u001f\u007f]/u.test(q) ? "" : q;
}

/** A palette named in place of words: its canonical seed, or an old grabient.com id as it was written. */
export function paletteId(raw: string): string | null {
  const palette = decodePalette(raw);
  return palette ? encodePalette(palette) : OLD_ID.test(raw) ? raw : null;
}

/** Whether text reads as an address: with its scheme, a host and a path, or a path of this site. */
export const looksLikeLink = (raw: string): boolean =>
  /^\s*(?:https?:\/\/|[^/\s]+\.[^/\s]+\/|\/)/i.test(raw);

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/* What a Grabient link searches for: the palette it names (its page in any language, its /edit, a file of it), or the
   words of a list's address or of a collection's. "" for a link off the site or to a page that names neither. */
function linkQuery(raw: string): string {
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(
      /^https?:\/\//i.test(value)
        ? value
        : value.startsWith("/")
          ? `https://grabient.com${value}`
          : `https://${value}`
    );
  } catch {
    return "";
  }
  if (!PALETTE_HOSTS.has(url.hostname.toLowerCase()) && !value.startsWith("/")) return "";
  const path = delocalizePath(url.pathname).path;
  if (/^\/api\/(?:og|png|palette(?:\.json)?)$/.test(path))
    return paletteId(url.searchParams.get("seed") ?? "") ?? "";
  const page = path.replace(/\.(?:png|svg|json|md)$/, "");
  const one = /^\/([^/]+?)(?:\/edit)?\/?$/.exec(page);
  const named = one && paletteId(safeDecode(one[1]!));
  if (named) return named;
  const asked = url.searchParams.get("q") ?? url.searchParams.get("query");
  if (asked && LIST_PAGE.test(page)) return listQuery(asked);
  const collection = typedCollection(page);
  return collection ? listQuery(slugWords(collection.slug)) : "";
}

/** The words of a search as a list's address writes them: lowercase, a palette as its seed in its own case, a Grabient
    link as what it names. "" when there is nothing to search for. */
export function listQuery(raw: string | null | undefined): string {
  if (!raw) return "";
  if (looksLikeLink(raw)) return linkQuery(raw);
  const q = collectionQuery(raw);
  return q && (paletteId(q) ?? q.toLowerCase());
}

/** A collections list's query as its address or the API sends it. A public list's page is 12 to COLLECTION_LIMIT
    collections, anything else the default; an account's own list reads up to `maxLimit` at once. */
export function collectionParams(
  params: URLSearchParams,
  maxLimit = COLLECTION_LIMIT
): CollectionListParams {
  const sort = params.get("sort");
  return {
    query: listQuery(params.get("q")),
    sort:
      sort === "oldest" || sort === "popular" || sort === "hot" || sort === "rising"
        ? sort
        : "newest",
    frame: sort === "rising" ? frameOf(params.get("frame")) : undefined,
    page: intIn(params.get("page"), 1, 10_000) ?? 1,
    limit: intIn(params.get("limit"), 12, maxLimit) ?? COLLECTION_LIMIT
  };
}
export const ownParams = (params: URLSearchParams) =>
  collectionParams(params, OWN_COLLECTION_LIMIT);
