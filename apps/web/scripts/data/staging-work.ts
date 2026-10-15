/* What the admins did on staging since its load, carried into the build beside grabient-lite's work (merge.ts): the
   owner keeps working on staging, and production takes that work at the cutover.

   Since when: staging's copy carries the full build's sync log, which the build's plan wrote in seconds, and the load
   writes no row of its own, since its triggers come after its rows. So the load ends with the log's first run of rows,
   at the first row earlier than the one before it or more than a minute after it, and each row after that is a change
   made on staging, at its own time. The log keeps 30 days: once staging has pruned a row, the build stops.

   Whose: the admin accounts staging held at its load, each production's by email. The personas' likes on staging are
   their queue running on a copy of grabient-lite's, and the cutover takes the personas from grabient-lite.

   What, each by the rule that the later change wins:
   - a like, per account and palette: staging's like or unlike stands unless grabient-lite or production changed that
     like later. A palette a carried like brought into staging's gallery comes with it.
   - a collection, with its words, address and palettes in order, or its deletion: the admin's own, and each of
     Grabient's an admin curated (on the record, through an app, or by adding palettes by hand), unless grabient-lite
     changed it later. One of Grabient's is matched by its address, since each site's queue makes its own. The record
     of those changes comes with them.
   - a note an admin wrote, and the newsletter's lead an admin chose, per issue.
   A like or a collection changed on both sides since the load is a conflict, named with both times.

   Everything else an admin did on staging since its load stays there and is named: fit and search votes, reviews, the
   gallery's own curation, and the admins' apps' work beyond collections. Each acts on the gallery or on the agents'
   record, which grabient-lite holds until the cutover. */
import { insertRows, literal, name, type Value } from "./d1.ts";
import { freeSlug, handleOf, takenBy, underHandle, update } from "./merge.ts";
import { STYLES } from "./palettes.ts";
import type { Row, Snapshot } from "./snapshot.ts";

/** A run of the log ends where two of its rows come further apart than this. */
const RUN = 60_000;
/** The admins' apps' tools that change a collection, which they name by its address. */
const COLLECTION_TOOLS = ["collection_publish", "collection_remove_palettes"];
/** Records of a judgment of a collection's palettes, which change no collection. */
const JUDGED = ["note", "vote"];
/** A collection's columns the counts and scores after the plan write again. */
const RECOUNTED = ["hot", "rising", "rising_3m", "rising_1y", "likes_sum", "fork_count"];
/** A palette a like brings into the gallery: the rest of its row is counts and scores. */
const GALLERY = ["seed", "style", "steps", "angle", "classes", "created_at"];

export type Source = "staging" | "grabient-lite" | "production";

export interface LikeChange {
  /** the account in the target */
  user: string;
  seed: string;
  /** staging's last change of the like */
  at: number;
  /** staging's like in the target's ids, or null for an unlike */
  row: Row | null;
  stands: Source;
  /** whether the like stands in the build */
  liked: boolean;
}

export interface CollectionChange {
  /** in the target: grabient-lite's id, or staging's for a collection grabient-lite never held */
  id: string;
  at: number;
  /** staging's collection in the target's ids, or null where staging deleted it */
  row: Row | null;
  items: Row[];
  stands: Source;
  /** grabient-lite holds no such collection */
  made: boolean;
}

/** A like or a collection both sides changed since staging's load. */
export interface Conflict {
  kind: "like" | "collection";
  key: string;
  staging: number;
  /** the other side's last change */
  other: number;
  source: Source;
  stands: Source;
}

/** A change an admin made on staging that the build leaves there. */
export interface Left {
  table: string;
  what: string;
  at: number;
}

export interface Work {
  /** when staging was loaded, or null for a staging never loaded */
  loadedAt: number | null;
  likes: LikeChange[];
  /** staging's gallery rows of the palettes carried likes brought in */
  palettes: Row[];
  collections: CollectionChange[];
  notes: Row[];
  leads: Row[];
  records: Row[];
  contributions: Row[];
  conflicts: Conflict[];
  left: Left[];
}

