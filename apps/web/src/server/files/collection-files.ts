/* A public collection as a file at its address plus an extension: Markdown of its words and every palette with its
   colors and address, or one swatch file of all its palettes in its order, each in the view it was saved in. A
   collection changes as palettes join it, so its files are kept five minutes at the edge, as its page is. */
import { decodePalette } from "@grabient/engine/codec.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { plain } from "@grabient/engine/markdown.ts";
import { seedName } from "@grabient/engine/name.ts";
import {
  SWATCH_FILES,
  type SwatchFormat,
  swatchFile,
  swatchPalette
} from "@grabient/engine/swatches.ts";
import { drawnView, styleWords, viewSearch } from "@grabient/engine/view.ts";
import type { Env } from "@grabient/server/env.ts";
import { PAGE } from "../../lib/cache.ts";
import { json } from "../../lib/responses.ts";
import {
  type CollectionForFiles,
  collectionForFiles,
  isCollectionSlug
} from "../collections/files.ts";
import { CARD_VERSION } from "../images/serve.ts";

const day = (time: number) => {
  const date = new Date(time);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
};

function markdown(doc: CollectionForFiles, origin: string): string {
  const base = origin.replace(/\/$/, "");
  const rows = doc.items.map((item, i) => {
    const P = decodePalette(item.seed);
    const colors = P ? sampleStops(P, drawnView(P, item).steps).map(stop => `\`${stop.hex}\``) : [];
    const name = item.title ?? (seedName(item.seed, item.style, item.steps) || item.seed);
    return `${i + 1}. [${plain(name)}](${base}/${item.seed}${viewSearch(item)}): ${styleWords(item.style)}, ${colors.join(" ")}`;
  });
  const card = new URL("/api/og/collection", base);
  card.searchParams.set("slug", doc.slug);
  card.searchParams.set("v", CARD_VERSION);
  return `# ${plain(doc.title)}

${doc.description ? `${plain(doc.description)}\n\n` : ""}- Page: ${base}/${doc.slug}
- Palettes: ${doc.itemCount}
${doc.tags.length ? `- Tags: ${doc.tags.map(plain).join(", ")}\n` : ""}- Collected by: ${plain(doc.owner)}
- Updated: ${day(doc.updatedAt)}

## Palettes

${rows.join("\n")}

## Other forms

- [JSON](${base}/api/collections/${doc.slug})
- [ASE](${base}/${doc.slug}.ase)
- [GPL](${base}/${doc.slug}.gpl)
- [GRD](${base}/${doc.slug}.grd)
- [Design tokens](${base}/${doc.slug}.tokens.json)
- [Image](${base}/api/png/collection?slug=${encodeURIComponent(doc.slug)})
- [Social card](${card})
- [More collections](${base}/collections)
- [Guide for agents](${base}/llms.txt)
`;
}

/** The collection at `name` as a file, or null when the name has no collection's shape: it is then no file at all. */
export async function collectionFile(
  env: Pick<Env, "DB">,
  name: string,
  origin: string,
  format: "md" | SwatchFormat
): Promise<Response | null> {
  if (!isCollectionSlug(name)) return null;
  const doc = await collectionForFiles(env, name);
  if (!doc) return json({ error: "No collection has this address." }, { status: 404 });
  const headers = { ...PAGE, "X-Robots-Tag": "noindex" };
  if (format === "md") {
    return new Response(markdown(doc, origin), {
      headers: {
        ...headers,
        "Content-Type": "text/markdown; charset=utf-8",
        Link: `<${origin.replace(/\/$/, "")}/${doc.slug}>; rel="canonical"`
      }
    });
  }
  const palettes = doc.items.flatMap(item => swatchPalette(item.seed, item, origin) ?? []);
  return new Response(swatchFile(format, palettes, doc.title), {
    headers: { ...headers, "Content-Type": SWATCH_FILES[format].type }
  });
}
