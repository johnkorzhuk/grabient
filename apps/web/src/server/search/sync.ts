/* Keeps the search snapshot current, from the ten-minute schedule. An idle run is one D1 query of counts and latest
   times, and one look at the stored copy's metadata: when they match and nothing is owed, it stops there. Otherwise it
   reads what is public, builds the next snapshot from the latest one (only what changed is measured or embedded), and
   stores it in R2, where every isolate finds it within minutes. No visitor's request runs any of this. */
import {
  type BuildStats,
  buildSnapshot,
  type Site,
  SNAPSHOT_FORMAT,
  snapshotHead
} from "@grabient/search/snapshot.ts";
import { all, type Db, first } from "../db/d1.ts";
import type { Env } from "../env.ts";
import { flagOff } from "../flags/flags.ts";
import { loadModel, searchAsset } from "./files.ts";
import { embeddings } from "./model.ts";
import { votedOut } from "./seams.ts";
import { latestSnapshot, storedMark, storeSnapshot } from "./snapshot.ts";

/** Four tables, each read once as counts and latest times: a row added, changed or removed anywhere the snapshot reads
    moves one of them. The newest rowid as well, since an admin's edit puts one palette in another's place, keeping the
    count and the date. */
export const MARK_SQL = `SELECT p.n AS palettes, p.t AS palettes_at, p.r AS palettes_row, c.n AS collections,
  c.t AS collections_at, c.i AS items, v.n AS votes, v.t AS votes_at, v.s AS votes_sum, x.n AS titles, x.t AS titles_at FROM
  (SELECT COUNT(*) AS n, COALESCE(MAX(created_at), 0) AS t, COALESCE(MAX(rowid), 0) AS r FROM k_palettes) p,
  (SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS t, COALESCE(SUM(item_count), 0) AS i FROM k_collections
    WHERE visibility = 'public') c,
  (SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS t, COALESCE(SUM(vote), 0) AS s FROM k_collection_votes) v,
  (SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS t FROM k_palette_texts) x`;
const MARK_ORDER = [
  "palettes",
  "palettes_at",
  "palettes_row",
  "collections",
  "collections_at",
  "items",
  "votes",
  "votes_at",
  "votes_sum",
  "titles",
  "titles_at"
] as const;
type MarkRow = Record<(typeof MARK_ORDER)[number], number>;

/** The numbers as one word, with the model version and the file format: a new model or format is a change too. */
export const siteMark = (row: MarkRow, version: string): string =>
  [version, `f${SNAPSHOT_FORMAT}`, ...MARK_ORDER.map(key => Number(row[key]) || 0)].join(":");

export interface SiteRows {
  palettes: { seed: string }[];
  titles: { seed: string; title: string }[];
  collections: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    tags: string | null;
  }[];
  items: { collection_id: string; seed: string }[];
  votes: { collection_id: string; seed: string; up: number; down: number; admin_down: number }[];
}

function tagsOf(raw: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

/** Rows as the site a build reads: public collections with their palettes in order, without the ones voted out, and
    without collections left with none. */
export function siteOf(rows: SiteRows, mark: string): Site {
  const collections = new Map(
    rows.collections.map(c => [
      c.id,
      {
        slug: c.slug,
        title: c.title,
        description: c.description ?? "",
        tags: tagsOf(c.tags),
        seeds: [] as string[]
      }
    ])
  );
  const out = new Set(
    rows.votes
      .filter(v => votedOut(Number(v.up) || 0, Number(v.down) || 0, Number(v.admin_down) || 0))
      .map(v => `${v.collection_id}|${v.seed}`)
  );
  for (const item of rows.items) {
    if (!out.has(`${item.collection_id}|${item.seed}`))
      collections.get(item.collection_id)?.seeds.push(item.seed);
  }
  return {
    seeds: rows.palettes.map(p => p.seed),
    collections: [...collections.values()].filter(c => c.seeds.length),
    titles: new Map(rows.titles.map(t => [t.seed, t.title])),
    mark
  };
}

const PAGE = 10_000;
async function byRowid<T extends { r: number }>(db: Db, sql: string): Promise<T[]> {
  const rows: T[] = [];
  for (let after = 0; ; ) {
    const part = await all<T>(db, sql, after, PAGE);
    rows.push(...part);
    if (part.length < PAGE) return rows;
    after = part[part.length - 1].r;
  }
}
async function byOffset<T>(db: Db, sql: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const part = await all<T>(db, sql, PAGE, offset);
    rows.push(...part);
    if (part.length < PAGE) return rows;
  }
}

export async function readMark(db: Db, version: string): Promise<string> {
  const row = await first<MarkRow>(db, MARK_SQL);
  if (!row) throw new Error("The site could not be counted");
  return siteMark(row, version);
}

