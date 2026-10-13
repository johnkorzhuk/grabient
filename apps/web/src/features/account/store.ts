import { fold, type Pending, type Snapshot } from "./model.ts";
import type { SyncCollection, SyncLike, SyncResponse } from "./wire.ts";

/* Where the browser keeps its copy of an account's own things: IndexedDB, one database per account, so every tab of
   the browser reads and writes one copy and signing out deletes one database. A browser that refuses IndexedDB (a
   private window in some browsers, storage blocked) keeps the copy in the tab's memory: everything works while the
   tab is open, and nothing outlives it. The copy's operations are written once, over a transaction either one opens;
   every write is one transaction, so a tab that closes halfway leaves the copy as it was before or after. */

/** A refused change, kept until the reader has seen it: what it was, the collection it was to (the account menu leads
    there), and the server's reason. */
export interface Refusal {
  key: string;
  op: string;
  slug?: string;
  error: string;
  i18n?: { message: string; params?: Record<string, string> };
  at: number;
}
export interface Meta {
  /** this browser's name for itself under the account: the server keeps the last change of each it applied */
  client: string;
  cursor: number | null;
  admin: boolean;
  /** the last change of a sync on its way: changes up to it are not folded with new ones */
  sending: number;
  /** when a sync last answered, for every tab */
  syncedAt: number;
  /** each removal's undo token, by the removal's key; they last a day on the server */
  tokens: Record<string, { token: string; at: number }>;
  refused: Refusal[];
  /** the server keeps the account's language, so syncs stop naming the page's */
  languageTold?: boolean;
}
export interface Stored {
  meta: Meta;
  snapshot: Snapshot;
  outbox: Pending[];
}
/** What one answer settles: the answer, and the changes it carried by their numbers. */
export interface Settling {
  answer: SyncResponse;
  sent: readonly Pending[];
}
export interface AccountStore {
  readonly persistent: boolean;
  load(): Promise<Stored>;
  /** the outbox alone, which another tab's change moved */
  outbox(): Promise<{ meta: Meta; outbox: Pending[] }>;
  /** A change joins the outbox, folded into what is pending; a key written before is kept once. Resolves with the
      list as written and the keys of the changes the fold took away. */
  add(change: Omit<Pending, "id">): Promise<{ outbox: Pending[]; dropped: string[] }>;
  /** the oldest changes not yet heard back, up to `max`, marked as on their way */
  take(max: number): Promise<{ meta: Meta; batch: Pending[] }>;
  /** an answer: the copy moved to it, the changes it settled gone, refusals and tokens kept */
  settle(settling: Settling): Promise<void>;
  /** a sync that got no answer: its changes may fold again */
  release(): Promise<void>;
  setMeta(patch: Partial<Meta>): Promise<void>;
  /** what the copy held of the server goes, and the changes not yet sent stay for the account's next sign-in here */
  forget(): Promise<void>;
  close(): void;
}

type Name = "meta" | "likes" | "collections" | "outbox";
/** One transaction's reach into the copy. Its work awaits nothing but these calls, which IndexedDB requires. */
export interface Tx {
  meta(): Promise<Meta>;
  putMeta(meta: Meta): void;
  likes(): Promise<SyncLike[]>;
  like(seed: string): Promise<SyncLike | undefined>;
  putLike(like: SyncLike): void;
  deleteLike(seed: string): void;
  collections(): Promise<SyncCollection[]>;
  collection(slug: string): Promise<SyncCollection | undefined>;
  putCollection(doc: SyncCollection): void;
  /** every collection kept under an id, at whatever address */
  deleteCollectionsOf(id: string): Promise<void>;
  clear(): void;
  outbox(max?: number): Promise<Pending[]>;
  addPending(change: Omit<Pending, "id">): Promise<number>;
  deletePending(id: number): void;
  deletePendingUpTo(id: number): void;
}
export interface Backend {
  readonly persistent: boolean;
  run<T>(names: readonly Name[], write: boolean, work: (tx: Tx) => Promise<T>): Promise<T>;
  close(): void;
}

const VERSION = 1;
export const databaseName = (user: string) => `grabient-account-${user}`;
// a removal's token outlives no undo the server would take; the newest refusals a reader may still want to see
const TOKEN_MS = 23 * 3_600_000;
const REFUSED_KEPT = 20;
const ALL: readonly Name[] = ["meta", "likes", "collections", "outbox"];

/** Eighteen random bytes in base64url: the name a browser gives itself under an account. */
export function newClientId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}
const freshMeta = (): Meta => ({
  client: newClientId(),
  cursor: null,
  admin: false,
  sending: 0,
  syncedAt: 0,
  tokens: {},
  refused: []
});

