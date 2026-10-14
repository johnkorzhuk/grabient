/* grabient-lite's contributor work, moved onto a database that holds production's accounts: Grabient's collections
   and every account's, with their palettes in order, notes and votes; the gallery palettes the agents published; the
   palettes' titles and the translations; the queue, the personas, the reviews, the admin record and the contributions;
   the site's switches; and every account's likes, an admin's with where it was pressed.

   An account is production's when production holds its email. The admins must be there; any other account the moved
   rows name and production lacks, a persona above all, is made from grabient-lite's row, under its own id unless
   production uses that id. A collection keeps its id and address unless the target holds them for another
   collection; a private one moves under its owner's handle in the target, as a username change moves it. Likes,
   scores and sums are left to the counts that follow (palettes.ts, scores.ts), which see every row.

   The statements are safe to run again on the same target: what is there already is the same row, kept or updated. */
import {
  accountHandle,
  isCollectionSlug,
  privateSlug,
  SLUG_MAX
} from "../../src/features/collections/address.ts";
import { chunks, insertRows, literal, name, type Value } from "./d1.ts";
import type { Row, Snapshot } from "./snapshot.ts";

/** What the target holds that the merge must fit around. */
export interface Target {
  users: readonly Row[];
  collections: readonly Row[];
}

/** grabient-lite's tables the merge leaves behind, and why. */
export const LEFT: Record<string, string> = {
  auth_account: "sign-in links of accounts production holds with its own",
  auth_session: "sessions",
  auth_verification: "sign-in links and codes",
  auth_oauth_access_token: "an earlier provider's tokens, kept for a rollback",
  auth_oauth_refresh_token: "an earlier provider's tokens, kept for a rollback",
  auth_oauth_consent: "an earlier provider's grants, kept for a rollback",
  auth_oauth_client: "an earlier provider's clients, kept for a rollback",
  d1_migrations: "its own migration history",
  k_legacy_map: "written by the palette import from the data maps",
  likes: "an older copy of production's table",
  palettes: "an older copy of production's table",
  refine_sessions: "the old app's records of grabient-lite's own accounts",
  k_newsletter: "the owner's test of the newsletter, with an unsubscribe token",
  k_newsletter_events: "the owner's test of the newsletter",
  k_palette_use: "readers' anonymous use of grabient-lite",
  k_palette_edits: "readers' anonymous edits on grabient-lite",
  k_search_counts: "readers' anonymous searches on grabient-lite",
  k_search_unread: "readers' anonymous searches on grabient-lite",
  k_popular_searches: "the schedule's reading of grabient-lite's search counts",
  k_sync_clients: "browsers' copies on grabient-lite's address",
  k_sync_log: "browsers' copies on grabient-lite's address",
  k_sync_meta: "browsers' copies on grabient-lite's address"
};

const ID_LETTERS = "abcdefghjkmnpqrstuvwxyz23456789";

/** A fresh collection id: 20 of the letters ids are made of. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return [...bytes].map(byte => ID_LETTERS[byte % ID_LETTERS.length]).join("");
}

/** An account row's handle: what its private collections' addresses begin with. */
export const handleOf = (user: Row): string =>
  accountHandle({
    id: String(user.id),
    username: typeof user.username === "string" ? user.username : null
  });

const update = (columns: readonly string[]) =>
  columns.map(column => `${name(column)} = excluded.${name(column)}`).join(", ");

export interface Merge {
  statements: string[];
  /** grabient-lite's account ids to the target's. */
  users: Map<string, string>;
  /** Accounts the merge makes, by the target's id. */
  created: string[];
  /** grabient-lite's collection ids to the target's, and addresses that changed. */
  collections: Map<string, string>;
  slugs: Map<string, string>;
  /** Rows of each table the statements offer: a palette production holds keeps production's row. */
  moved: Record<string, number>;
  /** Rows left behind for naming something that is not there, by table. */
  dropped: Record<string, number>;
}

