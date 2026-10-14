import { env } from "cloudflare:workers";
import { decodePalette, encodePalette, type Palette } from "@grabient/engine";
import { DOMINANT_PALETTES, dominantColors } from "@grabient/engine/dominant.ts";
import { titleFaults } from "@grabient/engine/name.ts";
import { DEFAULT_LOCALE, type Locale, messageKey, msg } from "@grabient/i18n";
import { all, replica } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import type { PaletteFacts } from "../../features/editor/facts.ts";
import { PALETTE_PAGE } from "../../lib/cache.ts";
import { json } from "../../lib/responses.ts";

/* What only the database knows of a palette, for its page: the words written for it that its colors bear out, and the
   public collections that hold it, the most saved first, each titled in the page's language where it is translated.
   The page's title, its description, its static page for crawlers and its Markdown read them. Read once per page, or
   per answer to a browser that opens the palette, the edge has no copy of, from a replica, in one round of two
   queries; a read that fails leaves its facts out, and the page goes by the palette's colors. */

const HELD_MAX = 6;
const missed = (error: unknown): never[] => {
  console.error("Palette facts unread", String(error));
  return [];
};

/* each collection's first palettes come with it for its colors; CROSS JOIN keeps SQLite on the items' seed index */
const HOLDING = `SELECT c.slug, c.title, c.description, t.title AS said, t.source,
    (SELECT group_concat(seed, ' ') FROM (SELECT p.seed FROM k_collection_items p WHERE p.collection_id = c.id
      ORDER BY p.position LIMIT ${DOMINANT_PALETTES})) AS seeds
  FROM k_collection_items i CROSS JOIN k_collections c ON c.id = i.collection_id
  LEFT JOIN k_translations t ON t.kind = 'collection' AND t.key = c.id AND t.locale = ?
  WHERE i.seed = ? AND c.visibility = 'public'
  GROUP BY c.id ORDER BY c.fork_count DESC, c.updated_at DESC, c.id LIMIT ${HELD_MAX}`;

interface HeldRow {
  slug: string;
  title: string;
  description: string;
  said: string | null;
  source: string | null;
  seeds: string | null;
}

export async function paletteFacts(
  seed: string,
  palette: Palette,
  locale: Locale,
  source: Pick<Env, "DB"> = env
): Promise<PaletteFacts> {
  const db = replica(source);
  const [texts, held] = await Promise.all([
    all<{ title: string; embed: string }>(
      db,
      "SELECT title, embed FROM k_palette_texts WHERE seed = ?",
      seed
    ).catch(missed),
    all<HeldRow>(db, HOLDING, locale === DEFAULT_LOCALE ? "" : locale, seed).catch(missed)
  ]);
  const text = texts[0];
  /* a title the colors contradict is left out, and the description goes with it */
  const written =
    text && !titleFaults(text.title, palette).length
      ? {
          title: text.title,
          ...(text.embed && !titleFaults(text.embed, palette).length
            ? { description: text.embed }
            : {})
        }
      : undefined;
  return {
    ...(written ? { written } : {}),
    heldBy: held.map(row => {
      /* a translation counts while the English it was made from is still the collection's */
      const current = row.said && row.source === messageKey(`${row.title}\n${row.description}`);
      return {
        slug: row.slug,
        title: current ? (row.said as string) : row.title,
        ...(current ? { english: row.title } : {}),
        colors: dominantColors((row.seeds ?? "").split(" ").filter(Boolean))
      };
    })
  };
}

/** `GET /api/palette-facts?seed=`: a palette's facts in English, the language its written words are in, for a page the
    browser opens on it; kept at the edge as its page is. An address that is no palette's canonical seed is 404. */
export async function paletteFactsResponse(
  request: Request,
  source: Pick<Env, "DB"> = env
): Promise<Response> {
  const seed = new URL(request.url).searchParams.get("seed") ?? "";
  const palette = decodePalette(seed);
  if (!palette || encodePalette(palette) !== seed)
    return json({ error: msg("Not found") }, { status: 404 });
  return json(await paletteFacts(seed, palette, DEFAULT_LOCALE, source), { headers: PALETTE_PAGE });
}
