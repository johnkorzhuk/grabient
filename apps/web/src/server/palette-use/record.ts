import { all, batch } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { KEEP_DAYS, type UseAction, type UseSurface } from "./use.ts";

/* What the admins' tools read of palette use: a window of days summed, the editor's changes averaged, each public
   collection's page views by day, and the site as the signals read it. */

const DAY = 86_400_000;
/** the most rows a read returns: the window's uses, most used first */
export const USE_ROWS_MAX = 50_000;
const windowDays = (days: unknown) => {
  const n = Number(days);
  return Number.isInteger(n) && n >= 1 && n <= KEEP_DAYS ? n : 28;
};

export interface UseRow {
  seed: string;
  action: UseAction;
  format: string;
  surface: UseSurface;
  collection: string;
  words: string;
  position: number;
  view: string;
  count: number;
}
export interface EditRow {
  seed: string;
  collection: string;
  n: number;
  anchors: number;
  meanL: number;
  rangeL: number;
  meanC: number;
  maxC: number;
  hueSpan: number;
}

/** The window's uses (most first), the editor's changes averaged per palette and collection, and each collection's
    page views by day. */
export async function useRecord(
  env: Pick<Env, "DB">,
  options: { days?: unknown; now?: number } = {}
) {
  const days = windowDays(options.days);
  const today = Math.floor((options.now ?? Date.now()) / DAY);
  const since = today - days;
  const [uses, edits, views] = await batch(env.DB, [
    [
      `SELECT seed, action, format, surface, collection, words, position, view, SUM(count) AS count
       FROM k_palette_use WHERE day > ? AND action != 'view'
       GROUP BY seed, action, format, surface, collection, words, position, view ORDER BY count DESC, seed LIMIT ?`,
      since,
      USE_ROWS_MAX + 1
    ],
    [
      `SELECT seed, collection, COUNT(*) AS n, AVG(anchors) AS anchors, AVG(mean_l) AS meanL, AVG(range_l) AS rangeL,
       AVG(mean_c) AS meanC, AVG(max_c) AS maxC, AVG(hue_span) AS hueSpan
       FROM k_palette_edits WHERE day > ? GROUP BY seed, collection ORDER BY n DESC, seed`,
      since
    ],
    [
      "SELECT day, collection AS slug, count FROM k_palette_use WHERE day > ? AND action = 'view' ORDER BY day, slug",
      since
    ]
  ]);
  const rows = (uses?.results ?? []) as UseRow[];
  const fixed = (value: unknown) => +Number(value).toFixed(4);
  return {
    days,
    from: since + 1,
    to: today,
    truncated: rows.length > USE_ROWS_MAX,
    uses: rows
      .slice(0, USE_ROWS_MAX)
      .map(row => ({ ...row, position: Number(row.position), count: Number(row.count) })),
    edits: ((edits?.results ?? []) as EditRow[]).map(row => ({
      seed: row.seed,
      collection: row.collection,
      n: Number(row.n),
      anchors: fixed(row.anchors),
      meanL: fixed(row.meanL),
      rangeL: fixed(row.rangeL),
      meanC: fixed(row.meanC),
      maxC: fixed(row.maxC),
      hueSpan: fixed(row.hueSpan)
    })),
    collectionViews: ((views?.results ?? []) as { day: number; slug: string; count: number }[]).map(
      row => ({ day: Number(row.day), slug: row.slug, count: Number(row.count) })
    )
  };
}

interface View {
  style: string;
  steps: number;
  angle: number;
}
export interface SiteItem extends View {
  seed: string;
  likes?: number;
}
/** The site as the signals read it: its public collections with their palettes' views and likes, and the gallery's
    views of the palettes asked for. */
export interface SiteRead {
  collections: { slug: string; title: string; saves: number; items: SiteItem[] }[];
  gallery: ({ seed: string } & View)[];
}

/** Every public collection with its palettes' views and likes in its own order, and the gallery's views of `seeds`. */
export async function signalSite(env: Pick<Env, "DB">, seeds: Iterable<string>): Promise<SiteRead> {
  const rows = await all<SiteItem & { slug: string; title: string; saves: number }>(
    env.DB,
    `SELECT c.slug, c.title, c.fork_count AS saves, i.seed, i.style, i.steps, i.angle, COALESCE(p.likes_count, 0) AS likes
     FROM k_collections c JOIN k_collection_items i ON i.collection_id = c.id LEFT JOIN k_palettes p ON p.seed = i.seed
     WHERE c.visibility = 'public' ORDER BY c.slug, i.position`
  );
  const collections = new Map<string, SiteRead["collections"][number]>();
  for (const row of rows) {
    const held = collections.get(row.slug) ?? {
      slug: row.slug,
      title: row.title,
      saves: Number(row.saves) || 0,
      items: []
    };
    held.items.push({
      seed: row.seed,
      style: row.style,
      steps: Number(row.steps),
      angle: Number(row.angle),
      likes: Number(row.likes) || 0
    });
    collections.set(row.slug, held);
  }
  const wanted = [...new Set([...seeds].filter(Boolean))];
  const gallery: SiteRead["gallery"] = [];
  /* D1 binds at most a hundred values a statement */
  for (let i = 0; i < wanted.length; i += 90) {
    const slice = wanted.slice(i, i + 90);
    const found = await all<{ seed: string } & View>(
      env.DB,
      `SELECT seed, style, steps, angle FROM k_palettes WHERE seed IN (${slice.map(() => "?").join(",")})`,
      ...slice
    );
    for (const row of found)
      gallery.push({
        seed: row.seed,
        style: row.style,
        steps: Number(row.steps),
        angle: Number(row.angle)
      });
  }
  return { collections: [...collections.values()], gallery };
}