/** The meta an answer leaves: the cursor, the tokens its removals answered with, its refusals. */
function settledMeta(meta: Meta, { answer, sent }: Settling, now: number): Meta {
  const tokens: Meta["tokens"] = {};
  for (const [key, kept] of Object.entries(meta.tokens)) {
    if (now - kept.at < TOKEN_MS) tokens[key] = kept;
  }
  const refused = [...meta.refused];
  const byId = new Map(sent.map(change => [change.id, change]));
  for (const result of answer.results) {
    const change = byId.get(result.id);
    if (!change) continue;
    if (result.restore) tokens[change.key] = { token: result.restore, at: now };
    if (!result.ok) {
      refused.push({
        key: change.key,
        op: change.op.op,
        ...(change.op.op === "like" ? {} : { slug: change.op.slug }),
        error: result.error ?? "",
        ...(result.i18n ? { i18n: result.i18n } : {}),
        at: now
      });
    }
  }
  return {
    ...meta,
    cursor: answer.cursor,
    admin: answer.admin,
    sending: 0,
    syncedAt: now,
    tokens,
    refused: refused.slice(-REFUSED_KEPT)
  };
}

/** The copy's operations over either backend. */
export function accountStore(backend: Backend): AccountStore {
  return {
    persistent: backend.persistent,
    load: () =>
      backend.run(ALL, true, async tx => {
        // a client id made now is kept, so every later sync names the same browser
        const meta = await tx.meta();
        tx.putMeta(meta);
        const [likes, collections, outbox] = await Promise.all([
          tx.likes(),
          tx.collections(),
          tx.outbox()
        ]);
        return {
          meta,
          outbox,
          snapshot: {
            cursor: meta.cursor,
            admin: meta.admin,
            likes: new Map(likes.map(like => [like.seed, like])),
            collections: new Map(collections.map(doc => [doc.slug, doc]))
          }
        };
      }),
    outbox: () =>
      backend.run(["meta", "outbox"], false, async tx => ({
        meta: await tx.meta(),
        outbox: await tx.outbox()
      })),
    add: change =>
      backend.run(ALL, true, async tx => {
        const [meta, pending] = await Promise.all([tx.meta(), tx.outbox()]);
        // a change written once already (a page's journal written again) stays as it was
        if (pending.some(entry => entry.key === change.key))
          return { outbox: pending, dropped: [] };
        // what the server held of the one like or collection the change names, read in this transaction
        const op = change.op;
        const like = op.op === "like" ? await tx.like(op.seed) : undefined;
        const doc = op.op === "like" ? undefined : await tx.collection(op.slug);
        const held: Snapshot = {
          cursor: null,
          admin: false,
          likes: new Map(like ? [[like.seed, like]] : []),
          collections: new Map(doc ? [[doc.slug, doc]] : [])
        };
        const next: Pending = { ...change, id: Number.MAX_SAFE_INTEGER };
        const folded = fold(pending, next, meta.sending, held);
        const kept = new Set(folded);
        const dropped: string[] = [];
        for (const entry of pending) {
          if (kept.has(entry)) continue;
          tx.deletePending(entry.id);
          dropped.push(entry.key);
        }
        if (!kept.has(next)) return { outbox: folded, dropped };
        const id = await tx.addPending(change);
        return {
          outbox: folded.map(entry => (entry === next ? { ...change, id } : entry)),
          dropped
        };
      }),
    take: max =>
      backend.run(["meta", "outbox"], true, async tx => {
        const [meta, batch] = await Promise.all([tx.meta(), tx.outbox(max)]);
        const marked = { ...meta, sending: batch.at(-1)?.id ?? 0 };
        tx.putMeta(marked);
        return { meta: marked, batch };
      }),
    settle: settling =>
      backend.run(ALL, true, async tx => {
        const { answer } = settling;
        if (answer.reset) tx.clear();
        for (const like of answer.likes) tx.putLike(like);
        for (const seed of answer.unliked) tx.deleteLike(seed);
        // a collection is one by its id: whatever address the copy kept it at goes before the answer's
        for (const id of [...answer.removed, ...answer.collections.map(doc => doc.id)]) {
          await tx.deleteCollectionsOf(id);
        }
        for (const doc of answer.collections) tx.putCollection(doc);
        tx.deletePendingUpTo(answer.lastMutation);
        tx.putMeta(settledMeta(await tx.meta(), settling, Date.now()));
      }),
    release: () =>
      backend.run(["meta"], true, async tx => {
        tx.putMeta({ ...(await tx.meta()), sending: 0 });
      }),
    setMeta: patch =>
      backend.run(["meta"], true, async tx => {
        tx.putMeta({ ...(await tx.meta()), ...patch });
      }),
    forget: () =>
      backend.run(["meta", "likes", "collections"], true, async tx => {
        tx.clear();
        tx.putMeta({
          ...(await tx.meta()),
          cursor: null,
          admin: false,
          sending: 0,
          tokens: {},
          refused: []
        });
      }),
    close: () => backend.close()
  };
}

/** The copy in this tab's memory: each transaction works on a draft, kept only when its work completes, one after
    another, as IndexedDB's are. */
