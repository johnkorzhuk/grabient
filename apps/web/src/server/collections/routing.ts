import { decodePalette } from "@grabient/engine";
import { isLocale } from "@grabient/i18n";
import { collectionHref, typedCollection } from "../../features/collections/address.ts";
import {
  COLLECTION_LIMIT,
  frameOf,
  intIn,
  listSearch,
  pageSearch,
  viewOf
} from "../../features/collections/params.ts";
import { listWords } from "../../lib/words.ts";
import type { KeyRule } from "../cache-keys.ts";
import type { CanonicalRule } from "../canonical.ts";

/* The collections' addresses as the Worker reads them before any cache: each page's one canonical address, and the
   query that decides each public answer, so junk parameters never fill the edge cache with copies. */

const LISTS = new Set(["/collections", "/collections/rising", "/collections/saved"]);
const FRAMED = /^\/collections\/rising\/(1w|3m|1y)$/;
const SEED = /^k[A-Za-z0-9_-]{8,49}$/;
const OLD_ID = /^[_~][A-Za-z0-9_-]{6,}$/;

function split(address: string): [path: string, params: URLSearchParams] {
  const at = address.indexOf("?");
  return at < 0
    ? [address, new URLSearchParams()]
    : [address.slice(0, at), new URLSearchParams(address.slice(at + 1))];
}

/** A collections list: its order is its path, so an old `?sort=` leads to the path that means it (`newest` and the
    rest to Rising), the week's frame named outright to Rising's own address, and the query to its one order with a
    public page's size kept to 12 to 24. */
const listAddress: CanonicalRule = address => {
  const [path, params] = split(address);
  const framed = FRAMED.exec(path);
  if (!LISTS.has(path) && !framed) return null;
  const sort = params.get("sort");
  const rising =
    path === "/collections" && params.has("sort") && sort !== "popular" && sort !== "hot";
  const frame = framed ? frameOf(framed[1]) : "1w";
  const at = rising
    ? "/collections/rising"
    : framed
      ? frame === "1w"
        ? "/collections/rising"
        : `/collections/rising/${frame}`
      : path;
  return (
    at +
    listSearch(
      {
        query: listWords(params.get("q") ?? params.get("query")),
        view: viewOf(params),
        page: intIn(params.get("page"), 1, 10_000) ?? 1,
        limit: intIn(params.get("limit"), 12, COLLECTION_LIMIT) ?? COLLECTION_LIMIT
      },
      params.has("selection")
    )
  );
};

/** A collection's address as it was typed (`/Ocean_Depths`, `/Ocean%20Gradients`) leads to its slug, a handle keeping
    its underscores, and its query to the view in its one order with the selection last. An old link's order
    (`?sort=newest`) stays for the page's loader, which knows whether a collection lives there: it leads words that
    name none to the search in that order in one step. A seed's address and an old id are the editor's, and any other
    address is no collection's. */
const collectionAddress: CanonicalRule = address => {
  const [path, params] = split(address);
  const first = path.slice(1).split("/")[0] ?? "";
  if ((SEED.test(first) && decodePalette(first)) || OLD_ID.test(first)) return null;
  const at = typedCollection(path);
  if (!at) return null;
  const href = collectionHref(at.slug, at.order);
  if (!at.slug.startsWith("@") && params.has("sort")) return href + address.slice(path.length);
  return href + pageSearch(viewOf(params), params.has("selection"));
};

export const collectionRules: readonly CanonicalRule[] = [listAddress, collectionAddress];

const pick = (kept: Record<string, string | null | false>) => {
  const out = new URLSearchParams();
  for (const [name, value] of Object.entries(kept)) if (value) out.set(name, value);
  return out;
};
/* an answer's language: a translated one's own, never English or anything else */
const lang = (params: URLSearchParams) => {
  const asked = params.get("lang");
  return isLocale(asked) && asked !== "en" ? asked : null;
};

/** What decides each public collections answer. The list and its searches: the words as a list's address writes them,
    the order and its frame, the page and its size, a reader's search (which may read the model), the language. The
    tags: the words as typed, how many, the language. One collection: its language alone. */
export const collectionKeyRules: readonly KeyRule[] = [
  {
    match: path => path === "/api/collections",
    query: params => {
      const sort = params.get("sort");
      const known = sort === "popular" || sort === "rising" || sort === "hot" || sort === "oldest";
      return pick({
        q: listWords(params.get("q")),
        sort: known && sort,
        frame:
          sort === "rising" &&
          frameOf(params.get("frame")) !== "1w" &&
          frameOf(params.get("frame")),
        page: String(intIn(params.get("page"), 1, 10_000) ?? 1),
        limit: String(intIn(params.get("limit"), 12, COLLECTION_LIMIT) ?? COLLECTION_LIMIT),
        model: params.get("model") === "1" && "1",
        lang: lang(params)
      });
    }
  },
  {
    match: path => path === "/api/collections/suggest",
    query: params => {
      const limit = Math.max(1, Math.min(24, Math.floor(Number(params.get("limit") ?? 12)) || 12));
      return pick({
        q: listWords(params.get("q")),
        limit: String(limit),
        lang: lang(params)
      });
    }
  },
  {
    match: path => path.startsWith("/api/collections/"),
    query: params => pick({ lang: lang(params) })
  }
];