export function mergeStatements(lite: Snapshot, target: Target, makeId = newId): Merge {
  const rows = (table: string) => lite.rows(table);
  const columns = (table: string) => lite.meta.tables[table]?.columns ?? [];
  const dropped: Record<string, number> = {};
  const drop = (table: string) => {
    dropped[table] = (dropped[table] ?? 0) + 1;
  };

  /* accounts: the admins first, then every account a moved row names */
  const byEmail = new Map(target.users.map(user => [String(user.email).toLowerCase(), user]));
  const takenIds = new Set(target.users.map(user => String(user.id)));
  const takenNames = new Set(
    target.users.flatMap(user => (user.username ? [String(user.username).toLowerCase()] : []))
  );
  const liteUsers = new Map(rows("auth_user").map(user => [String(user.id), user]));
  const users = new Map<string, string>();
  const handles = new Map<string, string>();
  const made: Row[] = [];
  const mapUser = (id: Value): string | null => {
    if (typeof id !== "string") return null;
    const known = users.get(id);
    if (known) return known;
    const user = liteUsers.get(id);
    if (!user) return null;
    const there = byEmail.get(String(user.email).toLowerCase());
    if (there) {
      users.set(id, String(there.id));
      handles.set(String(there.id), handleOf(there));
      return String(there.id);
    }
    if (user.role === "admin")
      throw new Error("A grabient-lite admin has no account in production.");
    let own = id;
    while (takenIds.has(own)) own = makeId() + makeId().slice(0, 12);
    takenIds.add(own);
    const username =
      typeof user.username === "string" && !takenNames.has(user.username.toLowerCase())
        ? user.username
        : null;
    if (username) takenNames.add(username.toLowerCase());
    made.push({ ...user, id: own, username });
    users.set(id, own);
    handles.set(own, handleOf({ id: own, username }));
    return own;
  };
  for (const user of liteUsers.values()) if (user.role === "admin") mapUser(user.id);
  /** A row's account column mapped: a moved row whose account is gone keeps the id it named. */
  const account = (id: Value) => mapUser(id) ?? id;

  /* collections: their ids and addresses in the target */
  const targetIds = new Map(target.collections.map(c => [String(c.id), c]));
  const slugOwners = new Map(target.collections.map(c => [String(c.slug), String(c.id)]));
  const collections = new Map<string, string>();
  const slugs = new Map<string, string>();
  const movedCollections: Row[] = [];
  for (const c of rows("k_collections")) {
    const owner = c.owner_kind === "user" ? mapUser(c.owner_id) : String(c.owner_id);
    if (!owner) {
      drop("k_collections");
      continue;
    }
    let slug = String(c.slug);
    const handle = c.owner_kind === "user" ? handles.get(owner) : undefined;
    /** Whether another collection than `id` holds the address. */
    const taken = (id: string) => (candidate: string) => {
      const holder = slugOwners.get(candidate);
      return holder !== undefined && holder !== id;
    };
    if (handle && slug.startsWith("@") && !slug.startsWith(`@${handle}/`)) {
      // as a username change moves it: the same address under the new handle, else its title's first free one
      const wanted = `@${handle}/${slug.slice(slug.indexOf("/") + 1)}`;
      const held = taken(String(c.id));
      slug =
        isCollectionSlug(wanted) && !held(wanted)
          ? wanted
          : privateSlug(String(c.title), handle, held);
    }
    let id = String(c.id);
    const there = targetIds.get(id);
    if (there && (there.slug !== slug || there.owner_id !== owner)) id = makeId();
    if (taken(id)(slug)) {
      const stem = slug.slice(0, SLUG_MAX - 5).replace(/-+$/, "");
      let n = 2;
      while (taken(id)(`${stem}-${n}`)) n++;
      slug = `${stem}-${n}`;
    }
    slugOwners.set(slug, id);
    collections.set(String(c.id), id);
    if (slug !== c.slug) slugs.set(String(c.slug), slug);
    movedCollections.push({ ...c, id, slug, owner_id: owner });
  }
  const collection = (id: Value) => (typeof id === "string" ? (collections.get(id) ?? null) : null);
  for (const c of movedCollections) c.forked_from = collection(c.forked_from);
  const slugOf = (slug: string) => slugs.get(slug) ?? slug;

  /* the rows, each table mapped: a row whose collection or account did not move stays behind */
  const mapped = (table: string, map: (row: Row) => Row | null) =>
    rows(table).flatMap(row => {
      const out = map(row);
      if (!out) drop(table);
      return out ? [out] : [];
    });
  const inCollection = (row: Row) => {
    const id = collection(row.collection_id);
    return id ? { ...row, collection_id: id } : null;
  };
  const items = mapped("k_collection_items", inCollection).sort(
    (a, b) =>
      String(a.collection_id).localeCompare(String(b.collection_id)) ||
      Number(a.position) - Number(b.position)
  );
  const notes = mapped("k_collection_notes", row => {
    const moved = inCollection(row);
    return moved && { ...moved, author_id: account(row.author_id) };
  });
  const votes = mapped("k_collection_votes", row => {
    const moved = inCollection(row);
    const user = mapUser(row.user_id);
    return moved && user ? { ...moved, user_id: user } : null;
  });
  const likes = mapped("k_likes", row => {
    const user = mapUser(row.user_id);
    return user
      ? { ...row, user_id: user, collection_id: collection(row.collection_id) ?? row.collection_id }
      : null;
  });
  const personas = mapped("k_personas", row => {
    const user = mapUser(row.user_id);
    return user ? { ...row, user_id: user } : null;
  });
  const actions = mapped("k_admin_actions", row => ({
    ...row,
    actor_id: account(row.actor_id),
    collection_id: collection(row.collection_id) ?? row.collection_id
  }));
  const contributions = mapped("k_contributions", row => ({
    ...row,
    actor_id: account(row.actor_id)
  }));
  const reviews = mapped("k_reviews", row => {
    const subject = String(row.subject);
    return {
      ...row,
      reviewer_id: account(row.reviewer_id),
      subject: subject.startsWith("collection:")
        ? `collection:${slugOf(subject.slice(11))}`
        : subject
    };
  });
  const queue = mapped("k_queue", row => {
    const payload = JSON.parse(String(row.payload)) as { slug?: string };
    const moved = row.kind === "collection" && payload.slug && slugs.has(payload.slug);
    if (moved) payload.slug = slugOf(payload.slug!);
    return {
      ...row,
      actor: row.actor === null ? null : account(row.actor),
      payload: moved ? JSON.stringify(payload) : row.payload
    };
  });
  const translations = mapped("k_translations", row => {
    if (row.kind !== "collection") return row;
    const key = collection(row.key);
    return key ? { ...row, key } : null;
  });
  const flags = mapped("k_flags", row => ({ ...row, updated_by: account(row.updated_by) }));
  const searchVotes = mapped("k_search_votes", row => {
    const user = mapUser(row.user_id);
    return user ? { ...row, user_id: user } : null;
  });
  const scheduled = mapped("k_scheduled_searches", row => ({
    ...row,
    created_by: row.created_by === null ? null : account(row.created_by)
  }));

  /* the gallery as grabient-lite holds it: a palette production holds keeps production's row */
  const gallery = ["seed", "style", "steps", "angle", "classes", "created_at"];
  const collectionColumns = columns("k_collections").filter(
    column =>
      !["hot", "rising", "rising_3m", "rising_1y", "likes_sum", "fork_count"].includes(column)
  );
  const without = (table: string, ...left: string[]) =>
    columns(table).filter(column => !left.includes(column));
  const moved = {
    auth_user: made.length,
    k_personas: personas.length,
    k_palettes: rows("k_palettes").length,
    k_collections: movedCollections.length,
    k_collection_items: items.length,
    k_collection_notes: notes.length,
    k_collection_votes: votes.length,
    k_likes: likes.length,
    k_admin_actions: actions.length,
    k_contributions: contributions.length,
    k_reviews: reviews.length,
    k_queue: queue.length,
    k_palette_texts: rows("k_palette_texts").length,
    k_translations: translations.length,
    k_flags: flags.length,
    k_search_votes: searchVotes.length,
    k_scheduled_searches: scheduled.length
  };
  const keyed = (table: string, key: string[], rest = without(table, ...key)) =>
    `ON CONFLICT(${key.join(", ")}) DO UPDATE SET ${update(rest)}`;
  const ids = [...collections.values()];
  const statements = [
    ...insertRows("auth_user", columns("auth_user"), made, "ON CONFLICT(id) DO NOTHING"),
    ...insertRows("k_personas", columns("k_personas"), personas, "ON CONFLICT(user_id) DO NOTHING"),
    ...insertRows("k_palettes", gallery, rows("k_palettes"), "ON CONFLICT(seed) DO NOTHING"),
    ...insertRows(
      "k_collections",
      collectionColumns,
      movedCollections,
      keyed(
        "k_collections",
        ["id"],
        collectionColumns.filter(c => c !== "id")
      )
    ),
    /* a collection's palettes are grabient-lite's, in its order: a second run replaces what the first wrote */
    ...chunks(ids, 90).map(
      part =>
        `DELETE FROM k_collection_items WHERE collection_id IN (${part.map(literal).join(", ")})`
    ),
    ...insertRows("k_collection_items", columns("k_collection_items"), items),
    ...insertRows(
      "k_collection_notes",
      columns("k_collection_notes"),
      notes,
      "ON CONFLICT(id) DO NOTHING"
    ),
    ...insertRows(
      "k_collection_votes",
      columns("k_collection_votes"),
      votes,
      keyed("k_collection_votes", ["collection_id", "seed", "user_id"])
    ),
    ...insertRows(
      "k_likes",
      columns("k_likes"),
      likes,
      keyed("k_likes", ["user_id", "palette_id"])
    ),
    ...insertRows(
      "k_admin_actions",
      columns("k_admin_actions"),
      actions,
      "ON CONFLICT(id) DO NOTHING"
    ),
    ...insertRows(
      "k_contributions",
      columns("k_contributions"),
      contributions,
      "ON CONFLICT(id) DO NOTHING"
    ),
    ...insertRows(
      "k_reviews",
      columns("k_reviews"),
      reviews,
      keyed("k_reviews", ["seed", "subject"])
    ),
    /* the target's own progress through the queue stands */
    ...insertRows("k_queue", columns("k_queue"), queue, "", "INSERT OR IGNORE"),
    ...insertRows(
      "k_palette_texts",
      columns("k_palette_texts"),
      rows("k_palette_texts"),
      keyed("k_palette_texts", ["seed"])
    ),
    ...insertRows(
      "k_translations",
      columns("k_translations"),
      translations,
      keyed("k_translations", ["kind", "locale", "key"])
    ),
    /* a switch the target's admins set already stands */
    ...insertRows("k_flags", columns("k_flags"), flags, "ON CONFLICT(name) DO NOTHING"),
    ...insertRows(
      "k_search_votes",
      columns("k_search_votes"),
      searchVotes,
      keyed("k_search_votes", ["query", "seed", "user_id"])
    ),
    ...insertRows(
      "k_scheduled_searches",
      columns("k_scheduled_searches"),
      scheduled,
      "",
      "INSERT OR IGNORE"
    )
  ];
  return {
    statements,
    users,
    created: made.map(user => String(user.id)),
    collections,
    slugs,
    moved,
    dropped
  };
}