export async function readSite(db: Db, mark: string): Promise<Site> {
  const [palettes, titles, collections, items, votes] = await Promise.all([
    byRowid<{ r: number; seed: string }>(
      db,
      "SELECT rowid AS r, seed FROM k_palettes WHERE rowid > ? ORDER BY rowid LIMIT ?"
    ),
    byRowid<{ r: number; seed: string; title: string }>(
      db,
      "SELECT rowid AS r, seed, title FROM k_palette_texts WHERE rowid > ? ORDER BY rowid LIMIT ?"
    ),
    all<SiteRows["collections"][number]>(
      db,
      "SELECT id, slug, title, description, tags FROM k_collections WHERE visibility = 'public' ORDER BY rowid"
    ),
    byOffset<SiteRows["items"][number]>(
      db,
      `SELECT i.collection_id, i.seed FROM k_collection_items i JOIN k_collections c ON c.id = i.collection_id
       WHERE c.visibility = 'public' ORDER BY i.collection_id, i.position LIMIT ? OFFSET ?`
    ),
    all<SiteRows["votes"][number]>(
      db,
      `SELECT kv.collection_id, kv.seed, SUM(CASE WHEN kv.vote = 1 THEN 1 ELSE 0 END) AS up,
         SUM(CASE WHEN kv.vote = -1 THEN 1 ELSE 0 END) AS down,
         SUM(CASE WHEN kv.vote = -1 AND u.role = 'admin' THEN 1 ELSE 0 END) AS admin_down
       FROM k_collection_votes kv LEFT JOIN auth_user u ON u.id = kv.user_id GROUP BY kv.collection_id, kv.seed`
    )
  ]);
  return siteOf({ palettes, titles, collections, items, votes }, mark);
}

/* The start of the shipped copy, as far as its leading fields: its builtAt says whether the stored copy is the newer.
   Read without the rest of its megabyte. */
async function shippedHead(env: Pick<Env, "ASSETS">): Promise<ReturnType<typeof snapshotHead>> {
  const reader = (await searchAsset(env, "snapshot.bin")).body?.getReader();
  if (!reader) return null;
  let start = new Uint8Array(0);
  try {
    while (start.length < 65_536) {
      const { done, value } = await reader.read();
      if (done) return null;
      const next = new Uint8Array(start.length + value.length);
      next.set(start);
      next.set(value, start.length);
      start = next;
      const head = snapshotHead(start);
      if (head) return head;
    }
    return null;
  } finally {
    await reader.cancel();
  }
}

type SyncOutcome =
  | ({ status: "built"; bytes: number } & BuildStats)
  | { status: "unchanged" }
  | { status: "skipped"; reason: string };
export type SyncReport = SyncOutcome & { ms: number };

/** One run of the schedule: the step jobs.ts runs every ten minutes. `force` builds even when nothing moved. A failure
    is thrown, so the run shows as failed. */
export async function syncSnapshot(
  env: Pick<Env, "ASSETS" | "DB"> & Partial<Pick<Env, "AI" | "SEARCH_SNAPSHOTS">>,
  options: { force?: boolean } = {}
): Promise<SyncReport> {
  const started = Date.now();
  const done = (outcome: SyncOutcome): SyncReport => ({ ...outcome, ms: Date.now() - started });
  const store = env.SEARCH_SNAPSHOTS;
  if (!store) return done({ status: "skipped", reason: "no store is bound" });
  // turned off, search keeps answering from the last build
  if (await flagOff(env, "search-rebuild"))
    return done({ status: "skipped", reason: "search index updates are off" });
  const model = await loadModel(env);
  if (!model) return done({ status: "skipped", reason: "the model files are missing" });
  const mark = await readMark(env.DB, model.version);
  if (!options.force) {
    const [stored, base] = await Promise.all([
      storedMark(store, model.version).catch(() => null),
      shippedHead(env).catch(() => null)
    ]);
    // the stored copy is answered from only while it is newer than the one this deploy shipped
    const newest = stored && (!base || stored.builtAt > base.builtAt) ? stored : base;
    if (newest && newest.mark === mark && !newest.pending) return done({ status: "unchanged" });
  }
  const latest = await latestSnapshot(env).catch(() => null);
  const before = latest?.snapshot.version === model.version ? latest.snapshot : null;
  if (!options.force && before && before.mark === mark && !before.pending)
    return done({ status: "unchanged" });
  const site = await readSite(env.DB, mark);
  const { AI } = env;
  // a collection's text is read by the model only while search by meaning is on; until then its old vector stands
  const embed =
    AI && !(await flagOff(env, "model-search"))
      ? (texts: string[]) => embeddings(AI, model, texts)
      : undefined;
  const { snapshot, stats } = await buildSnapshot(model, site, before, { embed });
  /* A build that lost most of the palettes it started from read a database that was empty or half there: every isolate
     would take it within minutes, so it is refused and the stored copy stands. The shipped copy may hold another
     site's palettes, so only a stored one is measured against. */
  const kept = before && latest?.from === "store" ? before.palettes.n : 0;
  if (!options.force && (snapshot.palettes.n === 0 || snapshot.palettes.n < kept / 2)) {
    console.error("search snapshot: refused a build that shrank", kept, "->", snapshot.palettes.n);
    return done({
      status: "skipped",
      reason: `the build held ${snapshot.palettes.n} palettes against ${kept} before`
    });
  }
  const bytes = await storeSnapshot(store, snapshot);
  return done({ status: "built", bytes, ...stats });
}
