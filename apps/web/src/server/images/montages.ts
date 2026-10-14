/* Several palettes as one picture: the first a list, a collection, the collections list or a search shows, in its page's
   order. The feature that owns the palettes reads them; this draws what it is handed, each palette as it was saved
   unless the address sets style, steps or angle for all of them. Turned off for the site, a montage is refused before
   its palettes are read. */
import { decodePalette, encodePalette } from "@grabient/engine/codec.ts";
import { isStyle, STEPS_MAX, STEPS_MIN, type View } from "@grabient/engine/view.ts";
import { DEFAULT_FRAME, isFrame, type RisingFrame } from "../../lib/orders.ts";
import { json } from "../../lib/responses.ts";
import { addressParams, type Saved, viewAt } from "../files/address.ts";
import { normalizeSearchQuery, queryFromParam } from "../search/search.ts";
import { drawWedges, lookOf } from "./paint.ts";
import { answerPicture, drawingPaused, failure, type Keep, type PictureEnv } from "./serve.ts";
import { CARD, montageSize } from "./size.ts";

/** The most palettes a picture shows: its wedges. */
export const MONTAGE_PALETTES = 9;
/* How the wedges are drawn: a new drawing names itself anew, so a card kept in R2 is drawn again */
const WEDGES = "wedges-smooth";

export interface MontagePalette extends Saved {
  seed: string;
}

/** A palette a card's address names, with the view to draw it in where the address gives one. */
export interface MontagePick {
  seed: string;
  view?: Pick<View, "style" | "steps" | "angle">;
}
/** The palettes a collection's card names (`pick`, a newsletter's hand-picked few): each `seed~style~steps~angle` or a
    seed alone, in order, nine at most. One that is no palette or no view is left out. */
export function montagePicks(params: URLSearchParams): MontagePick[] {
  const named = (params.get("pick") ?? "").split(",").filter(Boolean);
  return named.slice(0, MONTAGE_PALETTES).flatMap((entry): MontagePick[] => {
    const [raw = "", style, steps, angle] = entry.split("~");
    const palette = decodePalette(raw);
    if (!palette) return [];
    const seed = encodePalette(palette);
    if (style === undefined) return [{ seed }];
    const n = Number(steps);
    const a = Number(angle);
    if (!isStyle(style) || !Number.isInteger(n) || n < STEPS_MIN || n > STEPS_MAX) return [];
    if (!Number.isInteger(a) || a < 0 || a > 360) return [];
    return [{ seed, view: { style, steps: n, angle: a } }];
  });
}
/** The picks as one word, the same however the address spelled them: the edge's key and the isolate's. */
export const picksKey = (picks: readonly MontagePick[]): string =>
  picks
    .map(({ seed, view }) => (view ? [seed, view.style, view.steps, view.angle].join("~") : seed))
    .join(",");

type MontageSort = "popular" | "rising" | "newest" | "hot";

/** A montage's order as its address says it: Rising, Newest (which links from before Rising still name), the home's
    Hot, or else Popular; a frame other than the week's only with Rising. */
export function montageOrder(params: URLSearchParams): { sort: MontageSort; frame?: RisingFrame } {
  const sort = params.get("sort");
  const frame = params.get("frame");
  if (sort === "rising")
    return isFrame(frame) && frame !== DEFAULT_FRAME ? { sort, frame } : { sort };
  return { sort: sort === "newest" || sort === "hot" ? sort : "popular" };
}

/** The words a search picture's address asks for: `query`, then `q`, then its path's (/palettes/{words}.png or
    /search/{words}.png, a palette's address kept as its seed and hyphens read as spaces), as the search reads words;
    null when they are no search. */
export function pictureWords(path: string, params: URLSearchParams): string | null {
  const asked = params.get("query") ?? params.get("q");
  if (asked !== null) return normalizeSearchQuery(asked);
  const segment = /^\/(?:search|palettes)\/(.+)\.png$/.exec(path)?.[1];
  return segment ? queryFromParam(segment) : null;
}

/* A montage's palettes, kept a few minutes in this isolate: every size, view, HEAD and refused retry of one card reads
   the database or the search once. An empty or failed read is not kept. */
const KEPT_MS = 180_000;
const KEPT_MAX = 256;
const kept = new Map<string, { at: number; palettes: Promise<MontagePalette[]> }>();

export function montagePalettes(
  key: string,
  read: () => Promise<MontagePalette[]>
): Promise<MontagePalette[]> {
  const held = kept.get(key);
  if (held && Date.now() - held.at < KEPT_MS) return held.palettes;
  kept.delete(key);
  if (kept.size >= KEPT_MAX) kept.delete(kept.keys().next().value!);
  const entry = { at: Date.now(), palettes: read() };
  const forget = () => {
    if (kept.get(key) === entry) kept.delete(key);
  };
  entry.palettes = entry.palettes.then(
    found => {
      if (!found.length) forget();
      return found;
    },
    error => {
      forget();
      throw error;
    }
  );
  kept.set(key, entry);
  return entry.palettes;
}

/** The picture of the palettes the address's feature found, the first nine of them that are palettes. */
export function montagePicture(
  request: Request,
  env: PictureEnv,
  palettes: readonly MontagePalette[],
  branded: boolean,
  keep: Keep
): Promise<Response> {
  const params = addressParams(new URL(request.url).searchParams);
  const shown = palettes.slice(0, MONTAGE_PALETTES).flatMap(saved => {
    const palette = decodePalette(saved.seed);
    if (!palette) return [];
    return [
      { seed: encodePalette(palette), palette, view: viewAt(params, palette.anchors.length, saved) }
    ];
  });
  if (!shown.length) return Promise.resolve(failure(404, "No matching palettes"));
  const { width, height } = branded ? CARD : montageSize(params);
  return answerPicture(
    request,
    env,
    {
      kind: "montage",
      branded,
      parts: [
        WEDGES,
        shown.map(({ seed, view }) => [seed, view.style, view.steps, view.angle]),
        width,
        height,
        branded
      ],
      width,
      height,
      draw: () =>
        drawWedges(
          shown.map(({ palette, view }) => lookOf(palette, view)),
          width,
          height,
          branded
        )
    },
    keep
  );
}

/** A montage route's answer: refused while drawing is off, else its palettes read once per `key` in this isolate and
    drawn. */
export async function montageAnswer(
  request: Request,
  env: PictureEnv,
  branded: boolean,
  key: string,
  read: () => Promise<MontagePalette[]>,
  keep: Keep
): Promise<Response> {
  const paused = await drawingPaused(request, env, { branded });
  if (paused) return paused;
  const palettes = await montagePalettes(key, read);
  if (!palettes.length) return json({ error: "No palettes found." }, { status: 404 });
  return montagePicture(request, env, palettes, branded, keep);
}
