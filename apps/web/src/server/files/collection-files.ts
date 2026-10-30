/* A public collection as a file at its address plus an extension: its swatch files, its CSS and its JSON, all its
   palettes in its order, each in the view it was saved in. Its sheet (.png, .svg) is its page's first palettes as one
   picture (images/montages.ts), and its Markdown is the agent files' (seo/markdown.ts). A collection changes as palettes
   join it, so its files are kept five minutes at the edge, as its page is. */
import { decodePalette, sampleStops } from "@grabient/engine";
import { type ColorKind, colorKind, cssLine, cssP3 } from "@grabient/engine/css.ts";
import { paletteJson } from "@grabient/engine/document.ts";
import { seedName } from "@grabient/engine/name.ts";
import {
  SWATCH_FILES,
  type SwatchFormat,
  swatchFile,
  swatchPalette
} from "@grabient/engine/swatches.ts";
import { drawnView, viewSearch } from "@grabient/engine/view.ts";
import type { Env } from "@grabient/server/env.ts";
import { PAGE } from "../../lib/cache.ts";
import { collectionSheet } from "../../lib/page-meta.ts";
import { json } from "../../lib/responses.ts";
import {
  type CollectionForFiles,
  collectionForFiles,
  isCollectionSlug
} from "../collections/files.ts";
import { colorNames } from "./names.ts";

/** The files a collection is written as here: its swatch files, its CSS and its JSON. */
export type CollectionFormat = SwatchFormat | "css" | "json";

const DATA = { ...PAGE, "X-Robots-Tag": "noindex", "Access-Control-Allow-Origin": "*" };

/** The collection at `name` as a file, or null when the name has no collection's shape: it is then no file at all. */
export async function collectionFile(
  env: Pick<Env, "DB"> & Partial<Pick<Env, "ASSETS">>,
  name: string,
  origin: string,
  format: CollectionFormat,
  params: URLSearchParams = new URLSearchParams()
): Promise<Response | null> {
  if (!isCollectionSlug(name)) return null;
  const doc = await collectionForFiles(env, name);
  if (!doc) return json({ error: "No collection has this address." }, { status: 404 });
  if (format === "css") {
    return new Response(collectionCss(doc, origin, colorKind(params.get("colors"))), {
      headers: { ...DATA, "Content-Type": "text/css; charset=utf-8" }
    });
  }
  const names = await colorNames(env);
  if (format === "json")
    return Response.json(collectionJson(doc, origin, names), { headers: DATA });
  const palettes = doc.items.flatMap(
    item => swatchPalette(item.seed, item, origin, { names }) ?? []
  );
  return new Response(swatchFile(format, palettes, doc.title), {
    headers: { ...PAGE, "X-Robots-Tag": "noindex", "Content-Type": SWATCH_FILES[format].type }
  });
}

/* A comment's words, which never close it early. */
const said = (text: string) => text.replace(/\*\//g, "* /");
/* The class a collection's palettes take: its address's last words, which a class may not start with a digit. */
function classOf(slug: string): string {
  const base = slug.split("/").pop() ?? slug;
  return /^[a-z]/.test(base) ? base : `grabient-${base}`;
}

/** A collection as CSS: a class to each palette in its order, its gradient as its page draws it, and the P3 colors
    where a wide screen shows them more vividly, as a palette's own CSS does. */
export function collectionCss(doc: CollectionForFiles, origin: string, kind: ColorKind): string {
  const base = origin.replace(/\/$/, "");
  const prefix = classOf(doc.slug);
  const rules = doc.items.flatMap((item, i) => {
    const P = decodePalette(item.seed);
    if (!P) return [];
    const view = drawnView(P, item);
    const stops = sampleStops(P, view.steps);
    const name = item.title ?? (seedName(item.seed, item.style, item.steps) || item.seed);
    const selector = `.${prefix}-${i + 1}`;
    const wide = cssP3(stops, view.style, view.angle, kind);
    return [
      `${selector} {\n  /* ${said(name)}: ${base}/${item.seed}${viewSearch(item)} */\n  ${cssLine(stops, view.style, view.angle, kind)}\n}\n` +
        (wide ? `@media (color-gamut: p3) {\n  ${selector} {\n    ${wide}\n  }\n}\n` : "")
    ];
  });
  return `/* ${said(doc.title)}: ${base}/${doc.slug}\n   A class to each palette, in the collection's order: <div class="${prefix}-1"></div> */\n${rules.join("")}`;
}

/** A collection as JSON: its words, its files' addresses, and each palette as its own JSON writes it, in its order. */
export function collectionJson(
  doc: CollectionForFiles,
  origin: string,
  names: Parameters<typeof paletteJson>[3]
) {
  const base = origin.replace(/\/$/, "");
  const at = (ext: string) => `${base}/${doc.slug}.${ext}`;
  return {
    slug: doc.slug,
    title: doc.title,
    description: doc.description,
    tags: doc.tags,
    owner: doc.owner,
    count: doc.itemCount,
    updatedAt: new Date(doc.updatedAt).toISOString(),
    url: `${base}/${doc.slug}`,
    files: {
      png: collectionSheet(doc.slug, undefined, origin),
      svg: at("svg"),
      css: at("css"),
      md: at("md"),
      ase: at("ase"),
      gpl: at("gpl"),
      grd: at("grd"),
      tokens: at("tokens.json")
    },
    palettes: doc.items.flatMap(item => {
      const view = { style: item.style, steps: item.steps, angle: item.angle };
      const written = item.title ? { title: item.title, view } : null;
      return paletteJson(item.seed, origin, view, names, written) ?? [];
    })
  };
}
