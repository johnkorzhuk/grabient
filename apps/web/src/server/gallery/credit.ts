import { decodePalette, encodePalette } from "@grabient/engine";
import { msg } from "@grabient/i18n";
import { all, replica } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { readUsername } from "../../features/account/username.ts";
import type { Credit } from "../../features/gallery/credit.ts";
import { CREDIT } from "../../lib/cache.ts";
import { json } from "../../lib/responses.ts";

/* Who brought a palette to Grabient, as its cards, its page and the MCP credit it: whoever held it first.
   Grabient, where the site made the palette: one of its own collections or an admin's held it no later than the first
   like that stands, public or not (the agents fill Grabient's, and the admins fill theirs with their apps); the gallery
   held it before anyone liked it or put it in a collection (2017's palettes, the site's own publishing, a like since
   taken back); a persona's scheduled like came first, or an admin's made through a connected app; and, with no like at
   all, where the gallery or a public collection of the site's shows it. An admin by their username only for a palette
   their own like on the site brought, one nothing held before: a palette they made. Else the account that liked it
   first, by the username it chose to show there (account/credit.ts), and no one where it chose none. Likes are ranked
   by the server's own time (listed_at, migration 0061), never the time a request may claim for an undo; likes taken
   back are gone, so the credit goes to the first like that stands. Read from a replica for every answer and kept half
   a minute at the edge, never in a page's document, so a name turned off leaves within the minute. CROSS JOIN keeps
   SQLite on the likes' and the items' seed indexes. */

const CREDITS = `WITH asked(seed) AS (SELECT DISTINCT value FROM json_each(?)),
  firsts AS (SELECT seed, user_id, listed_at FROM (SELECT a.seed, l.user_id, l.listed_at,
      ROW_NUMBER() OVER (PARTITION BY a.seed ORDER BY l.listed_at, l.user_id) AS n
    FROM asked a CROSS JOIN k_likes l ON l.palette_id = a.seed) WHERE n = 1),
  held AS (SELECT a.seed, MIN(COALESCE(j.created_at, c.created_at)) AS held_at,
      MIN(CASE WHEN c.owner_kind = 'agent' OR o.role = 'admin' THEN COALESCE(j.created_at, c.created_at) END) AS site_at,
      MAX(c.visibility = 'public' AND (c.owner_kind = 'agent' OR o.role = 'admin')) AS site_shows
    FROM asked a CROSS JOIN k_collection_items j ON j.seed = a.seed
    CROSS JOIN k_collections c ON c.id = j.collection_id
    LEFT JOIN auth_user o ON c.owner_kind = 'user' AND o.id = c.owner_id
    GROUP BY a.seed)
SELECT a.seed, f.listed_at AS liked_at, l.via, u.role, u.username, u.credit_name,
  EXISTS (SELECT 1 FROM k_personas x WHERE x.user_id = f.user_id) AS persona,
  p.created_at AS gallery_at, h.held_at, h.site_at, COALESCE(h.site_shows, 0) AS site_shows
FROM asked a LEFT JOIN firsts f ON f.seed = a.seed
  LEFT JOIN k_likes l ON l.user_id = f.user_id AND l.palette_id = f.seed
  LEFT JOIN auth_user u ON u.id = f.user_id
  LEFT JOIN k_palettes p ON p.seed = a.seed
  LEFT JOIN held h ON h.seed = a.seed`;

interface CreditRow {
  seed: string;
  liked_at: number | null;
  via: string | null;
  role: string | null;
  username: string | null;
  credit_name: string | null;
  persona: number;
  gallery_at: number | null;
  held_at: number | null;
  site_at: number | null;
  site_shows: number;
}

const GRABIENT: Credit = { by: "grabient" };

/** How far apart a like and the gallery's time may be and still be one act: a like that brings a palette to the gallery
    writes its row in the same request, a few milliseconds away on another clock. */
const SAME_ACT = 60_000;

const time = (value: number | null) => (value === null ? null : Number(value));
/** A name as the username rules allow it now: an account's row may hold one from before them, which shows nothing. */
const named = (username: string | null): string | null =>
  username && readUsername(username).problem === null ? username : null;
/** An admin by their username, the site's own and never screened, and Grabient where they have none. */
const admin = (username: string | null): Credit => {
  const name = named(username);
  return name ? { by: "person", name } : GRABIENT;
};

/** A row's credit: whoever held the palette first. Anyone but an admin is named only while the name is the one its
    account chose to show and still holds. */
function creditOf(row: CreditRow): Credit | null {
  const liked = time(row.liked_at);
  const site = time(row.site_at);
  const gallery = time(row.gallery_at);
  const held = time(row.held_at);
  if (liked === null) return gallery !== null || row.site_shows ? GRABIENT : null;
  if (site !== null && site <= liked) return GRABIENT;
  // the gallery's own time, from before any collection held the palette, ahead of the first like
  if (gallery !== null && gallery < liked - SAME_ACT && (held === null || held > gallery))
    return GRABIENT;
  if (row.persona) return GRABIENT;
  if (row.role === "admin") {
    // the gallery's time counts every collection that held the palette before it, anyone's
    const brought = row.via !== "mcp" && (gallery === null || gallery >= liked - SAME_ACT);
    return brought ? admin(row.username) : GRABIENT;
  }
  const name = named(row.credit_name);
  return name && name === row.username ? { by: "person", name } : null;
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
