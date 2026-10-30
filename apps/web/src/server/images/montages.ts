/* Several palettes as one picture: the first a list, a collection, the collections list or a search shows, in its page's
   order. The feature that owns the palettes reads them; this draws what it is handed, each palette as it was saved
   unless the address sets style, steps or angle for all of them. Turned off for the site, a montage is refused before
   its palettes are read. */
import { decodePalette, encodePalette } from "@grabient/engine/codec.ts";
import { joined } from "@grabient/server/shared-work.ts";
import { PAGE } from "../../lib/cache.ts";
import { json } from "../../lib/responses.ts";
import { addressParams, type Saved, viewAt } from "../files/address.ts";
import { MONTAGE_PALETTES } from "./montage-address.ts";
import { drawSheet, drawWedges, keyframeColors, lookOf } from "./paint.ts";
import { answerPicture, drawingPaused, failure, type Keep, type PictureEnv } from "./serve.ts";
import { sheetSvg } from "./sheet-svg.ts";
import { CARD, montageSize, SHEET } from "./size.ts";

/* How the wedges are drawn: a new drawing names itself anew, so a card kept in R2 is drawn again */
const WEDGES = "wedges-smooth";
/* How a sheet is drawn, named as the wedges are */
const SHEET_DRAWING = "sheet-1";
/** The most palettes a sheet shows: its rows. */
export const SHEET_PALETTES = 8;

export interface MontagePalette extends Saved {
  seed: string;
}

/* A montage's palettes, kept a few minutes in this isolate: every size, view, HEAD and refused retry of one card reads
   the database or the search once. An empty or failed read is not kept. A request that comes while another reads
   waits for it beside a timer of its own, and reads for itself when it has not come by then
   (@grabient/server/shared-work.ts). */
const KEPT_MS = 180_000;
const KEPT_MAX = 256;
interface Entry {
  at: number;
  palettes: Promise<MontagePalette[]>;
  found?: MontagePalette[];
}
const kept = new Map<string, Entry>();

export function montagePalettes(
  key: string,
  read: () => Promise<MontagePalette[]>
): Promise<MontagePalette[]> {
  const held = kept.get(key);
  if (held && Date.now() - held.at < KEPT_MS) {
    if (held.found) return Promise.resolve(held.found);
    return joined(held.palettes, () =>
      kept.get(key) === held ? readAnew(key, read) : montagePalettes(key, read)
    );
  }
  return readAnew(key, read);
}

function readAnew(key: string, read: () => Promise<MontagePalette[]>): Promise<MontagePalette[]> {
  kept.delete(key);
  if (kept.size >= KEPT_MAX) kept.delete(kept.keys().next().value!);
  const entry: Entry = { at: Date.now(), palettes: read() };
  const forget = () => {
    if (kept.get(key) === entry) kept.delete(key);
  };
  entry.palettes = entry.palettes.then(
    found => {
      if (found.length) entry.found = found;
      else forget();
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

/** A sheet's rows: the first eight of the palettes that are palettes, each as it was saved. */
function sheetRows(palettes: readonly MontagePalette[]) {
  const none = new URLSearchParams();
  return palettes.slice(0, SHEET_PALETTES).flatMap(saved => {
    const palette = decodePalette(saved.seed);
    if (!palette) return [];
    return [
      { seed: encodePalette(palette), palette, view: viewAt(none, palette.anchors.length, saved) }
    ];
  });
}
const drawnRow = ({ palette, view }: ReturnType<typeof sheetRows>[number]) => ({
  look: lookOf(palette, view),
  chips: keyframeColors(palette)
});

/** A sheet's answer: refused while drawing is off, as a montage is, else its palettes read once per `key` in this
    isolate (a collection's share card reads the same) and the first eight drawn as rows, each as it was saved. */
export async function sheetAnswer(
  request: Request,
  env: PictureEnv,
  key: string,
  read: () => Promise<MontagePalette[]>,
  keep: Keep
): Promise<Response> {
  const paused = await drawingPaused(request, env, { branded: false });
  if (paused) return paused;
  const shown = sheetRows(await montagePalettes(key, read));
  if (!shown.length) return json({ error: "No palettes found." }, { status: 404 });
  const { width, height } = SHEET;
  return answerPicture(
    request,
    env,
    {
      kind: "sheet",
      branded: false,
      kept: true,
      parts: [
        SHEET_DRAWING,
        shown.map(({ seed, view }) => [seed, view.style, view.steps, view.angle]),
        width,
        height
      ],
      width,
      height,
      draw: () => drawSheet(shown.map(drawnRow), width, height)
    },
    keep
  );
}

/** The same sheet as SVG: shapes and text, no drawing to pay for, so no allowance and no pause. Its page names the PNG
    to image searches, so the SVG asks to be left out of them. */
export async function sheetSvgAnswer(
  key: string,
  read: () => Promise<MontagePalette[]>,
  title: () => Promise<string>
): Promise<Response> {
  const [palettes, named] = await Promise.all([montagePalettes(key, read), title()]);
  const shown = sheetRows(palettes);
  if (!shown.length) return json({ error: "No palettes found." }, { status: 404 });
  return new Response(sheetSvg(shown.map(drawnRow), SHEET.width, SHEET.height, named), {
    headers: {
      ...PAGE,
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "X-Robots-Tag": "noindex"
    }
  });
}
