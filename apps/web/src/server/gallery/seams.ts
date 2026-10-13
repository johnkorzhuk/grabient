import { all, first, replica } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import type { CollectionPage, CollectionSummary } from "../../features/gallery/collections.ts";
import type { SearchItem } from "../../features/gallery/schema.ts";
import { itemOf } from "./palettes.ts";

/* What the gallery's server takes from the areas around it, each under the name and shape its spec gives it: the
   search (U07) and the collections (U04). These are stand-ins until those areas land; each says what it stands in
   for, and the gallery calls nothing of theirs but through here. */

/** Stands in for the search's index write when a palette joins the gallery (U07 J, `afterWrite`). */
export function paletteJoined(_env: Env, _seed: string): void {}

export interface SearchAnswer {
  items: SearchItem[];
  /** who answered: words the vocabulary read, colors, a palette's likeness, or `account` when only an account's search
      can; `unavailable` when the search files are missing */
  tier: string;
  partial?: boolean;
  /** an allowance ran out */
  limited?: boolean;
  /** read without the model a reader would have been given: never kept for others */
  unkept?: boolean;
}

/** Stands in for the public search (U07 C, `searchPalettes`): its candidates, at most `limit`. */
export async function searchPalettes(
  _env: Env,
  _words: string,
  _options: { limit: number; request: Request }
): Promise<SearchAnswer> {
  return { items: [], tier: "words" };
}

/** Stands in for the free search of an account's own likes (U07 G, `searchOwnSeeds`): the seeds that answer the words,
    best first. */
export async function searchOwn(
  _env: Env,
  _words: string,
  _seeds: readonly string[],
  _request: Request
): Promise<{ tier: string; found: { seed: string; score: number }[] }> {
  return { tier: "words", found: [] };
}

interface CollectionRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  tags: string;
  visibility: "public" | "private";
  owner_kind: "user" | "agent";
  owner_name: string | null;
  owner_display: string | null;
  item_count: number;
  created_at: number;
  updated_at: number;
  fork_count: number;
}

const PREVIEW_ITEMS = 12;

/** Stands in for the collections list's own page (U04, `publicCollections`): the public collections in the hot order
    (or, searched, the popular one), each with its twelve most liked palettes. Words are read as plain letters here. */
export async function publicCollections(
  env: Pick<Env, "DB">,
  input: { query: string; sort: "hot" | "popular"; page: number; limit: number }
): Promise<CollectionPage> {
  const db = replica(env);
  const popular = "c.fork_count DESC, c.likes_sum DESC, c.updated_at DESC";
  const order = input.sort === "hot" ? `c.hot DESC, ${popular}` : popular;
  const words = input.query ? ` AND instr(lower(c.title), ?) > 0` : "";
  const bound = input.query ? [input.query] : [];
  const [count, rows] = await Promise.all([
    first<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM k_collections c WHERE c.visibility = 'public'${words}`,
      ...bound
    ),
    all<CollectionRow>(
      db,
      `SELECT c.id, c.slug, c.title, c.description, c.tags, c.visibility, c.owner_kind, c.item_count, c.created_at,
         c.updated_at, c.fork_count,
         CASE WHEN c.owner_kind = 'user' THEN u.username ELSE c.owner_id END AS owner_name,
         CASE WHEN c.owner_kind = 'user' THEN u.name ELSE NULL END AS owner_display
       FROM k_collections c LEFT JOIN auth_user u ON c.owner_kind = 'user' AND u.id = c.owner_id
       WHERE c.visibility = 'public'${words} ORDER BY ${order}, c.id LIMIT ? OFFSET ?`,
      ...bound,
      input.limit,
      (input.page - 1) * input.limit
    )
  ]);
  const ids = rows.map(row => row.id);
  const items = ids.length
    ? await all<{
        collection_id: string;
        seed: string;
        style: string;
        steps: number;
        angle: number;
        created_at: number | null;
        likes_count: number | null;
        position: number;
      }>(
        db,
        `SELECT collection_id, seed, style, steps, angle, created_at, likes_count, position FROM (
           SELECT i.collection_id, i.seed, i.style, i.steps, i.angle, i.position,
             COALESCE(p.created_at, i.created_at) AS created_at, p.likes_count,
             ROW_NUMBER() OVER (PARTITION BY i.collection_id ORDER BY COALESCE(p.likes_count, 0) DESC, i.position) AS n
           FROM k_collection_items i LEFT JOIN k_palettes p ON p.seed = i.seed
           WHERE i.collection_id IN (${ids.map(() => "?").join(",")})
         ) WHERE n <= ? ORDER BY collection_id, n`,
        ...ids,
        PREVIEW_ITEMS
      )
    : [];
  const previews = Map.groupBy(items, item => item.collection_id);
  const total = Number(count?.n ?? 0);
  const summaries: CollectionSummary[] = rows.map(row => ({
    slug: row.slug,
    title: row.title,
    description: row.description,
    tags: JSON.parse(row.tags || "[]") as string[],
    visibility: row.visibility,
    owner: {
      kind: row.owner_kind,
      name: row.owner_name,
      ...(row.owner_kind === "user" ? { display: row.owner_display?.trim() || null } : {})
    },
    itemCount: Number(row.item_count) || 0,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    saves: Math.max(0, Number(row.fork_count) || 0),
    preview: (previews.get(row.id) ?? []).flatMap(item => {
      const shown = itemOf({ ...item, created_at: item.created_at ?? row.created_at });
      return shown
        ? [
            {
              seed: shown.kseed,
              style: shown.style,
              steps: shown.steps,
              angle: shown.angle,
              createdAt: shown.createdAt,
              likes: shown.likes,
              position: Number(item.position)
            }
          ]
        : [];
    })
  }));
  return {
    query: input.query,
    sort: input.sort,
    items: summaries,
    total,
    page: input.page,
    limit: input.limit,
    totalPages: Math.max(1, Math.ceil(total / input.limit)),
    fetchedAt: Date.now()
  };
}
