/* The answers of the picture addresses, which the route files hand the Worker's bindings and its `waitUntil`. A
   montage's palettes are read through the feature that owns them, the first nine in its page's order, each as saved. */

import { isBlob } from "@grabient/engine/blob.ts";
import { MARK_WEEK, markSvg, markWeek, weekMark } from "@grabient/ui/mark.ts";
import { isCollectionSlug, slugWords } from "../../features/collections/address.ts";
import { MAX_COLLECTION_ITEMS } from "../../features/collections/schema.ts";
import { DEFAULT_SEED } from "../../lib/page-meta.ts";
import { json } from "../../lib/responses.ts";
import { listWords } from "../../lib/words.ts";
import { collectionBySlug, collectionImagePalettes } from "../collections/read.ts";
import { publicCollections } from "../collections/search.ts";
import { addressParams, fileName } from "../files/address.ts";
import { RANDOM, randomFile } from "../files/random.ts";
import { resolvePalette } from "../files/resolve.ts";
import { listPalettes } from "../gallery/list.ts";
import { type SearchEnv, searchLeaders } from "../search/search.ts";
import { paletteCard, palettePicture } from "./cards.ts";
import { type GifPartRunner, paletteGif } from "./gifs.ts";
import {
  MONTAGE_PALETTES,
  montageOrder,
  montagePicks,
  picksKey,
  pictureWords
} from "./montage-address.ts";
import { type MontagePalette, montageAnswer, sheetAnswer, sheetSvgAnswer } from "./montages.ts";
import type { Keep, PictureEnv } from "./serve.ts";

const paramsOf = (request: Request) => addressParams(new URL(request.url).searchParams);
const pathOf = (request: Request) => new URL(request.url).pathname;

function paletteImage(
  request: Request,
  env: PictureEnv,
  keep: Keep,
  name: string,
  branded: boolean,
  params = paramsOf(request)
) {
  const found = resolvePalette(name);
  if (!found) return json({ error: "Invalid palette seed." }, { status: 404 });
  return (branded ? paletteCard : palettePicture)(request, env, found, params, keep);
}

/** /api/og: a palette's share card, the default palette's when the address names none. */
export const cardAnswer = (request: Request, env: PictureEnv, keep: Keep) =>
  paletteImage(request, env, keep, paramsOf(request).get("seed") || DEFAULT_SEED, true);

/** /api/png?seed=: a palette's picture. */
export const pngAnswer = (request: Request, env: PictureEnv, keep: Keep) =>
  paletteImage(request, env, keep, paramsOf(request).get("seed") ?? "", false);

/** /{seed}.png: a palette's picture beside its page; /{slug}.png and /@{handle}/{slug}.png, a public collection's
    sheet beside its page. */
export const seedPngAnswer = (request: Request, env: PictureEnv, keep: Keep) => {
  const name = fileName(pathOf(request), "png");
  // /random.png: a new random palette's picture
  if (name === RANDOM) return randomFile(request, "png");
  if (!resolvePalette(name) && isCollectionSlug(name)) {
    return collectionSheetAnswer(request, env, keep, name);
  }
  return paletteImage(request, env, keep, name, false);
};

/** /{seed}.gif?style=blob: a palette's animated blob as a GIF, a large one drawn in parts by `parts`. Only the blob
    moves, so a GIF of any other style is no file. */
export function seedGifAnswer(
  request: Request,
  env: PictureEnv,
  keep: Keep,
  parts?: GifPartRunner
) {
  const found = resolvePalette(fileName(pathOf(request), "gif"));
  if (!found) return json({ error: "Invalid palette seed." }, { status: 404 });
  const params = paramsOf(request);
  if (!isBlob(params)) {
    return json(
      { error: "A palette's GIF is its animated blob: add ?style=blob to the address." },
      { status: 404 }
    );
  }
  return paletteGif(request, env, found, params, keep, parts);
}

/* A public collection's first palettes in its page's order, read as its share card reads them, under the card's key. */
const collectionSheetKey = (slug: string) => `collection:${slug}:popular:`;
const collectionFirst = (env: Pick<PictureEnv, "DB">, slug: string) => () =>
  collectionImagePalettes(env, slug, MONTAGE_PALETTES, "popular");

/** A public collection's sheet. */
const collectionSheetAnswer = (request: Request, env: PictureEnv, keep: Keep, slug: string) =>
  sheetAnswer(request, env, collectionSheetKey(slug), collectionFirst(env, slug), keep);

/** /{slug}.svg and /@{handle}/{slug}.svg: a public collection's sheet as SVG, titled with the collection's title. */
export const collectionSheetSvg = (env: Pick<PictureEnv, "DB">, slug: string) =>
  sheetSvgAnswer(
    collectionSheetKey(slug),
    collectionFirst(env, slug),
    async () => (await collectionBySlug(env, slug))?.title ?? slugWords(slug)
  );

/** /og/{version}/{seed}.png, where the build once wrote a palette's card as a file: that card at its plain address's
    view, whatever the query says, as the file was. */
export function oldCardAnswer(request: Request, env: PictureEnv, keep: Keep) {
  const path = pathOf(request);
  const name = fileName(path.slice(path.lastIndexOf("/")), "png");
  return paletteImage(request, env, keep, name, true, new URLSearchParams());
}

