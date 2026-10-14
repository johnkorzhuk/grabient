/* A public collection as a swatch file at its address plus an extension: all its palettes in its order, each in the
   view it was saved in. A collection changes as palettes join it, so its files are kept five minutes at the edge, as
   its page is. Its Markdown is the agent files' (seo/markdown.ts). */
import {
  SWATCH_FILES,
  type SwatchFormat,
  swatchFile,
  swatchPalette
} from "@grabient/engine/swatches.ts";
import type { Env } from "@grabient/server/env.ts";
import { PAGE } from "../../lib/cache.ts";
import { json } from "../../lib/responses.ts";
import { collectionForFiles, isCollectionSlug } from "../collections/files.ts";

/** The collection at `name` as a swatch file, or null when the name has no collection's shape: it is then no file at
    all. */
export async function collectionFile(
  env: Pick<Env, "DB">,
  name: string,
  origin: string,
  format: SwatchFormat
): Promise<Response | null> {
  if (!isCollectionSlug(name)) return null;
  const doc = await collectionForFiles(env, name);
  if (!doc) return json({ error: "No collection has this address." }, { status: 404 });
  const palettes = doc.items.flatMap(item => swatchPalette(item.seed, item, origin) ?? []);
  return new Response(swatchFile(format, palettes, doc.title), {
    headers: { ...PAGE, "X-Robots-Tag": "noindex", "Content-Type": SWATCH_FILES[format].type }
  });
}
