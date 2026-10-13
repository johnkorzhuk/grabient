import { decodePalette, encodePalette, sampleStops } from "@grabient/engine";
import { type PaletteWords, paletteMarkdown, plain } from "@grabient/engine/markdown.ts";
import { seedName } from "@grabient/engine/name.ts";
import { drawnView, parseView, type Style, styleWords, viewSearch } from "@grabient/engine/view.ts";
import { PAGE, TEXT } from "../../lib/cache.ts";
import { collectionCard } from "../../lib/page-meta.ts";
import { json } from "../../lib/responses.ts";
import { AGENT_DATA } from "./agents.ts";
import { legacySeed } from "./legacy.ts";
import { isoDay } from "./text.ts";

/* A palette or a collection as Markdown at its address plus .md, for an agent that reads text. A palette's is the
   engine's, with what only the database knows: the words written for it that its colors bear out, and the public
   collections that hold it. A collection's says its words, then every palette with its colors and its address. Both are
   English, out of search results, and name their page as canonical. */

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
    written: PaletteWords | null;
    heldBy: readonly { slug: string; title: string }[];
  }>;
  /** a public collection, or null where none is */
  collection(address: string): Promise<CollectionWords | null>;
  /** whether a name has a collection's address's shape */
  isCollection(address: string): boolean;
}

const markdown = (canonical: string, cache: Record<string, string>) => ({
  ...cache,
  ...AGENT_DATA,
  "Content-Type": "text/markdown; charset=utf-8",
  Link: `<${canonical}>; rel="canonical"`
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
  const palette = decodePalette(legacySeed(name) ?? name);
  if (palette) {
    const seed = encodePalette(palette);
    const view = parseView(new URL(request.url).searchParams);
    const { written, heldBy } = await reads
      .paletteWords(seed)
      .catch(() => ({ written: null, heldBy: [] }));
    const text = paletteMarkdown(seed, base, view, written, heldBy);
    if (text !== null) return new Response(text, { headers: markdown(`${base}/${seed}`, TEXT) });
  }
  if (!palette && reads.isCollection(name)) {
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
