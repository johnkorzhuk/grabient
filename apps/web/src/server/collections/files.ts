import { decodePalette } from "@grabient/engine";
import { MARKDOWN_LEAD, type PaletteWords } from "@grabient/engine/markdown.ts";
import { titleFaults } from "@grabient/engine/name.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { asSaved, isStyle, type Style, type View } from "@grabient/engine/view.ts";
import { all, first } from "@grabient/server/db/d1.ts";
import { collectionBySlug, collectionsHolding, type Reader } from "./read.ts";

export { isCollectionSlug } from "../../features/collections/address.ts";

/* What a public collection's files (its Markdown and swatch files) and a palette's Markdown read of the collections:
   the files area writes them. Agents read them, so they stay in English. */

/** A public collection as its files write it: each palette in the collection's own order, with the title written for
    it where its colors bear the title out and the collection holds it in the view it was saved in. */
export interface CollectionForFiles {
  slug: string;
  title: string;
  description: string;
  tags: readonly string[];
  itemCount: number;
  /** who collected it, as the file says it */
  owner: string;
  updatedAt: number;
  items: readonly {
    seed: string;
    style: Style;
    steps: number;
    angle: number;
    title?: string;
    description?: string;
  }[];
}

/** The view a palette was saved in when its words were written, which they describe, as a JSON array of style, steps
    and angle, for the palette whose seed `seed` names: the gallery's, else the one the first of Grabient's collections
    to take it gave it (an item taken before items kept their times first). Null for a palette neither holds. */
export const SAVED_VIEW = (seed: string) => `COALESCE(
  (SELECT json_array(p.style, p.steps, p.angle) FROM k_palettes p WHERE p.seed = ${seed}),
  (SELECT json_array(i.style, i.steps, i.angle) FROM k_collection_items i
     JOIN k_collections c ON c.id = i.collection_id AND c.owner_kind = 'agent'
     WHERE i.seed = ${seed} ORDER BY i.created_at IS NOT NULL, i.created_at, c.created_at, i.position LIMIT 1))`;

/** One palette's row, by the seed it is read with: the words written for it where any are, and SAVED_VIEW's view
    whether or not they are. */
export const SAVED_TEXT = `SELECT t.title, t.embed, ${SAVED_VIEW("s.seed")} AS saved
  FROM (SELECT ? AS seed) s LEFT JOIN k_palette_texts t ON t.seed = s.seed`;

export type SavedView = Pick<View, "style" | "steps" | "angle">;
/** A view SAVED_VIEW read, or none. */
export function savedView(raw: string | null | undefined): SavedView | undefined {
  if (!raw) return undefined;
  try {
    const [style, steps, angle] = JSON.parse(raw) as unknown[];
    return isStyle(style) && Number.isInteger(steps) && Number.isInteger(angle)
      ? { style, steps: steps as number, angle: angle as number }
      : undefined;
  } catch {
    return undefined;
  }
}

interface TextRow {
  seed: string;
  title: string;
  embed: string;
  /** SAVED_VIEW's */
  saved: string | null;
}
export const texts = async (env: Reader, seeds: readonly string[]) =>
  seeds.length
    ? await all<TextRow>(
        env.DB,
        `SELECT t.seed, t.title, t.embed, ${SAVED_VIEW("t.seed")} AS saved FROM k_palette_texts t
         WHERE t.seed IN (SELECT value FROM json_each(?))`,
        JSON.stringify([...new Set(seeds)])
      )
    : [];

/** A palette's written words where its colors bear the title out, with the view it was saved in, which they describe:
    the description only where it holds too. None for a palette nothing saved. */
export function writtenWords(
  text: TextRow | undefined,
  palette: Palette | null
): { title: string; embed: string; view: SavedView } | null {
  const view = savedView(text?.saved);
  if (!text || !palette || !view || titleFaults(text.title, palette).length) return null;
  return {
    title: text.title,
    embed: text.embed && !titleFaults(text.embed, palette).length ? text.embed : "",
    view
  };
}

/** A palette's written words as a reader is shown them in `view`: only while it is drawn as it was saved. */
export function heldWords(
  text: TextRow | undefined,
  palette: Palette | null,
  view: Partial<View>
): { title: string; embed: string } | null {
  const words = writtenWords(text, palette);
  return words && palette && asSaved(palette, view, words.view) ? words : null;
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
    // a palette is named as its collection names it, else by the words written for it that its view bears out
    items: doc.items.map(item => {
      const title =
        item.title ?? heldWords(written.get(item.kseed), decodePalette(item.kseed), item)?.title;
      return {
        seed: item.kseed,
        style: item.style,
        steps: item.steps,
        angle: item.angle,
        ...(title ? { title } : {}),
        ...(item.description ? { description: item.description } : {})
      };
    })
  };
}

/** What a palette's Markdown says beyond its colors: the view it was saved in, which its page's address draws, the
    words written for it that its colors bear out, its description cut to the file's lead, which the file names it by in
    that view alone, and the public collections that hold it. */
export async function paletteWords(
  env: Reader,
  seed: string
): Promise<{
  saved?: SavedView;
  written: PaletteWords | null;
  heldBy: { slug: string; title: string }[];
}> {
  const [row, held] = await Promise.all([
    first<{ title: string | null; embed: string | null; saved: string | null }>(
      env.DB,
      SAVED_TEXT,
      seed
    ),
    collectionsHolding(env, seed)
  ]);
  const saved = savedView(row?.saved);
  const text = row?.title
    ? { seed, title: row.title, embed: row.embed ?? "", saved: row.saved }
    : undefined;
  const words = writtenWords(text, decodePalette(seed));
  return {
    ...(saved ? { saved } : {}),
    written: words && {
      title: words.title,
      ...(words.embed ? { lead: clip(words.embed, MARKDOWN_LEAD) } : {}),
      view: words.view
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
