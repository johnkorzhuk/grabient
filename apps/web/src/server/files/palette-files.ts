/* A palette as a file at its address plus an extension: CSS, SVG, JSON and the swatch files design apps import, each
   written by the engine in the view the address asks for. A name that is no palette may be a collection's address: its
   swatch files are the collection's. Every file is English. Markdown is the agent files' (seo/markdown.ts). */
import {
  BANDS_SIZE,
  type BandsView,
  bandsCss,
  bandsSearch,
  bandsSvg,
  isBands,
  parseBands
} from "@grabient/engine/bands.ts";
import { colorKind, paletteCss } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { paletteDocument, paletteJson } from "@grabient/engine/document.ts";
import { effectParts, parseEffect } from "@grabient/engine/effect.ts";
import { readingName, readPalette } from "@grabient/engine/name.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { artworkSvg } from "@grabient/engine/svg.ts";
import {
  SWATCH_FILES,
  type SwatchFormat,
  swatchFile,
  swatchPalette
} from "@grabient/engine/swatches.ts";
import { DEFAULT_ANGLE, DEFAULT_SIZE, resolveSize, sizeParam } from "@grabient/engine/view.ts";
import type { Env } from "@grabient/server/env.ts";
import { ANIMATION, EMBEDDED, FILE, NO_STORE, TEXT } from "../../lib/cache.ts";
import { json } from "../../lib/responses.ts";
import { isCollectionSlug, texts, writtenWords } from "../collections/files.ts";
import { isLinkPreview } from "../crawlers.ts";
import { publicOrigin } from "../seo/site.ts";
import { addressParams, fileName, svgSize, viewAt } from "./address.ts";
import { collectionFile } from "./collection-files.ts";
import { colorNames } from "./names.ts";
import { RANDOM, randomFile } from "./random.ts";
import { resolvePalette } from "./resolve.ts";

export type FileFormat = "svg" | "css" | "json" | SwatchFormat;
export type FileEnv = Pick<Env, "DB"> & Partial<Pick<Env, "PUBLIC_ORIGIN" | "ASSETS">>;

const DATA = { "X-Robots-Tag": "noindex" };

const attribute = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The animated SVG as an app that previews a posted link reads it: a page whose card is the SVG's still frame under the
    wordmark (/api/og?style=bands), titled with the palette's name, since an SVG carries no card of its own. The page is
    the link preview's alone: the edge keeps no copy of it (pipeline.ts), and a reader's browser gets the SVG. */
function bandsPreview(
  origin: string,
  seed: string,
  palette: Palette,
  bands: BandsView,
  size: string | null
) {
  const address = attribute(
    `${origin}/${seed}.svg${bandsSearch(bands, size ? [`size=${size}`] : [])}`
  );
  const card = attribute(`${origin}/api/og${bandsSearch(bands, [`seed=${seed}`])}`);
  const title = attribute(`${readingName(readPalette(palette))} · Grabient`);
  const about =
    "An animated SVG of a Grabient palette: bands that bloom from the center out, drawn by CSS alone.";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${about}"><link rel="canonical" href="${address}"><meta property="og:type" content="website"><meta property="og:site_name" content="Grabient"><meta property="og:title" content="${title}"><meta property="og:description" content="${about}"><meta property="og:url" content="${address}"><meta property="og:image" content="${card}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${about}"><meta name="twitter:image" content="${card}"></head><body><img src="${address}" alt="" width="1200" height="630"></body></html>`;
  return new Response(html, {
    headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8", Vary: "User-Agent" }
  });
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
    // a name that is no palette may be a collection's: its sheet as SVG, else the file it is written as
    const asked = addressParams(new URL(request.url).searchParams);
    const file =
      format !== "svg"
        ? await collectionFile(env, name, origin, format, asked)
        : isCollectionSlug(name)
          ? // the drawing's modules load with the first sheet asked for, never with the files' writers
            await (await import("../images/answers.ts")).collectionSheetSvg(env, name)
          : null;
    return file ?? json({ error: "Invalid palette seed." }, { status: 404 });
  }
  const { seed, palette } = found;
  const params = addressParams(new URL(request.url).searchParams);
  const view = viewAt(params, palette.anchors.length);
  const stops = () => sampleStops(palette, view.steps);
  switch (format) {
    case "css": {
      /* style=glass or blob: the effect's first frame behind the page, which /{seed}.js plays from (effect-files.ts),
         loaded with the first one asked for */
      const effect = parseEffect(params);
      if (effect) {
        const { effectCss } = await import("./effect-files.ts");
        const turned = effect.kind === "glass" && view.angle !== DEFAULT_ANGLE;
        const parts = [`style=${effect.kind}`, ...(turned ? [`angle=${view.angle}`] : [])];
        const credit = `${origin}/${seed}?${[...parts, ...effectParts(effect)].join("&")}`;
        return new Response(effectCss(palette, effect, view.angle, credit), {
          headers: { ...ANIMATION, ...EMBEDDED, "Content-Type": "text/css; charset=utf-8" }
        });
      }
      // w and h (or size) set the page's box; style=bands plays the animated SVG, carried inside
      const asked = svgSize(params);
      if (isBands(params)) {
        const size = asked ? resolveSize(asked, BANDS_SIZE) : null;
        return new Response(bandsCss(palette, parseBands(params), size, `${origin}/${seed}`), {
          headers: { ...ANIMATION, "Content-Type": "text/css; charset=utf-8" }
        });
      }
      const size = asked ? resolveSize(asked, DEFAULT_SIZE) : null;
      const address = paletteDocument(seed, palette, origin, view).url;
      const kind = colorKind(params.get("colors"));
      return new Response(paletteCss(stops(), view, address, kind, size), {
        headers: { ...FILE, "Content-Type": "text/css; charset=utf-8" }
      });
    }
    case "svg":
      // style=bands is the animated SVG (engine/bands.ts), at 400 by 500 unless asked
      if (isBands(params)) {
        if (isLinkPreview(request)) {
          return bandsPreview(
            origin,
            seed,
            palette,
            parseBands(params),
            sizeParam(svgSize(params))
          );
        }
        const size = resolveSize(svgSize(params), BANDS_SIZE);
        return new Response(bandsSvg(palette, parseBands(params), size, `${origin}/${seed}`), {
          headers: { ...ANIMATION, "Content-Type": "image/svg+xml; charset=utf-8" }
        });
      }
      return new Response(artworkSvg(stops(), { ...view, size: svgSize(params) }, seed, origin), {
        headers: { ...FILE, "Content-Type": "image/svg+xml; charset=utf-8" }
      });
    case "json": {
      /* the title written for it, where its colors bear it out, beside what its colors call it while it is drawn as it
         was saved; kept as its Markdown is, since an admin may write the title again */
      const [names, [text]] = await Promise.all([
        colorNames(env),
        texts(env, [seed]).catch(() => [])
      ]);
      return Response.json(paletteJson(seed, origin, view, names, writtenWords(text, palette)), {
        headers: { ...TEXT, ...DATA }
      });
    }
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
  // /random.svg and the rest: a new random palette's file
  if (name === RANDOM) return Promise.resolve(randomFile(request, extension));
  if (extension === "json" && name === `${RANDOM}.tokens`) {
    return Promise.resolve(randomFile(request, "tokens.json"));
  }
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
