import { isStyle, parseSize, STEPS_MAX, STEPS_MIN, type Style } from "@grabient/engine/view.ts";
import {
  DEFAULT_FRAME,
  framePath,
  isFrame,
  type Order,
  parseSort,
  type RisingFrame
} from "../../lib/orders.ts";
import { listWords, looksLikeLink, paletteId, readLink } from "../../lib/words.ts";

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
export const DEFAULT_LIMIT = 24;
export const LIMIT_MIN = 12;
export const LIMIT_MAX = 96;
const PAGE_MAX = 1_000_000;

/** How a list draws every card: a style, a stop count, an angle and an export size over each palette's own, or
    `auto` for its own. */
export interface ListView {
  style: Style | "auto";
  steps: number | "auto";
  angle: number | "auto";
  size: string | "auto";
}
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

/** A query's view, page and size as a list reads them: each out of bounds is its default. Steps under three, as few
    as a palette allows, are raised to three. */
export function readParams(sp: URLSearchParams, home = false): ListParams {
  const style = sp.get("style");
  const steps = int(sp.get("steps"), 1, STEPS_MAX);
  const size = parseSize(sp.get("size"));
  return {
    words: listWords(sp.get("q") ?? sp.get("query")),
    style: isStyle(style) ? style : "auto",
    steps: steps === null ? "auto" : Math.max(steps, STEPS_MIN),
    angle: int(sp.get("angle"), 0, 360) ?? "auto",
    size: size ? `${size.width}x${size.height}` : "auto",
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
  if (m.style !== "auto") q.set("style", m.style);
  if (m.steps !== "auto") q.set("steps", String(m.steps));
  if (m.angle !== "auto") q.set("angle", String(m.angle));
  if (m.size !== "auto") q.set("size", m.size);
  if (m.page !== 1) q.set("page", String(m.page));
  if (m.limit !== DEFAULT_LIMIT) q.set("limit", String(m.limit));
  const parts = [q.toString(), m.selection ? "selection" : ""].filter(Boolean);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** A list's params with the view a pasted link draws in, wherever the list sets none of its own. */
export function withView(params: ListParams, view?: URLSearchParams): ListParams {
  if (!view) return params;
  const said = readParams(view);
  const own = (key: "style" | "steps" | "angle" | "size") =>
    params[key] === "auto" && view.has(key) ? { [key]: said[key] } : {};
  return { ...params, ...own("style"), ...own("steps"), ...own("angle"), ...own("size") };
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

/** A palette list whatever its cards are drawn in: its order and frame, or the account whose Saved it is, then its
    words, its page size and the page its address names. A feed keeps the pages that joined under it, so a change of
    view or of the selection keeps them. */
export function listIdentity(place: Exclude<GalleryPlace, { kind: "home" }>, owner = ""): string {
  const { words, limit, page } = place.params;
  return JSON.stringify(
    place.kind === "list"
      ? ["list", place.order, place.frame, words, limit, page]
      : ["saved", owner, words, limit, page]
  );
}

/** The path a place lives at. */
export const placePath = (place: GalleryPlace): string =>
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

/** Where a press on an order of the palette list leads, with the words and view the page keeps. */
export function orderHref(order: Order, frame: RisingFrame, params: ListParams): string {
  const path =
    order === "saved"
      ? LIST_PATHS.saved
      : order === "rising"
        ? framePath(LIST_PATHS.rising, frame)
        : LIST_PATHS.popular;
  return path + listSearch(params, { page: 1, selection: false });
}

/** The home, searched for these words or at rest. */
export const homeHref = (words = "") =>
  `/${words ? listSearch(readParams(new URLSearchParams()), { words }) : ""}`;
