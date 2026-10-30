/* What the edge cache keeps a file or a picture under: one canonical path and only the query that decides its bytes, so
   every address of one answer (an old id, `/api/png?seed=`, `amp;` keys, a stray parameter) shares one entry and junk
   cannot fill the cache. A palette's picture changes only with the card version, which its key names, so it is kept
   across deploys. A picture of several palettes changes with what the site holds, so it is kept for one build, as its
   page is, and a collection's also by when the collection changed (`t`, which its page names). A text file is the
   engine's writing, kept for one build. */
import { bandsSearch, isBands, parseBands } from "@grabient/engine/bands.ts";
import { blobSearch, isBlob, parseBlob } from "@grabient/engine/blob.ts";
import { colorKind } from "@grabient/engine/css.ts";
import { parseView, type Size, sizeParam, viewSearch } from "@grabient/engine/view.ts";
import { CARD_VERSION, DEFAULT_SEED } from "../../lib/page-meta.ts";
import { listWords } from "../../lib/words.ts";
import { montageOrder, montagePicks, picksKey, pictureWords } from "../images/montage-address.ts";
import { CARD, cardSize, montageSize, pictureSize } from "../images/size.ts";
import { oldFit } from "../seo/legacy-fit.ts";
import { addressParams, fileName, svgSize, viewAt } from "./address.ts";
import { resolvePalette } from "./resolve.ts";

export interface FileKey {
  path: string;
  query: URLSearchParams;
  acrossBuilds: boolean;
}

/** A palette or a collection under another extension, the shortest name that leaves one: /{seed}.tokens.json is a
    seed's design tokens. */
export const FILE_PATH =
  /^\/([^/]+?|@[a-z0-9_-]{3,30}\/[a-z0-9-]+)\.(png|svg|css|json|md|ase|gpl|grd|tokens\.json)$/;
/** Where the build once wrote palettes' cards as files: the card, which the Worker now draws. */
const OLD_CARD = /^\/og\/[^/]+\/[^/]+\.png$/;
const SEARCH_PICTURES = new Set(["/api/og/query", "/api/png/query"]);
const MONTAGES = new Set([
  "/api/og/collection",
  "/api/png/collection",
  "/api/og/list",
  "/api/og/collections"
]);

function picture(path: string, query: URLSearchParams, size: Size, acrossBuilds = true): FileKey {
  query.set("w", String(size.width));
  query.set("h", String(size.height));
  if (acrossBuilds) query.set("v", CARD_VERSION);
  return { path, query, acrossBuilds };
}

/* A view a montage's address sets for all its palettes, read as drawn; a view it leaves to each palette is no key. */
function montageView(query: URLSearchParams, params: URLSearchParams) {
  const view = parseView(params);
  for (const key of ["style", "steps", "angle"] as const) {
    if (params.has(key)) query.set(key, String(view[key]));
  }
}

function searchKey(path: string, params: URLSearchParams): FileKey {
  const branded = path === "/api/og/query";
  const { sort, frame } = montageOrder(params);
  const query = new URLSearchParams({ query: pictureWords(path, params) ?? "" });
  if (sort === "rising") query.set("sort", sort);
  if (frame) query.set("frame", frame);
  montageView(query, params);
  return picture(
    branded ? "/api/og/query" : "/api/png/query",
    query,
    branded ? CARD : montageSize(params),
    false
  );
}

function montageKey(path: string, params: URLSearchParams): FileKey {
  const branded = path.startsWith("/api/og/");
  const query = new URLSearchParams();
  if (path.endsWith("/collection")) {
    query.set("slug", (params.get("slug") ?? "").slice(0, 120));
    if (params.get("sort") === "rising") query.set("sort", "rising");
    const changed = params.get("t");
    if (changed && /^\d{1,15}$/.test(changed)) query.set("t", changed);
    const picks = picksKey(montagePicks(params));
    if (picks) query.set("pick", picks);
  } else {
    const { sort, frame } = montageOrder(params);
    query.set("sort", sort);
    if (frame) query.set("frame", frame);
    const words = path === "/api/og/collections" ? listWords(params.get("q")) : "";
    if (words) query.set("q", words);
  }
  montageView(query, params);
  return picture(path, query, branded ? CARD : montageSize(params), false);
}

