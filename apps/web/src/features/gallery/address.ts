import {
  DEFAULT_FRAME,
  framePath,
  isFrame,
  type Order,
  parseSort,
  type RisingFrame
} from "../../lib/orders.ts";
import { listWords, looksLikeLink, paletteId, readLink } from "../../lib/words.ts";
import { COLLECTION_LIMIT } from "../collections/params.ts";
import { type ListView, readListView, viewParams } from "../list/appearance.ts";

/* The gallery's addresses: the home (`/`), the palette lists (/palettes, /palettes/rising in its frames,
   /palettes/saved), what each says in its query, and the one canonical form of each. A list's query is its words (`q`),
   the view its cards draw in, its page and page size, then `selection` with no value while the selection is shown:
   defaults left out, unknown parameters dropped, always in that order. The Worker sends every other form of these
   addresses, and the old ones, to the canonical one (canonicalGallery), so no cache keeps a copy per spelling. */

export const LIST_PATHS = {
  popular: "/palettes",
  rising: "/palettes/rising",
  saved: "/palettes/saved"
} as const;
const DEFAULT_LIMIT = 24;
const LIMIT_MIN = 12;
const LIMIT_MAX = 96;
const PAGE_MAX = 1_000_000;

/** What a list's address says: its words, the view its cards draw in (the frame's), its page and its size. */
export interface ListParams extends ListView {
  words: string;
  page: number;
  limit: number;
  selection: boolean;
}

/** What a gallery address is. */
export type GalleryPlace =
  | { kind: "home"; params: ListParams }
  | { kind: "list"; order: "popular" | "rising"; frame: RisingFrame; params: ListParams }
  | { kind: "saved"; params: ListParams };

const int = (raw: string | null, min: number, max: number): number | null => {
  if (raw == null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
};

/** The view a query names, each parameter as it stands first. */
const viewOf = (sp: URLSearchParams): ListView =>
  readListView({
    style: sp.get("style"),
    steps: sp.get("steps"),
    angle: sp.get("angle"),
    size: sp.get("size")
  });

/** A query as a list reads it: each part out of bounds is its default. */
function readParams(sp: URLSearchParams, home = false): ListParams {
  return {
    words: listWords(sp.get("q") ?? sp.get("query")),
    ...viewOf(sp),
    page: int(sp.get("page"), 1, PAGE_MAX) ?? 1,
    limit: home ? DEFAULT_LIMIT : (int(sp.get("limit"), LIMIT_MIN, LIMIT_MAX) ?? DEFAULT_LIMIT),
    selection: sp.has("selection")
  };
}

/** A list's query in its one order, defaults left out. */
export function listSearch(p: ListParams, change: Partial<ListParams> = {}): string {
  const m = { ...p, ...change };
  const q = new URLSearchParams();
  if (m.words) q.set("q", m.words);
  for (const [name, value] of Object.entries(viewParams(m)))
    if (value !== undefined) q.set(name, String(value));
  if (m.page !== 1) q.set("page", String(m.page));
  if (m.limit !== DEFAULT_LIMIT) q.set("limit", String(m.limit));
  const parts = [q.toString(), m.selection ? "selection" : ""].filter(Boolean);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** A list's params with the view a pasted link draws in, wherever the list sets none of its own. */
export function withView(params: ListParams, view?: URLSearchParams): ListParams {
  if (!view) return params;
  const said = viewOf(view);
  return {
    ...params,
    style: params.style === "auto" ? said.style : params.style,
    steps: params.steps === "auto" ? said.steps : params.steps,
    angle: params.angle === "auto" ? said.angle : params.angle,
    size: params.size ?? said.size
  };
}

/** A query whose words are a Grabient link, read as what the link means: its palette or words as `q`, and its view
    wherever the query says none of its own. */
function linked(search: string): URLSearchParams {
  const sp = new URLSearchParams(search);
  const raw = sp.get("q") ?? sp.get("query");
  const link = raw && looksLikeLink(raw) ? readLink(raw) : null;
  if (link) {
    sp.delete("query");
    sp.set("q", link.words);
    for (const [name, value] of link.view) if (!sp.has(name)) sp.set(name, value);
  }
  return sp;
}

/** The gallery place an address is, or null for an address of another feature. */
export function galleryPlace(path: string, search: string): GalleryPlace | null {
  if (path === "/") return { kind: "home", params: readParams(linked(search), true) };
  if (path === LIST_PATHS.saved) return { kind: "saved", params: readParams(linked(search)) };
  if (path === LIST_PATHS.popular) {
    return {
      kind: "list",
      order: "popular",
      frame: DEFAULT_FRAME,
      params: readParams(linked(search))
    };
  }
  if (path === LIST_PATHS.rising || path.startsWith(`${LIST_PATHS.rising}/`)) {
    const frame =
      path === LIST_PATHS.rising ? DEFAULT_FRAME : path.slice(LIST_PATHS.rising.length + 1);
    if (!isFrame(frame)) return null;
    return { kind: "list", order: "rising", frame, params: readParams(linked(search)) };
  }
  return null;
}

/** The path a place lives at. */
const placePath = (place: GalleryPlace): string =>
  place.kind === "home"
    ? "/"
    : place.kind === "saved"
      ? LIST_PATHS.saved
      : place.order === "rising"
        ? framePath(LIST_PATHS.rising, place.frame)
        : LIST_PATHS.popular;

/** The canonical form of a gallery address, its old forms included; null for an address of another feature. */
export function canonicalGallery(address: string): string | null {
  const at = address.indexOf("?");
  const path = at < 0 ? address : address.slice(0, at);
  const search = at < 0 ? "" : address.slice(at);
  const canonical = (place: GalleryPlace) => placePath(place) + listSearch(place.params);
  const place = galleryPlace(path, search);
  if (place) return canonical(place);
  if (["/newest", "/oldest", "/palettes/newest", "/palettes/oldest"].includes(path)) {
    return canonical({
      kind: "list",
      order: "rising",
      frame: DEFAULT_FRAME,
      params: readParams(linked(search))
    });
  }
  if (path === "/saved") return canonical({ kind: "saved", params: readParams(linked(search)) });
  /* grabient.com's search addresses: words or a seed after /palettes/, in the order an old ?sort= said */
  const old = /^\/palettes\/([^/]+)$/.exec(path)?.[1];
  if (old) {
    let said = old;
    try {
      said = decodeURIComponent(old);
    } catch {
      // read as it came
    }
    const words = listWords(paletteId(said) ?? said.replace(/-/g, " "));
    if (!words) return null;
    const sp = new URLSearchParams(search);
    const rising = parseSort(sp.get("sort")) !== "popular";
    sp.delete("sort");
    sp.set("q", words);
    return canonical({
      kind: "list",
      order: rising ? "rising" : "popular",
      frame: DEFAULT_FRAME,
      params: readParams(sp)
    });
  }
  return null;
}

const COLLECTION_PATHS = {
  popular: "/collections",
  rising: "/collections/rising",
  saved: "/collections/saved"
} as const;
/** Where a list lives: a section in an order, Rising in its frame, with the words and the view a page keeps. A page
    size the collections list does not take is left behind. */
export function listHref(
  section: "palettes" | "collections",
  order: Order,
  frame: RisingFrame,
  params: ListParams
): string {
  const paths = section === "palettes" ? LIST_PATHS : COLLECTION_PATHS;
  const limit = section === "palettes" ? params.limit : Math.min(params.limit, COLLECTION_LIMIT);
  return (
    (order === "rising" ? framePath(paths.rising, frame) : paths[order]) +
    listSearch(params, { page: 1, limit, selection: false })
  );
}
