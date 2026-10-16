import { decodePalette, sampleStops } from "@grabient/engine";
import { type PaletteWords, paletteMarkdown, plain } from "@grabient/engine/markdown.ts";
import { seedName } from "@grabient/engine/name.ts";
import type { Namer } from "@grabient/engine/precise-names.ts";
import { drawnView, type Style, styleWords, viewSearch } from "@grabient/engine/view.ts";
import { PAGE, TEXT } from "../../lib/cache.ts";
import { collectionCard, type PaletteView, paletteAddress } from "../../lib/page-meta.ts";
import { json } from "../../lib/responses.ts";
import { addressParams, viewAt } from "../files/address.ts";
import { resolvePalette } from "../files/resolve.ts";
import { AGENT_DATA } from "./agents.ts";
import { isoDay } from "./text.ts";

/* A palette or a collection as Markdown at its address plus .md, for an agent that reads text. A palette's is the
   engine's, with what only the database knows: the words written for it that its colors bear out, and the public
   collections that hold it. A collection's says its words, then every palette with its colors and its address. Both are
   English, out of search results, and name their page as the form of it to read. */

/** A public collection as its files read it. */
export interface CollectionWords {
  slug: string;
  title: string;
  description: string;
  tags: readonly string[];
  itemCount: number;
  /** who collected it, as its page names them: Grabient for its own */
  owner: string;
  updatedAt: number;
  items: readonly {
    seed: string;
    style: Style;
    steps: number;
    angle: number;
    /** the title written for it that its colors bear out */
    title?: string;
  }[];
}
/** What the files read from the database. A failed read of a palette's words leaves them out. */
export interface MarkdownReads {
  paletteWords(seed: string): Promise<{
    /** the view it was saved in, which its page's address draws */
    saved?: PaletteView;
    written: PaletteWords | null;
    heldBy: readonly { slug: string; title: string }[];
  }>;
  /** a public collection, or null where none is */
  collection(address: string): Promise<CollectionWords | null>;
  /** whether a name has a collection's address's shape */
  isCollection(address: string): boolean;
  /** the precise color names, where the deploy holds them */
  colorNames?(): Promise<Namer | null>;
}

/* out of search results, and naming the page it is a form of */
const markdown = (page: string, cache: Record<string, string>) => ({
  ...cache,
  ...AGENT_DATA,
  "Content-Type": "text/markdown; charset=utf-8",
  Link: `<${page}>; rel="alternate"; type="text/html"`
});

/** A collection as Markdown: its words, then every palette in its order and the view it was saved in. */
export function collectionMarkdown(doc: CollectionWords, origin: string): string {
  const base = origin.replace(/\/$/, "");
  const rows = doc.items.map((item, i) => {
    const P = decodePalette(item.seed);
    const colors = P ? sampleStops(P, drawnView(P, item).steps).map(stop => `\`${stop.hex}\``) : [];
    const name = item.title ?? (seedName(item.seed, item.style, item.steps) || item.seed);
    const address = `${base}/${item.seed}${viewSearch(item)}`;
    return `${i + 1}. [${plain(name)}](${address}): ${styleWords(item.style)}, ${colors.join(" ")}`;
  });
  return `# ${plain(doc.title)}

${doc.description ? `${plain(doc.description)}\n\n` : ""}- Page: ${base}/${doc.slug}
- Palettes: ${doc.itemCount}
${doc.tags.length ? `- Tags: ${doc.tags.map(plain).join(", ")}\n` : ""}- Collected by: ${plain(doc.owner)}
- Updated: ${isoDay(doc.updatedAt) ?? ""}

## Palettes

${rows.join("\n")}

## Other forms

- [JSON](${base}/api/collections/${doc.slug})
- [ASE](${base}/${doc.slug}.ase)
- [GPL](${base}/${doc.slug}.gpl)
- [GRD](${base}/${doc.slug}.grd)
- [Design tokens](${base}/${doc.slug}.tokens.json)
- [Image](${base}/api/png/collection?slug=${encodeURIComponent(doc.slug)})
- [Social card](${collectionCard(doc.slug, origin)})
- [More collections](${base}/collections)
- [Guide for agents](${base}/llms.txt)
`;
}

/** The Markdown at /{name}.md: a palette's, by its seed or an old grabient.com id the maps hold, else a public
    collection's. */
export async function markdownFile(
  name: string,
  request: Request,
  origin: string,
  reads: MarkdownReads
): Promise<Response> {
  const base = origin.replace(/\/$/, "");
  const found = resolvePalette(name);
  if (found) {
    const { seed, palette } = found;
    // the view as the file's cache key reads it (files/keys.ts), so one key never holds two files
    const view = viewAt(addressParams(new URL(request.url).searchParams), palette.anchors.length);
    const [{ saved, written, heldBy }, names] = await Promise.all([
      reads.paletteWords(seed).catch(() => ({ saved: undefined, written: null, heldBy: [] })),
      reads.colorNames?.() ?? null
    ]);
    const text = paletteMarkdown(seed, base, view, written, heldBy, names);
    if (text !== null)
      return new Response(text, { headers: markdown(base + paletteAddress(seed, saved), TEXT) });
  }
  if (!found && reads.isCollection(name)) {
    const doc = await reads.collection(name);
    /* a collection changes as palettes join it: its Markdown follows within five minutes, as its page does */
    return doc
      ? new Response(collectionMarkdown(doc, origin), {
          headers: markdown(`${base}/${doc.slug}`, PAGE)
        })
      : json({ error: "No collection has this address." }, { status: 404 });
  }
  return json({ error: "Invalid palette seed." }, { status: 404 });
}