/** When staging was loaded and its log since, or null for a staging never loaded. */
export function sinceLoad(staging: Snapshot): { at: number; log: Row[] } | null {
  if (!staging.meta.tables.k_sync_log) return null;
  const pruned = Number(staging.rows("k_sync_meta").find(row => row.key === "pruned")?.value ?? 0);
  if (pruned > 0)
    throw new Error(
      `Staging's sync log was pruned through row ${pruned}, so its load can't be told from what came after it.`
    );
  const log = staging.rows("k_sync_log");
  if (!log.length) throw new Error("Staging's sync log holds no row of its load.");
  let end = 0;
  for (; end + 1 < log.length; end++) {
    const gap = Number(log[end + 1]!.at) - Number(log[end]!.at);
    if (gap < 0 || gap > RUN) break;
  }
  return { at: Number(log[end]!.at), log: log.slice(end + 1) };
}

const latest = (...times: (Value | undefined)[]): number | undefined => {
  const known = times.flatMap(at => (at === null || at === undefined ? [] : [Number(at)]));
  return known.length ? Math.max(...known) : undefined;
};
const touch = (times: Map<string, number>, key: string, at: Value | undefined) =>
  times.set(key, Math.max(times.get(key) ?? 0, Number(at)));
const keyed = <T>(rows: readonly T[], key: (row: T) => string) =>
  new Map(rows.map(row => [key(row), row]));
const view = (item: Row) => `${item.seed} ${item.style} ${item.steps} ${item.angle}`;

