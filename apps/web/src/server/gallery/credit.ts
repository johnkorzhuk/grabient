import { decodePalette, encodePalette } from "@grabient/engine";
import { msg } from "@grabient/i18n";
import { all, replica } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import type { Credit } from "../../features/gallery/credit.ts";
import { CREDIT } from "../../lib/cache.ts";
import { json } from "../../lib/responses.ts";

/* Who brought a palette to Grabient, as its cards, its page and the MCP credit it: whoever showed or liked it first.
   Grabient, where one of its own collections showed the palette first, or it came to the gallery with no like at all;
   an admin by their username, where they liked it first or a public collection of theirs showed it first (Grabient
   where they have none); else the account that liked it first, by the username it chose to show there
   (account/credit.ts), and no one where it chose none. Likes taken back are gone, so the credit goes to the first like
   that stands. Read from a replica for every answer and kept half a minute at the edge, never in a page's document,
   so a name turned off leaves within the minute. CROSS JOIN keeps SQLite on the likes' and the items' seed indexes. */

const CREDITS = `WITH asked(seed) AS (SELECT DISTINCT value FROM json_each(?)),
  firsts AS (SELECT seed, user_id, created_at FROM (SELECT a.seed, l.user_id, l.created_at,
      ROW_NUMBER() OVER (PARTITION BY a.seed ORDER BY l.created_at, l.user_id) AS n
    FROM asked a CROSS JOIN k_likes l ON l.palette_id = a.seed) WHERE n = 1),
  shown AS (SELECT seed, at, owner_kind, username FROM (SELECT a.seed,
      COALESCE(j.created_at, c.created_at) AS at, c.owner_kind, o.username,
      ROW_NUMBER() OVER (PARTITION BY a.seed ORDER BY COALESCE(j.created_at, c.created_at), c.id) AS n
    FROM asked a CROSS JOIN k_collection_items j ON j.seed = a.seed
    CROSS JOIN k_collections c ON c.id = j.collection_id AND c.visibility = 'public'
    LEFT JOIN auth_user o ON c.owner_kind = 'user' AND o.id = c.owner_id
    WHERE c.owner_kind = 'agent' OR o.role = 'admin') WHERE n = 1)
SELECT a.seed, f.created_at AS liked_at, u.role, u.username, u.credit_name, s.at AS shown_at,
  s.owner_kind AS shown_by, s.username AS shown_name,
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
  shown_by: string | null;
  shown_name: string | null;
  gallery: number;
}

const GRABIENT: Credit = { by: "grabient" };

/** An admin by their username, the site's own and never screened, and Grabient where they have none. */
const admin = (username: string | null): Credit =>
  username ? { by: "person", name: username } : GRABIENT;

/** A row's credit: whoever showed or liked the palette first. Anyone but an admin is named only while the name is the
    one its account chose to show and still holds. */
function creditOf(row: CreditRow): Credit | null {
  const liked = row.liked_at === null ? null : Number(row.liked_at);
  const shown = row.shown_at === null ? null : Number(row.shown_at);
  if (shown !== null && (liked === null || shown <= liked))
    return row.shown_by === "agent" ? GRABIENT : admin(row.shown_name);
  if (liked === null) return row.gallery ? GRABIENT : null;
  if (row.role === "admin") return admin(row.username);
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