export function memoryBackend(): Backend {
  let meta: Meta | undefined;
  let likes = new Map<string, SyncLike>();
  let collections = new Map<string, SyncCollection>();
  let outbox = new Map<number, Pending>();
  let nextId = 1;
  let turn: Promise<unknown> = Promise.resolve();
  return {
    persistent: false,
    run(_names, write, work) {
      const run = turn.then(async () => {
        const draft = {
          meta,
          likes: new Map(likes),
          collections: new Map(collections),
          outbox: new Map(outbox),
          nextId
        };
        const tx: Tx = {
          meta: async () => ({ ...freshMeta(), ...draft.meta }),
          putMeta: value => {
            draft.meta = value;
          },
          likes: async () => [...draft.likes.values()],
          like: async seed => draft.likes.get(seed),
          putLike: like => draft.likes.set(like.seed, like),
          deleteLike: seed => draft.likes.delete(seed),
          collections: async () => [...draft.collections.values()],
          collection: async slug => draft.collections.get(slug),
          putCollection: doc => draft.collections.set(doc.slug, doc),
          deleteCollectionsOf: async id => {
            for (const [slug, doc] of draft.collections) {
              if (doc.id === id) draft.collections.delete(slug);
            }
          },
          clear: () => {
            draft.likes.clear();
            draft.collections.clear();
          },
          outbox: async max => [...draft.outbox.values()].sort((a, b) => a.id - b.id).slice(0, max),
          addPending: async change => {
            const id = draft.nextId++;
            draft.outbox.set(id, { ...change, id });
            return id;
          },
          deletePending: id => draft.outbox.delete(id),
          deletePendingUpTo: last => {
            for (const id of draft.outbox.keys()) if (id <= last) draft.outbox.delete(id);
          }
        };
        const value = await work(tx);
        if (write) ({ meta, likes, collections, outbox, nextId } = draft);
        return value;
      });
      turn = run.catch(() => {});
      return run;
    },
    close() {}
  };
}

const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

function indexedBackend(db: IDBDatabase): Backend {
  return {
    persistent: true,
    run: <T>(names: readonly Name[], write: boolean, work: (tx: Tx) => Promise<T>) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(names, write ? "readwrite" : "readonly");
        const store = (name: Name) => t.objectStore(name);
        let value!: T;
        // a value read inside a transaction is trusted only once the whole transaction stood
        t.oncomplete = () => resolve(value);
        t.onerror = () => reject(t.error);
        t.onabort = () =>
          reject(t.error ?? new DOMException("The write was abandoned.", "AbortError"));
        const tx: Tx = {
          meta: async () => ({
            ...freshMeta(),
            ...((await request(store("meta").get("meta"))) as Meta | undefined)
          }),
          putMeta: meta => store("meta").put(meta, "meta"),
          likes: () => request(store("likes").getAll()) as Promise<SyncLike[]>,
          like: seed => request(store("likes").get(seed)) as Promise<SyncLike | undefined>,
          putLike: like => store("likes").put(like),
          deleteLike: seed => store("likes").delete(seed),
          collections: () => request(store("collections").getAll()) as Promise<SyncCollection[]>,
          collection: slug =>
            request(store("collections").get(slug)) as Promise<SyncCollection | undefined>,
          putCollection: doc => store("collections").put(doc),
          deleteCollectionsOf: async id => {
            const slugs = await request(store("collections").index("id").getAllKeys(id));
            for (const slug of slugs) store("collections").delete(slug);
          },
          clear: () => {
            store("likes").clear();
            store("collections").clear();
          },
          outbox: max => request(store("outbox").getAll(null, max)) as Promise<Pending[]>,
          addPending: change => request(store("outbox").add(change)) as Promise<number>,
          deletePending: id => store("outbox").delete(id),
          deletePendingUpTo: last => store("outbox").delete(IDBKeyRange.upperBound(last))
        };
        work(tx).then(
          result => {
            value = result;
          },
          error => {
            try {
              t.abort();
            } catch {
              // already over
            }
            reject(error);
          }
        );
      }),
    close: () => db.close()
  };
}

function openDatabase(user: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(databaseName(user), VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore("meta");
      db.createObjectStore("likes", { keyPath: "seed" });
      db.createObjectStore("collections", { keyPath: "slug" }).createIndex("id", "id");
      db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    // another tab holds an older version open: this one waits, and that tab lets go on its versionchange
    r.onblocked = () => {};
  });
}

/** The account's copy in this browser: IndexedDB, or this tab's memory when the browser refuses it. */
export async function openAccountStore(user: string): Promise<AccountStore> {
  if (typeof indexedDB === "undefined") return accountStore(memoryBackend());
  try {
    const db = await openDatabase(user);
    // a newer build opened the database in another tab: this one lets go
    db.onversionchange = () => db.close();
    return accountStore(indexedBackend(db));
  } catch {
    return accountStore(memoryBackend());
  }
}

/** The account's copy goes from this browser. */
export function deleteAccountStore(user: string): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return new Promise(resolve => {
    const r = indexedDB.deleteDatabase(databaseName(user));
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}