/* A search's first nine in its page's order, Newest and Hot read as Popular, which a search's page shows; null when its
   address names no words. */
function searchFirst(request: Request, env: SearchEnv) {
  const params = paramsOf(request);
  const words = pictureWords(pathOf(request), params);
  if (!words) return null;
  const { sort, frame = "1w" } = montageOrder(params);
  const order = sort === "rising" ? "rising" : "popular";
  return {
    words,
    key: `query:${words}:${order}:${frame}`,
    read: async () =>
      (await searchLeaders(env, words, MONTAGE_PALETTES, { sort: order, frame, request })).map(
        item => ({ seed: item.kseed, style: item.style, steps: item.steps, angle: item.angle })
      )
  };
}
/** A search's own picture beside its page: /palettes/{words}.png or /search/{words}.png, its sheet. */
const SEARCH_SHEET = /^\/(?:search|palettes)\/.+\.png$/;

/** /api/og/query and /api/png/query: the search's first nine as wedges; /palettes/{words}.png and
    /search/{words}.png: its sheet, the first eight as rows with their hexes. */
export function searchPictureAnswer(
  request: Request,
  env: PictureEnv & SearchEnv,
  keep: Keep,
  branded: boolean
) {
  const search = searchFirst(request, env);
  if (!search) return json({ error: "Invalid search query." }, { status: 400 });
  if (!branded && SEARCH_SHEET.test(pathOf(request))) {
    return sheetAnswer(request, env, search.key, search.read, keep);
  }
  return montageAnswer(request, env, branded, search.key, search.read, keep);
}

/** /palettes/{words}.svg and /search/{words}.svg: a search's sheet as SVG, titled with its words. */
export function searchSheetSvg(request: Request, env: PictureEnv & SearchEnv) {
  const search = searchFirst(request, env);
  if (!search) return json({ error: "Invalid search query." }, { status: 400 });
  return sheetSvgAnswer(search.key, search.read, async () => search.words);
}

/** /api/og/list: the gallery's first nine in a list's order, or the home's (Hot). */
export function listCardAnswer(request: Request, env: PictureEnv, keep: Keep) {
  const { sort, frame = "1w" } = montageOrder(paramsOf(request));
  return montageAnswer(
    request,
    env,
    true,
    `list:${sort}:${frame}`,
    async () =>
      (
        await listPalettes(env, { sort, frame, page: 1, limit: MONTAGE_PALETTES, count: false })
      ).items.map(item => ({
        seed: item.kseed,
        style: item.style,
        steps: item.steps,
        angle: item.angle
      })),
    keep
  );
}

/** /api/og/collection and /api/png/collection: a public collection's first nine in its page's order. */
export function collectionPictureAnswer(
  request: Request,
  env: PictureEnv,
  keep: Keep,
  branded: boolean
) {
  const params = paramsOf(request);
  const slug = (params.get("slug") ?? "").slice(0, 120);
  const sort = params.get("sort") === "rising" ? "rising" : "popular";
  const picks = montagePicks(params);
  return montageAnswer(
    request,
    env,
    branded,
    `collection:${slug}:${sort}:${picksKey(picks)}`,
    async () => {
      if (!picks.length) return collectionImagePalettes(env, slug, MONTAGE_PALETTES, sort);
      /* the palettes the address names, in its order, each one the collection holds */
      const held = await collectionImagePalettes(env, slug, MAX_COLLECTION_ITEMS, sort);
      return picks.flatMap(({ seed, view }) => {
        const saved = held.find(item => item.seed === seed);
        return saved ? [{ ...saved, ...view }] : [];
      });
    },
    keep
  );
}

/** /api/og/collections: the first preview palette of each of the first nine public collections, in their list's
    order, or of the collections its words find. */
export function collectionsCardAnswer(request: Request, env: PictureEnv, keep: Keep) {
  const params = paramsOf(request);
  const { sort, frame = "1w" } = montageOrder(params);
  const words = listWords(params.get("q"));
  return montageAnswer(
    request,
    env,
    true,
    `collections:${sort}:${frame}:${words}`,
    async (): Promise<MontagePalette[]> => {
      const page = await publicCollections(
        env,
        { query: words, sort, frame, page: 1, limit: MONTAGE_PALETTES },
        words ? { model: true, request } : {}
      );
      return page.items.flatMap(collection => collection.preview.slice(0, 1));
    },
    keep
  );
}

/* The first week the tab icon was drawn for, and how far ahead a week's file is drawn: a tab open over Sunday night
   asks for next week's. */
const FIRST_WEEK = "2026-w40";
const WEEK_MS = 7 * 86_400_000;

/** /favicon/{week}.svg for a light browser alone, /favicon/{week}-dark.svg for either: a week's address is drawn the
    same whenever it is asked, so it is kept for good. */
export function weekIconAnswer(request: Request, now = Date.now()): Response {
  const path = pathOf(request);
  const name = fileName(path.slice(path.lastIndexOf("/")), "svg");
  const dark = name.endsWith("-dark");
  const week = dark ? name.slice(0, -"-dark".length) : name;
  if (!MARK_WEEK.test(week) || week < FIRST_WEEK || week > markWeek(now + WEEK_MS)) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const svg = dark ? markSvg(weekMark(week)) : markSvg(weekMark(week), "light");
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=1209600, immutable"
    }
  });
}