/** The admins' work on staging since its load, each change decided against grabient-lite and production. */
export function stagingWork(
  staging: Snapshot,
  production: Snapshot,
  lite: Snapshot,
  aliases: ReadonlyMap<string, string>
): Work {
  const work: Work = {
    loadedAt: null,
    likes: [],
    palettes: [],
    collections: [],
    notes: [],
    leads: [],
    records: [],
    contributions: [],
    conflicts: [],
    left: []
  };
  const load = sinceLoad(staging);
  if (!load) return work;
  const loaded = load.at;
  work.loadedAt = loaded;
  const since = (row: Row, column: string) => Number(row[column] ?? 0) > loaded;

  /* the admins at the load, by staging's id, with production's account and grabient-lite's, by email */
  const emails = (snapshot: Snapshot) =>
    new Map(
      snapshot.rows("auth_user").map(user => [String(user.email).toLowerCase(), String(user.id)])
    );
  const productions = emails(production);
  const lites = emails(lite);
  const admins = new Map<string, { target: string; lite?: string }>();
  for (const user of staging.rows("auth_user")) {
    if (user.role !== "admin" || Number(user.created_at) > loaded) continue;
    const email = String(user.email).toLowerCase();
    const target = productions.get(email);
    if (!target) throw new Error("An admin on staging has no account in production.");
    admins.set(String(user.id), { target, lite: lites.get(email) });
  }
  const admin = (id: Value | undefined) => admins.get(String(id));
  const target = (id: Value | undefined) => admin(id)?.target ?? id ?? null;

  /* what each side's log says changed: likes by account and palette, the accounts' own collections by id */
  const likeTimes = new Map<string, number>();
  const collectionTimes = new Map<string, number>();
  for (const row of load.log) {
    if (!admin(row.account_id)) continue;
    if (row.kind === "like") touch(likeTimes, `${row.account_id} ${row.key}`, row.at);
    else touch(collectionTimes, String(row.key), row.at);
  }
  const logged = (row: Row) =>
    row.kind === "like" ? `like ${row.account_id} ${row.key}` : `collection ${row.key}`;
  const liteLog = new Map<string, number>();
  for (const row of lite.rows("k_sync_log")) touch(liteLog, logged(row), row.at);

  /* Grabient's collections an admin curated: on the record, through an app, or palettes added by hand, which the
     record leaves out; palettes staging's queue added are the queue's */
  const collections = keyed(staging.rows("k_collections"), c => String(c.id));
  const addresses = new Map([...collections.values()].map(c => [String(c.slug), String(c.id)]));
  const liteCollections = keyed(lite.rows("k_collections"), c => String(c.id));
  const liteAgents = keyed(
    lite.rows("k_collections").filter(c => c.owner_kind === "agent"),
    c => String(c.slug)
  );
  const liteOf = (id: string, slug?: Value, kind?: Value) =>
    liteCollections.get(id) ?? (kind === "agent" ? liteAgents.get(String(slug)) : undefined);
  const liteItems = new Map<string, Set<string>>();
  for (const item of lite.rows("k_collection_items")) {
    const id = String(item.collection_id);
    liteItems.set(id, (liteItems.get(id) ?? new Set()).add(view(item)));
  }
  const records = staging
    .rows("k_admin_actions")
    .filter(r => since(r, "created_at") && admin(r.actor_id));
  const contributions = staging
    .rows("k_contributions")
    .filter(r => since(r, "created_at") && admin(r.actor_id));
  for (const r of records)
    if (r.collection_id !== null && !JUDGED.includes(String(r.action)))
      touch(collectionTimes, String(r.collection_id), r.created_at);
  for (const r of contributions) {
    const id = COLLECTION_TOOLS.includes(String(r.tool)) && addresses.get(String(r.target));
    if (id) touch(collectionTimes, id, r.created_at);
  }
  const queued = new Set<string>();
  for (const q of staging.rows("k_queue")) {
    if (q.kind !== "collection" || q.status !== "done" || !since(q, "done_at")) continue;
    const payload = JSON.parse(String(q.payload)) as { slug?: string; items?: { seed?: string }[] };
    for (const item of payload.items ?? []) queued.add(`${payload.slug} ${item.seed}`);
  }
  for (const item of staging.rows("k_collection_items")) {
    const c = collections.get(String(item.collection_id));
    if (c?.owner_kind !== "agent" || !since(item, "created_at")) continue;
    if (queued.has(`${c.slug} ${item.seed}`)) continue;
    const there = liteOf(String(c.id), c.slug, c.owner_kind);
    if (!there || !liteItems.get(String(there.id))?.has(view(item)))
      touch(collectionTimes, String(c.id), item.created_at);
  }

  /* collections: staging's version or its deletion, unless grabient-lite changed the collection later */
  const deleted = new Map(
    records
      .filter(r => r.action === "collection.delete")
      .map(r => [String(r.collection_id), r.slug])
  );
  const liteDeleted = new Map<string, number>();
  for (const r of lite.rows("k_admin_actions"))
    if (r.action === "collection.delete") touch(liteDeleted, String(r.collection_id), r.created_at);
  /* by staging's id, each collection's id in the build */
  const ids = new Map<string, string>();
  for (const [id, at] of collectionTimes) {
    const mine = collections.get(id) ?? null;
    const theirs = mine
      ? liteOf(id, mine.slug, mine.owner_kind)
      : liteOf(id, deleted.get(id), deleted.has(id) ? "agent" : "user");
    const there = theirs ? String(theirs.id) : id;
    const other = latest(
      liteLog.get(`collection ${there}`),
      theirs?.updated_at,
      liteDeleted.get(there)
    );
    const stands: Source = other === undefined || at >= other ? "staging" : "grabient-lite";
    if (other !== undefined && other > loaded)
      work.conflicts.push({
        kind: "collection",
        key: String(mine?.slug ?? theirs?.slug ?? id),
        staging: at,
        other,
        source: "grabient-lite",
        stands
      });
    ids.set(id, there);
    work.collections.push({ id: there, at, row: mine, items: [], stands, made: !theirs });
  }
  const from = new Map([...ids].map(([id, there]) => [there, id]));
  const carried = keyed(
    work.collections.filter(c => c.stands === "staging"),
    c => c.id
  );
  /** A staging collection's id in the build, which a record keeps after the collection goes. */
  const idOf = (id: Value): string | null => {
    if (id === null) return null;
    const c = collections.get(String(id));
    return ids.get(String(id)) ?? String(liteOf(String(id), c?.slug, c?.owner_kind)?.id ?? id);
  };
  /** A staging collection's id in the build, or null where the build holds no such collection. */
  const inBuild = (id: Value): string | null => {
    const there = idOf(id);
    if (there === null) return null;
    const change = carried.get(there);
    if (change) return change.row ? there : null;
    return liteCollections.has(there) ? there : null;
  };
  const items = new Map<string, Row[]>();
  for (const item of staging.rows("k_collection_items")) {
    const id = String(item.collection_id);
    items.set(id, [...(items.get(id) ?? []), item]);
  }
  for (const change of work.collections) {
    const row = change.row;
    if (!row) continue;
    const forked = inBuild(row.forked_from);
    change.row = {
      ...row,
      id: change.id,
      owner_id: row.owner_kind === "user" ? target(row.owner_id) : row.owner_id,
      forked_from: forked,
      forked_base: forked ? row.forked_base : null
    };
    change.items = (items.get(String(from.get(change.id))) ?? [])
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map(item => ({ ...item, collection_id: change.id }));
  }

  /* likes: staging's like or unlike, unless grabient-lite or production changed that like later */
  const stagingLikes = keyed(staging.rows("k_likes"), l => `${l.user_id} ${l.palette_id}`);
  const liteLikes = keyed(lite.rows("k_likes"), l => `${l.user_id} ${l.palette_id}`);
  const productionLikes = new Map<string, number>();
  for (const like of production.rows("likes")) {
    const seed = aliases.get(String(like.palette_id));
    if (seed && STYLES.includes(String(like.style)))
      touch(productionLikes, `${like.user_id} ${seed}`, like.created_at);
  }
  const gallery = keyed(staging.rows("k_palettes"), p => String(p.seed));
  const held = new Set([
    ...production.rows("palettes").flatMap(p => aliases.get(String(p.id)) ?? []),
    ...lite.rows("k_palettes").map(p => String(p.seed))
  ]);
  for (const [key, at] of likeTimes) {
    const [user, seed] = key.split(" ") as [string, string];
    const who = admins.get(user)!;
    const mine = stagingLikes.get(key) ?? null;
    const theirs = who.lite ? liteLikes.get(`${who.lite} ${seed}`) : undefined;
    const liteAt = who.lite
      ? latest(liteLog.get(`like ${who.lite} ${seed}`), theirs?.created_at)
      : undefined;
    const productionAt = productionLikes.get(`${who.target} ${seed}`);
    const source: Source =
      productionAt !== undefined && (liteAt === undefined || productionAt > liteAt)
        ? "production"
        : "grabient-lite";
    const other = latest(liteAt, productionAt);
    const stands: Source = other === undefined || at >= other ? "staging" : source;
    if (other !== undefined && other > loaded)
      work.conflicts.push({ kind: "like", key: seed, staging: at, other, source, stands });
    work.likes.push({
      user: who.target,
      seed,
      at,
      row: mine && { ...mine, user_id: who.target, collection_id: inBuild(mine.collection_id) },
      stands,
      liked: stands === "staging" ? !!mine : stands === "production" || !!theirs
    });
    const palette = stands === "staging" && mine && !held.has(seed) ? gallery.get(seed) : undefined;
    if (palette)
      work.palettes.push(
        Object.fromEntries(GALLERY.map(column => [column, palette[column] ?? null]))
      );
  }

  /* notes, the record and the apps' log of the changes carried, and the newsletter's leads */
  for (const note of staging.rows("k_collection_notes")) {
    const collection =
      since(note, "created_at") && admin(note.author_id) && inBuild(note.collection_id);
    if (collection)
      work.notes.push({ ...note, collection_id: collection, author_id: target(note.author_id) });
  }
  const isCarried = (id: string | null) => id !== null && carried.has(id);
  for (const r of records) {
    const id = idOf(r.collection_id);
    if (
      r.action === "note"
        ? inBuild(r.collection_id)
        : !JUDGED.includes(String(r.action)) && isCarried(id)
    )
      work.records.push({ ...r, actor_id: target(r.actor_id), collection_id: id });
    else
      work.left.push({
        table: "k_admin_actions",
        what: [r.action, r.seed, r.slug && `in ${r.slug}`].filter(Boolean).join(" "),
        at: Number(r.created_at)
      });
  }
  for (const r of contributions) {
    const id = COLLECTION_TOOLS.includes(String(r.tool))
      ? addresses.get(String(r.target))
      : undefined;
    if (id && isCarried(idOf(id))) work.contributions.push({ ...r, actor_id: target(r.actor_id) });
    else
      work.left.push({
        table: "k_contributions",
        what: `${r.tool} ${r.target}`,
        at: Number(r.created_at)
      });
  }
  for (const lead of staging.rows("k_newsletter_leads"))
    if (since(lead, "chosen_at") && admin(lead.chosen_by))
      work.leads.push({ ...lead, chosen_by: target(lead.chosen_by) });

  /* the rest an admin changed that the build leaves on staging */
  for (const vote of staging.rows("k_search_votes"))
    if (since(vote, "updated_at") && admin(vote.user_id))
      work.left.push({
        table: "k_search_votes",
        what: `${Number(vote.vote) > 0 ? "up" : "down"} ${vote.seed} for "${vote.query}"`,
        at: Number(vote.updated_at)
      });
  for (const review of staging.rows("k_reviews"))
    if (since(review, "updated_at") && admin(review.reviewer_id))
      work.left.push({
        table: "k_reviews",
        what: `${review.verdict} ${review.seed}${review.subject ? ` for ${review.subject}` : ""}`,
        at: Number(review.updated_at)
      });
  return work;
}

