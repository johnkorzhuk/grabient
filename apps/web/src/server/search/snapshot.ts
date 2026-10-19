/* The snapshot an isolate answers from: the copy that shipped with the deploy (public/search/snapshot.bin), or the newer
   one the schedule built into R2 (sync.ts). The first search of an isolate reads both; after that the store is asked at
   most every CHECK_EVERY, conditionally on the copy last seen, so a palette made public now is found within about
   fifteen minutes however much traffic arrives. A search never fails on the store. */
import { decodeSnapshot, encodeSnapshot, type Snapshot } from "@grabient/search/snapshot.ts";
import type { Env } from "@grabient/server/env.ts";
import { joined } from "@grabient/server/shared-work.ts";
import { searchAsset } from "./files.ts";

export type SnapshotEnv = Pick<Env, "ASSETS"> & Partial<Pick<Env, "SEARCH_SNAPSHOTS">>;
/** What can keep work going after the answer: ExecutionContext's, or `waitUntil` of cloudflare:workers. */
export type Background = { waitUntil(work: Promise<unknown>): void };

const CHECK_EVERY = 5 * 60_000;
/** A request waits this long for the store, then answers from what it holds and asks again after RETRY_AFTER. */
const STORE_WAIT = 1500;
const RETRY_AFTER = 30_000;

export const snapshotKey = (version: string) => `snapshot-${version}.bin`;

/** The copy this deploy shipped. */
export async function shippedSnapshot(env: Pick<Env, "ASSETS">): Promise<Snapshot> {
  return decodeSnapshot(await (await searchAsset(env, "snapshot.bin")).arrayBuffer());
}

/** The stored copy of this model version: null when there is none, "same" when it is the one seen last. */
async function storedSnapshot(
  store: R2Bucket,
  version: string,
  seenEtag?: string
): Promise<{ snapshot: Snapshot; etag: string } | "same" | null> {
  const object = await store.get(
    snapshotKey(version),
    seenEtag ? { onlyIf: { etagDoesNotMatch: seenEtag } } : undefined
  );
  if (!object) return null;
  if (!("body" in object)) return "same";
  return { snapshot: decodeSnapshot(await object.arrayBuffer()), etag: object.etag };
}

/** Stores a build, with what the schedule's idle run compares in its metadata: when it was built, the state of the site
    it was built from and the work it still owes. Returns its size. */
export async function storeSnapshot(store: R2Bucket, snapshot: Snapshot): Promise<number> {
  const bytes = encodeSnapshot(snapshot);
  await store.put(snapshotKey(snapshot.version), bytes, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: {
      builtAt: String(snapshot.builtAt),
      palettes: String(snapshot.seeds.length),
      collections: String(snapshot.slugs.length),
      mark: snapshot.mark,
      pending: String(snapshot.pending)
    }
  });
  return bytes.length;
}

/** What the stored copy says of itself without its body; null when there is none or its metadata lacks these. */
export async function storedMark(
  store: R2Bucket,
  version: string
): Promise<Pick<Snapshot, "builtAt" | "mark" | "pending"> | null> {
  const meta = (await store.head(snapshotKey(version)))?.customMetadata;
  const builtAt = Number(meta?.builtAt);
  const pending = Number(meta?.pending);
  return meta?.mark && Number.isFinite(builtAt) && Number.isFinite(pending)
    ? { builtAt, mark: meta.mark, pending }
    : null;
}

/** The newer of the shipped and the stored copy, as a build starts from it, and which it is. Reads the store whole, so
    only the schedule calls it. */
export async function latestSnapshot(
  env: SnapshotEnv
): Promise<{ snapshot: Snapshot; from: "assets" | "store" }> {
  const base = await shippedSnapshot(env);
  const stored = env.SEARCH_SNAPSHOTS
    ? await storedSnapshot(env.SEARCH_SNAPSHOTS, base.version).catch(() => null)
    : null;
  return stored &&
    stored !== "same" &&
    stored.snapshot.d === base.d &&
    stored.snapshot.builtAt > base.builtAt
    ? { snapshot: stored.snapshot, from: "store" }
    : { snapshot: base, from: "assets" };
}

