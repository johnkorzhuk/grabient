/* A palette as a file at its address plus an extension: CSS, SVG, JSON and the swatch files design apps import, each
   written by the engine in the view the address asks for. A name that is no palette may be a collection's address: its
   swatch files are the collection's. Every file is English. Markdown is the agent files' (seo/markdown.ts). */
import { colorKind, paletteCss } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { paletteDocument, paletteJson } from "@grabient/engine/document.ts";
import { artworkSvg } from "@grabient/engine/svg.ts";
import {
  SWATCH_FILES,
  type SwatchFormat,
  swatchFile,
  swatchPalette
} from "@grabient/engine/swatches.ts";
import { parseSize, parseView } from "@grabient/engine/view.ts";
import type { Env } from "@grabient/server/env.ts";
import { FILE } from "../../lib/cache.ts";
import { json } from "../../lib/responses.ts";
import { publicOrigin } from "../seo/site.ts";
import { addressParams, fileName, viewAt } from "./address.ts";
import { collectionFile } from "./collection-files.ts";
import { colorNames } from "./names.ts";
import { resolvePalette } from "./resolve.ts";

export type FileFormat = "svg" | "css" | "json" | SwatchFormat;
export type FileEnv = Pick<Env, "DB"> & Partial<Pick<Env, "PUBLIC_ORIGIN" | "ASSETS">>;

const DATA = { "X-Robots-Tag": "noindex" };

/** The SVG's size: `w` and `h` first, as a PNG's, so an address keeps its size when .png becomes .svg; a pair the
    size's bounds refuse leaves the view's own. */
export function svgSize(params: URLSearchParams) {
  const side = (key: string) => {
    const raw = params.get(key);
    return raw && /^\d+$/.test(raw) ? raw : null;
  };
  const w = side("w");
  const h = side("h");
  return ((w || h) && parseSize(`${w ?? "auto"}x${h ?? "auto"}`)) || parseView(params).size;
}

async function paletteFile(
  request: Request,
  env: FileEnv,
  name: string,
  format: FileFormat
): Promise<Response> {
  const origin = publicOrigin(env, request);
  const found = resolvePalette(name);
  if (!found) {
    // Of these files a collection has the swatch files alone.
    const swatches = format !== "svg" && format !== "css" && format !== "json";
    return (
      (swatches && (await collectionFile(env, name, origin, format))) ||
      json({ error: "Invalid palette seed." }, { status: 404 })
    );
  }
  const { seed, palette } = found;
  const params = addressParams(new URL(request.url).searchParams);
  const view = viewAt(params, palette.anchors.length);
  const stops = () => sampleStops(palette, view.steps);
  switch (format) {
    case "css": {
      const address = paletteDocument(seed, palette, origin, view).url;
      return new Response(paletteCss(stops(), view, address, colorKind(params.get("colors"))), {
        headers: { ...FILE, "Content-Type": "text/css; charset=utf-8" }
      });
    }
    case "svg":
      return new Response(artworkSvg(stops(), { ...view, size: svgSize(params) }, seed, origin), {
        headers: { ...FILE, "Content-Type": "image/svg+xml; charset=utf-8" }
      });
    case "json":
      return Response.json(paletteJson(seed, origin, view, await colorNames(env)), {
        headers: { ...FILE, ...DATA }
      });
    default: {
      const names = await colorNames(env);
      return new Response(swatchFile(format, [swatchPalette(seed, view, origin, { names })!]), {
        headers: { ...FILE, ...DATA, "Content-Type": SWATCH_FILES[format].type }
      });
    }
  }
}

/** A file at its name and extension, /{seed}.css or /@ada/warm-sunsets.gpl: `.tokens.json` is the design tokens, any
    other `.json` the palette's JSON. */
export function fileAnswer(
  request: Request,
  env: FileEnv,
  extension: "svg" | "css" | "json" | "ase" | "gpl" | "grd"
): Promise<Response> {
  const name = fileName(new URL(request.url).pathname, extension);
  return extension === "json" && name.endsWith(".tokens")
    ? paletteFile(request, env, name.slice(0, -".tokens".length), "tokens")
    : paletteFile(request, env, name, extension);
}

/** /api/palette?seed= and /api/palette.json?seed=: the palette's JSON, as /{seed}.json has it. */
export const apiJsonAnswer = (request: Request, env: FileEnv) =>
  paletteFile(
    request,
    env,
    addressParams(new URL(request.url).searchParams).get("seed") ?? "",
    "json"
  );
