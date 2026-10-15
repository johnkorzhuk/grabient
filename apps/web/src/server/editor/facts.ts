import { env } from "cloudflare:workers";
import { decodePalette, encodePalette, type Palette } from "@grabient/engine";
import { titleFaults } from "@grabient/engine/name.ts";
import { DEFAULT_LOCALE, type Locale, messageKey, msg } from "@grabient/i18n";
import { all, replica } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import type { PaletteFacts } from "../../features/editor/facts.ts";
import { PALETTE_PAGE } from "../../lib/cache.ts";
import { json } from "../../lib/responses.ts";
import { SAVED_VIEW, savedView } from "../collections/files.ts";
import { colorsOf, LEAD_SEEDS } from "../collections/read.ts";

/* What only the database knows of a palette, for its page: the words written for it that its colors bear out with the
   view it was saved in, which its page wears them in alone, the public collections that hold it, the most saved
   first, each titled in the page's language where it is translated, and how many like it. The page's title, its description, its static page for crawlers and its Markdown read them,
   and its heart starts from the count. Read once per page, or per answer to a browser that opens the palette, the edge
   has no copy of, from a replica, in one round of three queries. A failed read of the words or the collections leaves
   the facts out: the page goes by the palette's colors, and no cache keeps it. A count that cannot be read is left
   out alone, and the browser asks for it. */

const HELD_MAX = 6;

/* each collection's first palettes come with it for its colors, in the order its page opens in; CROSS JOIN keeps
   SQLite on the items' seed index */
const HOLDING = `SELECT c.slug, c.title, c.description, t.title AS said, t.source, ${LEAD_SEEDS} AS seeds
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

/** A palette's facts, or null when a read failed. */
export async function paletteFacts(
  seed: string,
  palette: Palette,
  locale: Locale,
  source: Pick<Env, "DB"> = env
): Promise<PaletteFacts | null> {
  const db = replica(source);
  const [read, counted] = await Promise.all([
    Promise.all([
      all<{ title: string; embed: string; saved: string | null }>(
        db,
        `SELECT t.title, t.embed, ${SAVED_VIEW("t.seed")} AS saved FROM k_palette_texts t WHERE t.seed = ?`,
        seed
      ),
      all<HeldRow>(db, HOLDING, locale === DEFAULT_LOCALE ? "" : locale, seed)
    ]).catch((error: unknown) => {
      console.error("Palette facts unread", String(error));
      return null;
    }),
    all<{ n: number }>(db, "SELECT likes_count AS n FROM k_palettes WHERE seed = ?", seed).then(
      rows => Math.max(0, Number(rows[0]?.n) || 0),
      (error: unknown) => void console.error("Palette likes unread", String(error))
    )
  ]);
  if (!read) return null;
  const [texts, held] = read;
  const text = texts[0];
  const view = savedView(text?.saved);
  /* a title the colors contradict is left out, and the description goes with it, as are the words of a palette nothing
     saved, which no view is theirs */
  const written =
    text && view && !titleFaults(text.title, palette).length
      ? {
          title: text.title,
          ...(text.embed && !titleFaults(text.embed, palette).length
            ? { description: text.embed }
            : {}),
          view
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
        colors: colorsOf(row.seeds)
      };
    }),
    ...(counted === undefined ? {} : { likes: counted }),
    readAt: Date.now()
  };
}

/** `GET /api/palette-facts?seed=`: a palette's facts in English, the language its written words are in, for a page the
    browser opens on it; kept at the edge as its page is. An address that is no palette's canonical seed is 404, and a
    failed read 503, which the browser takes for no facts and asks again. */
export async function paletteFactsResponse(
  request: Request,
  source: Pick<Env, "DB"> = env
): Promise<Response> {
  const seed = new URL(request.url).searchParams.get("seed") ?? "";
  const palette = decodePalette(seed);
  if (!palette || encodePalette(palette) !== seed)
    return json({ error: msg("Not found") }, { status: 404 });
  const facts = await paletteFacts(seed, palette, DEFAULT_LOCALE, source);
  return facts
    ? json(facts, { headers: PALETTE_PAGE })
    : json({ error: msg("Something went wrong. Try again.") }, { status: 503 });
}
