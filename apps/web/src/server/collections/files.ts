import { decodePalette } from "@grabient/engine";
import { MARKDOWN_LEAD, type PaletteWords } from "@grabient/engine/markdown.ts";
import { titleFaults } from "@grabient/engine/name.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import type { Style } from "@grabient/engine/view.ts";
import { all } from "@grabient/server/db/d1.ts";
import { collectionBySlug, collectionsHolding, type Reader } from "./read.ts";

export { isCollectionSlug } from "../../features/collections/address.ts";

/* What a public collection's files (its Markdown and swatch files) and a palette's Markdown read of the collections:
   the files area writes them. Agents read them, so they stay in English. */

/** A public collection as its files write it: each palette in the collection's own order, with the title written for
    it where its colors bear the title out. */
export interface CollectionForFiles {
  slug: string;
  title: string;
  description: string;
  tags: readonly string[];
  itemCount: number;
  /** who collected it, as the file says it */
  owner: string;
  updatedAt: number;
  items: readonly { seed: string; style: Style; steps: number; angle: number; title?: string }[];
}

interface TextRow {
  seed: string;
  title: string;
  embed: string;
}
export const texts = async (env: Reader, seeds: readonly string[]) =>
  seeds.length
    ? await all<TextRow>(
        env.DB,
        "SELECT seed, title, embed FROM k_palette_texts WHERE seed IN (SELECT value FROM json_each(?))",
        JSON.stringify([...new Set(seeds)])
      )
    : [];

/** A palette's written words as a reader is shown them: the title only where the palette's colors bear it out, and the
    description only beside it and where it holds too. */
export function heldWords(
  text: TextRow | undefined,
  palette: Palette | null
): { title: string; embed: string } | null {
  if (!text || !palette || titleFaults(text.title, palette).length) return null;
  return {
    title: text.title,
    embed: text.embed && !titleFaults(text.embed, palette).length ? text.embed : ""
  };
}

/** The public collection at `slug`, as its files write it; null for a private one or none. */
export async function collectionForFiles(
  env: Reader,
  slug: string
): Promise<CollectionForFiles | null> {
  const doc = await collectionBySlug(env, slug);
  if (!doc) return null;
  const written = new Map(
    (
      await texts(
        env,
        doc.items.map(item => item.kseed)
      )
    ).map(text => [text.seed, text])
  );
  return {
    slug: doc.slug,
    title: doc.title,
    description: doc.description,
    tags: doc.tags,
    itemCount: doc.itemCount,
    owner:
      doc.owner.kind === "agent"
        ? "Grabient"
        : doc.owner.display || doc.owner.name || "a Grabient account",
    updatedAt: doc.updatedAt,
    items: doc.items.map(item => {
      const title = heldWords(written.get(item.kseed), decodePalette(item.kseed))?.title;
      return {
        seed: item.kseed,
        style: item.style,
        steps: item.steps,
        angle: item.angle,
        ...(title ? { title } : {})
      };
    })
  };
}

/** What a palette's Markdown says beyond its colors: the words written for it that its colors bear out, its
    description cut to the file's lead, and the public collections that hold it. */
export async function paletteWords(
  env: Reader,
  seed: string
): Promise<{ written: PaletteWords | null; heldBy: { slug: string; title: string }[] }> {
  const [[text], held] = await Promise.all([texts(env, [seed]), collectionsHolding(env, seed)]);
  const words = heldWords(text, decodePalette(seed));
  return {
    written: words && {
      title: words.title,
      ...(words.embed ? { lead: clip(words.embed, MARKDOWN_LEAD) } : {})
    },
    heldBy: held.map(({ slug, title }) => ({ slug, title }))
  };
}

/** Text cut to `max` characters: at the last sentence's end past its first sixty, else at a word past them, with an
    ellipsis. */
function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  let end = 0;
  for (const found of cut.matchAll(/[.!?](?= )|[。！？]/g)) end = found.index + 1;
  if (end > 60) return cut.slice(0, end);
  const word = cut.lastIndexOf(" ");
  return `${(word > 60 ? cut.slice(0, word) : cut.slice(0, max - 1)).replace(/[,;:、，]$/, "")}…`;
}