/** The work as the build's report keeps it, its times in UTC; `carried` counts what the build takes from staging. */
export function workReport(work: Work, moved: ReadonlyMap<string, string>) {
  const at = (ms: number) => new Date(ms).toISOString();
  const kept = <T extends { stands: Source }>(changes: readonly T[]) =>
    changes.filter(change => change.stands === "staging");
  const likes = kept(work.likes);
  const collections = kept(work.collections);
  return {
    loadedAt: work.loadedAt === null ? null : at(work.loadedAt),
    carried:
      likes.length +
      work.palettes.length +
      collections.length +
      work.notes.length +
      work.leads.length +
      work.records.length +
      work.contributions.length,
    likes: likes.filter(l => l.liked).length,
    unlikes: likes.filter(l => !l.liked).length,
    likesChangedLaterElsewhere: work.likes.length - likes.length,
    palettes: work.palettes.map(p => p.seed),
    collections: work.collections.map(c => ({
      id: c.id,
      address: c.row ? (moved.get(String(c.row.slug)) ?? c.row.slug) : null,
      change: !c.row ? "deleted" : c.made ? "made" : "changed",
      palettes: c.items.length,
      at: at(c.at),
      stands: c.stands
    })),
    notes: work.notes.map(n => ({ collection: n.collection_id, at: at(Number(n.created_at)) })),
    leads: work.leads.map(l => ({ issue: l.issue, seed: l.seed, at: at(Number(l.chosen_at)) })),
    records: work.records.map(r => `${r.action} ${r.seed ?? ""} ${r.slug ?? ""}`.trim()),
    contributions: work.contributions.map(c => `${c.tool} ${c.target}`),
    conflicts: work.conflicts.map(c => ({ ...c, staging: at(c.staging), other: at(c.other) })),
    left: work.left.map(l => ({ ...l, at: at(l.at) }))
  };
}

