import { decodePalette, encodePalette } from "@grabient/engine";
import { msg } from "@grabient/i18n";
import { all, replica } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import type { Credit } from "../../features/gallery/credit.ts";
import { CREDIT } from "../../lib/cache.ts";
import { json } from "../../lib/responses.ts";

/* Who brought a palette to Grabient, as its cards, its page and the MCP credit it. Grabient, where one of its own
   collections or an admin's showed the palette before anyone liked it, an admin liked it first, or it came to the
   gallery with no like at all; else the account that liked it first, by the username it chose to show there
   (account/credit.ts), and no one where it chose none. Likes taken back are gone, so the credit goes to the first like
   that stands. Read from a replica for every answer and kept half a minute at the edge, never in a page's document,
   so a name turned off leaves within the minute. CROSS JOIN keeps SQLite on the likes' and the items' seed indexes. */

const CREDITS = `WITH asked(seed) AS (SELECT DISTINCT value FROM json_each(?)),
  firsts AS (SELECT seed, user_id, created_at FROM (SELECT a.seed, l.user_id, l.created_at,
      ROW_NUMBER() OVER (PARTITION BY a.seed ORDER BY l.created_at, l.user_id) AS n
    FROM asked a CROSS JOIN k_likes l ON l.palette_id = a.seed) WHERE n = 1),
  shown AS (SELECT a.seed, MIN(COALESCE(j.created_at, c.created_at)) AS at
    FROM asked a CROSS JOIN k_collection_items j ON j.seed = a.seed
    CROSS JOIN k_collections c ON c.id = j.collection_id AND c.visibility = 'public'
    LEFT JOIN auth_user o ON c.owner_kind = 'user' AND o.id = c.owner_id
    WHERE c.owner_kind = 'agent' OR o.role = 'admin' GROUP BY a.seed)
SELECT a.seed, f.created_at AS liked_at, u.role, u.username, u.credit_name, s.at AS shown_at,
  EXISTS (SELECT 1 FROM k_palettes p WHERE p.seed = a.seed) AS gallery
FROM asked a LEFT JOIN firsts f ON f.seed = a.seed LEFT JOIN auth_user u ON u.id = f.user_id
  LEFT JOIN shown s ON s.seed = a.seed`;

interface CreditRow {
  seed: string;
  liked_at: number | null;
  role: string | null;
  username: string | null;
  credit_name: string | null;
  shown_at: number | null;
  gallery: number;
}

const GRABIENT: Credit = { by: "grabient" };

/** A row's credit: whoever showed or liked the palette first, Grabient for its admins. A name counts only while it is
    the one its account chose to show and still holds. */
function creditOf(row: CreditRow): Credit | null {
  const liked = row.liked_at === null ? null : Number(row.liked_at);
  const shown = row.shown_at === null ? null : Number(row.shown_at);
  if (shown !== null && (liked === null || shown <= liked)) return GRABIENT;
  if (liked === null) return row.gallery ? GRABIENT : null;
  if (row.role === "admin") return GRABIENT;
  return row.credit_name && row.credit_name === row.username
    ? { by: "person", name: row.credit_name }
    : null;
}

/** Each palette's credit, by seed: null for one no one is credited for. */
export async function creditsOf(
  source: Pick<Env, "DB">,
  seeds: readonly string[]
): Promise<Map<string, Credit | null>> {
  if (!seeds.length) return new Map();
  const rows = await all<CreditRow>(replica(source), CREDITS, JSON.stringify(seeds));
  return new Map(rows.map(row => [row.seed, creditOf(row)]));
}

/** `GET /api/palette-credit?seed=`: who to credit for a palette, `{ credit }`, kept half a minute at the edge. An
    address that is no palette's canonical seed is 404, and a failed read 503, which the browser asks again. */
export async function paletteCreditResponse(
  request: Request,
  source: Pick<Env, "DB">
): Promise<Response> {
  const seed = new URL(request.url).searchParams.get("seed") ?? "";
  const palette = decodePalette(seed);
  if (!palette || encodePalette(palette) !== seed)
    return json({ error: msg("Not found") }, { status: 404 });
  try {
    const credit = (await creditsOf(source, [seed])).get(seed) ?? null;
    return json({ credit }, { headers: CREDIT });
  } catch (error) {
    console.error("Palette credit unread", String(error));
    return json({ error: msg("Something went wrong. Try again.") }, { status: 503 });
  }
}