/** The counts the moved rows leave to be made whole: each palette's date is the first time the site held it, each
    collection counts its palettes and the accounts holding a copy, and a public one sums its palettes' likes once
    each. Run after the like counts. */
export const collectionRepairs = () => [
  `UPDATE k_palettes SET created_at = (
  SELECT MIN(COALESCE(i.created_at, c.created_at)) FROM k_collection_items i JOIN k_collections c ON c.id = i.collection_id WHERE i.seed = k_palettes.seed
) WHERE created_at > (
  SELECT MIN(COALESCE(i.created_at, c.created_at)) FROM k_collection_items i JOIN k_collections c ON c.id = i.collection_id WHERE i.seed = k_palettes.seed
)`,
  `UPDATE k_collections SET item_count = (SELECT COUNT(*) FROM k_collection_items i WHERE i.collection_id = k_collections.id)
WHERE item_count <> (SELECT COUNT(*) FROM k_collection_items i WHERE i.collection_id = k_collections.id)`,
  `UPDATE k_collections SET fork_count = (SELECT COUNT(DISTINCT f.owner_id) FROM k_collections f WHERE f.forked_from = k_collections.id AND f.owner_kind = 'user')
WHERE fork_count <> (SELECT COUNT(DISTINCT f.owner_id) FROM k_collections f WHERE f.forked_from = k_collections.id AND f.owner_kind = 'user')`,
  `UPDATE k_collections SET likes_sum = CASE WHEN visibility = 'public' THEN (
  SELECT COALESCE(SUM(p.likes_count), 0) FROM k_palettes p WHERE p.seed IN (SELECT seed FROM k_collection_items WHERE collection_id = k_collections.id)) ELSE 0 END
WHERE likes_sum <> CASE WHEN visibility = 'public' THEN (
  SELECT COALESCE(SUM(p.likes_count), 0) FROM k_palettes p WHERE p.seed IN (SELECT seed FROM k_collection_items WHERE collection_id = k_collections.id)) ELSE 0 END`
];

/** What production needs at the cutover besides its migrations: the sign-in tokens and addresses the old app kept
    writing after migration 0034 cleared them. Nothing in a copy without sessions or tokens changes. */
export const authCleanup = () => [
  "UPDATE auth_account SET access_token = NULL, id_token = NULL WHERE access_token IS NOT NULL OR id_token IS NOT NULL",
  "UPDATE auth_session SET ip_address = NULL WHERE ip_address IS NOT NULL"
];