interface Holder {
  held?: { snapshot: Snapshot; from: "assets" | "store" };
  first?: Promise<Snapshot | null>;
  seenEtag?: string;
  checkedAt: number;
}
// by the assets binding: an isolate keeps its bindings from request to request
const holders = new WeakMap<Fetcher, Holder>();

function within<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  let stop = () => {};
  const late = new Promise<undefined>(done => {
    const timer = setTimeout(done, ms);
    stop = () => clearTimeout(timer);
  });
  return Promise.race([work, late]).finally(() => stop());
}

/* The stored copy when it is newer than `current`, else null. A store that is slow or fails is asked again after
   RETRY_AFTER; a copy passed over is not downloaded again. */
async function newerThan(
  env: SnapshotEnv,
  holder: Holder,
  current: Snapshot
): Promise<Snapshot | null> {
  if (!env.SEARCH_SNAPSHOTS) return null;
  try {
    const found = await within(
      storedSnapshot(env.SEARCH_SNAPSHOTS, current.version, holder.seenEtag),
      STORE_WAIT
    );
    if (found === undefined) {
      holder.checkedAt = Date.now() - CHECK_EVERY + RETRY_AFTER;
      return null;
    }
    if (!found || found === "same") return null;
    holder.seenEtag = found.etag;
    const next = found.snapshot;
    return next.version === current.version &&
      next.d === current.d &&
      next.builtAt > current.builtAt
      ? next
      : null;
  } catch (error) {
    holder.checkedAt = Date.now() - CHECK_EVERY + RETRY_AFTER;
    console.error(
      "search snapshot: the store could not be read",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/* An isolate's first read of the snapshot: the shipped copy, then the store's when it is newer. */
function readFirst(env: SnapshotEnv, own: Holder): Promise<Snapshot | null> {
  const first: Promise<Snapshot | null> = (async () => {
    const base = await shippedSnapshot(env).catch(() => null);
    if (!base) return null;
    own.checkedAt = Date.now();
    const newer = await newerThan(env, own, base);
    const read = newer
      ? { snapshot: newer, from: "store" as const }
      : { snapshot: base, from: "assets" as const };
    if (!own.held || read.snapshot.builtAt > own.held.snapshot.builtAt) own.held = read;
    return own.held.snapshot;
  })().finally(() => {
    if (own.first === first) own.first = undefined;
  });
  own.first = first;
  return first;
}

/** The snapshot to answer from. Calls that arrive while an isolate reads its first wait for that read beside a timer of
    their own, and read it themselves when it has not come by then (@grabient/server/shared-work.ts); a later check of
    the store runs in the background when `ctx` is given. */
export async function loadSnapshot(env: SnapshotEnv, ctx?: Background): Promise<Snapshot | null> {
  let holder = holders.get(env.ASSETS);
  if (!holder) {
    holder = { checkedAt: 0 };
    holders.set(env.ASSETS, holder);
  }
  const { held } = holder;
  if (!held) {
    const own = holder;
    const begun = own.first;
    if (!begun) return readFirst(env, own);
    return joined(begun, () =>
      own.first === begun ? readFirst(env, own) : loadSnapshot(env, ctx)
    );
  }
  if (Date.now() - holder.checkedAt >= CHECK_EVERY) {
    holder.checkedAt = Date.now();
    const own = holder;
    const looking = newerThan(env, own, held.snapshot).then(found => {
      if (found && own.held && found.builtAt > own.held.snapshot.builtAt)
        own.held = { snapshot: found, from: "store" };
    });
    if (ctx) ctx.waitUntil(looking);
    else await looking;
  }
  return holder.held?.snapshot ?? null;
}

/** What this isolate answers from, for `GET /api/search/status`. */
export async function snapshotStatus(env: SnapshotEnv, ctx?: Background) {
  const snapshot = await loadSnapshot(env, ctx);
  const from = holders.get(env.ASSETS)?.held?.from;
  return snapshot && from
    ? {
        available: true as const,
        version: snapshot.version,
        builtAt: snapshot.builtAt,
        from,
        palettes: snapshot.seeds.length,
        titled: snapshot.titles.filter(Boolean).length,
        collections: snapshot.slugs.length,
        pending: snapshot.pending
      }
    : { available: false as const };
}