/** The statements that carry the work into a database holding production's rows and grabient-lite's work (`holders`,
    each address with its collection's id), run after grabient-lite's and before the counts. A collection whose address
    another holds there moves, as merge.ts moves grabient-lite's. Each is safe to run again. */
export function workStatements(
  work: Work,
  staging: Snapshot,
  target: { users: readonly Row[]; holders: ReadonlyMap<string, string> }
): { statements: string[]; slugs: Map<string, string> } {
  const columns = (table: string) => staging.meta.tables[table]?.columns ?? [];
  const keep = (table: string, key: readonly string[], kept = columns(table)) =>
    `ON CONFLICT(${key.join(", ")}) DO UPDATE SET ${update(kept.filter(c => !key.includes(c)))}`;
  const list = (values: readonly string[]) => values.map(literal).join(", ");
  const carried = work.collections.filter(c => c.stands === "staging");
  const gone = carried.filter(c => !c.row).map(c => c.id);
  const holders = new Map([...target.holders].filter(([, id]) => !gone.includes(id)));
  const users = keyed(target.users, user => String(user.id));
  const slugs = new Map<string, string>();
  const placed: Row[] = [];
  for (const c of carried) {
    if (!c.row) continue;
    for (const [slug, id] of holders) if (id === c.id) holders.delete(slug);
    const owner = c.row.owner_kind === "user" ? users.get(String(c.row.owner_id)) : undefined;
    const taken = takenBy(holders, c.id);
    const slug = freeSlug(
      underHandle(String(c.row.slug), String(c.row.title), owner && handleOf(owner), taken),
      taken
    );
    holders.set(slug, c.id);
    if (slug !== c.row.slug) slugs.set(String(c.row.slug), slug);
    placed.push({ ...c.row, slug });
  }
  const collection = columns("k_collections").filter(c => !RECOUNTED.includes(c));
  const lead = columns("k_newsletter_leads");
  return {
    slugs,
    statements: [
      /* a palette a carried like brought in, as a like brings it: never one an admin deleted */
      ...work.palettes.map(
        p => `INSERT INTO k_palettes (${GALLERY.map(name).join(", ")})
SELECT ${GALLERY.map(c => literal(p[c] ?? null)).join(", ")}
WHERE NOT EXISTS (SELECT 1 FROM k_admin_actions WHERE seed = ${literal(p.seed)} AND action = 'delete')
ON CONFLICT(seed) DO NOTHING`
      ),
      ...insertRows(
        "k_likes",
        columns("k_likes"),
        work.likes.flatMap(l => (l.stands === "staging" && l.row ? [l.row] : [])),
        keep("k_likes", ["user_id", "palette_id"])
      ),
      ...work.likes
        .filter(l => !l.liked)
        .map(
          l =>
            `DELETE FROM k_likes WHERE user_id = ${literal(l.user)} AND palette_id = ${literal(l.seed)}`
        ),
      /* a deleted collection takes its palettes, notes and votes; what pointed at it points nowhere */
      ...(gone.length
        ? [
            `DELETE FROM k_collections WHERE id IN (${list(gone)})`,
            `UPDATE k_likes SET collection_id = NULL WHERE collection_id IN (${list(gone)})`,
            `UPDATE k_collections SET forked_from = NULL, forked_base = NULL WHERE forked_from IN (${list(gone)})`
          ]
        : []),
      ...insertRows("k_collections", collection, placed, keep("k_collections", ["id"], collection)),
      ...(placed.length
        ? [
            `DELETE FROM k_collection_items WHERE collection_id IN (${list(placed.map(c => String(c.id)))})`
          ]
        : []),
      ...insertRows(
        "k_collection_items",
        columns("k_collection_items"),
        carried.flatMap(c => (c.row ? c.items : []))
      ),
      ...insertRows(
        "k_collection_notes",
        columns("k_collection_notes"),
        work.notes,
        "ON CONFLICT(id) DO NOTHING"
      ),
      ...insertRows(
        "k_admin_actions",
        columns("k_admin_actions"),
        work.records,
        "ON CONFLICT(id) DO NOTHING"
      ),
      ...insertRows(
        "k_contributions",
        columns("k_contributions"),
        work.contributions,
        "ON CONFLICT(id) DO NOTHING"
      ),
      /* an issue's later choice stands */
      ...insertRows(
        "k_newsletter_leads",
        lead,
        work.leads,
        `${keep("k_newsletter_leads", ["issue"], lead)} WHERE excluded.chosen_at > k_newsletter_leads.chosen_at`
      )
    ]
  };
}