function namedFile(path: string, params: URLSearchParams) {
  if (path === "/api/og" || path === "/api/png") {
    const og = path === "/api/og";
    return { name: params.get("seed") || (og ? DEFAULT_SEED : ""), format: og ? "og" : "png" };
  }
  if (path === "/api/palette" || path === "/api/palette.json") {
    return { name: params.get("seed") ?? "", format: "json" };
  }
  if (OLD_CARD.test(path))
    return { name: fileName(path.slice(path.lastIndexOf("/")), "png"), format: "old" };
  const match = FILE_PATH.exec(path);
  return match && { name: fileName(path, match[2]), format: match[2] };
}

/** The key of a file or picture address, or null for any other address. */
export function fileCacheKey(path: string, search: URLSearchParams): FileKey | null {
  const params = addressParams(search);
  if (SEARCH_PICTURES.has(path) || /^\/(search|palettes)\/.+\.png$/.test(path)) {
    return searchKey(path, params);
  }
  if (MONTAGES.has(path)) return montageKey(path, params);
  const file = namedFile(path, params);
  if (!file) return null;
  const found = resolvePalette(file.name);
  /* A name that is no palette is a collection's file, which reads no query, or no file at all. Its sheet (.png) is kept
     also by when the collection changed (`t`, which its page names), as its share card is. An old seed no map holds
     names a card the Worker fits, whose redirect the seed and the view decide (seo/legacy-fit.ts). */
  if (!found) {
    const old = file.format === "og" ? oldFit(path, search) : null;
    const query = new URLSearchParams(old ? viewSearch(old.view, [`seed=${old.seed}`]) : "");
    const changed = params.get("t");
    if (file.format === "png" && changed && /^\d{1,15}$/.test(changed)) query.set("t", changed);
    return { path, query, acrossBuilds: false };
  }
  const { seed, palette } = found;
  if (file.format === "old") return picture("/api/og", new URLSearchParams({ seed }), CARD);
  // the animated SVG, its still frame and its card: their animation and size, kept for one build
  if (isBands(params) && ["svg", "css", "png", "og"].includes(file.format)) {
    const bands = parseBands(params);
    if (file.format === "png") {
      return picture(
        `/${seed}.png`,
        new URLSearchParams(bandsSearch(bands)),
        pictureSize(params),
        false
      );
    }
    if (file.format === "og") {
      const query = new URLSearchParams(bandsSearch(bands, [`seed=${seed}`]));
      return picture("/api/og", query, cardSize(params), false);
    }
    const size = sizeParam(svgSize(params));
    const query = new URLSearchParams(bandsSearch(bands, size ? [`size=${size}`] : []));
    return { path: `/${seed}.${file.format}`, query, acrossBuilds: false };
  }
  // the animated blob as SVG or CSS: its animation and size, kept for one build
  if (isBlob(params) && (file.format === "svg" || file.format === "css")) {
    const size = sizeParam(svgSize(params));
    const query = new URLSearchParams(blobSearch(parseBlob(params), size ? [`size=${size}`] : []));
    return { path: `/${seed}.${file.format}`, query, acrossBuilds: false };
  }
  const view = viewAt(params, palette.anchors.length);
  const svg = file.format === "svg" || file.format === "css" ? { size: svgSize(params) } : {};
  const query = new URLSearchParams(viewSearch({ ...view, ...svg }));
  if (file.format === "og") {
    const card = cardSize(params);
    query.set("seed", seed);
    if (!card.chips) query.set("chips", "off");
    return picture("/api/og", query, card);
  }
  if (file.format === "png") return picture(`/${seed}.png`, query, pictureSize(params));
  const colors = colorKind(params.get("colors"));
  if (file.format === "css" && colors !== "oklch") query.set("colors", colors);
  return { path: `/${seed}.${file.format}`, query, acrossBuilds: false };
}
