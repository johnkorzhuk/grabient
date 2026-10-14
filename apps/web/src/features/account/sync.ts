import { locale, msg, t } from "@grabient/i18n";
import { focusManager, onlineManager } from "@tanstack/solid-query";
import * as v from "valibot";
import {
  fold,
  type Maker,
  type Pending,
  rebase,
  type Snapshot,
  settled,
  type View,
  withCollectionId
} from "./model.ts";
import {
  clearView,
  EMPTY_VIEW,
  HINT_KEY,
  movedCollection,
  patchStatus,
  readHint,
  type SettledLike,
  setWaitingLikes,
  showView,
  syncStatus,
  tellChange,
  tellSettled
} from "./state.ts";
import {
  type AccountStore,
  deleteAccountStore,
  type Meta,
  newClientId,
  openAccountStore,
  type Refusal
} from "./store.ts";
import {
  type Profile,
  SyncAnswer,
  type SyncOp,
  type SyncRequest,
  type SyncResponse
} from "./wire.ts";

/* The account's own things, kept in this browser so they show and change with no connection: its likes (Saved) and
   its collections. Every press changes the copy at once and joins an outbox; a sync sends the outbox in order and
   brings back what changed on the server since the last one. The copy lives in IndexedDB (store.ts), shared by every
   tab: a Web Lock lets one tab sync at a time, a tab that changes the copy tells the others (BroadcastChannel), and
   the server skips a change it already applied. A sync runs when the copy opens, after a change, when the browser
   comes back online, when the tab is looked at again, every two minutes while it is, and when a page reads a copy
   older than half a minute. A failure waits longer each time. The browser loads this module once an account is
   known, so a signed-out visitor never downloads it. */

/** The account a copy belongs to, and how its collections name their owner. */
export interface AccountUser {
  id: string;
  /** the username, the handle of what it makes */
  name: string | null;
  /** the name shown */
  display: string | null;
}

interface Copy {
  user: AccountUser;
  store: AccountStore;
  maker: Maker;
  snapshot: Snapshot;
  meta: Meta;
  /** the admin flag the pages were last told */
  admin: boolean | null;
  /** the server refused the session since the last sync it answered: told once, and syncs wait longer each time */
  refusedSession: number;
  /** the outbox as written, and the changes made here still on their way to it, in order */
  persisted: Pending[];
  queue: Pending[];
  /** both folded together: what the view makes over the snapshot */
  pending: Pending[];
  view: View;
  /** the outbox's writes, one after another */
  writes: Promise<unknown>;
}

/** changes one sync sends (the server's SYNC_BATCH) */
const BATCH = 50;
/** a sync with nothing to send skips the server when any tab synced this recently */
const QUIET_MS = 4_000;
/** while the tab is looked at, the copy asks for other devices' changes this often */
const POLL_MS = 120_000;
const BACKOFF_MIN = 1_000;
const BACKOFF_MAX = 60_000;
const SYNC_TIMEOUT_MS = 20_000;
/* a sync that never reached the server cost it nothing, so the next try comes soon: it is how a tab finds the
   connection again when the browser never said it was gone */
const UNREACHED_MAX = 10_000;
const UNSENT = Number.MAX_SAFE_INTEGER;
const MOVES_KEPT = 50;

let copy: Copy | null = null;
let opening: { user: string; work: Promise<Copy | null>; turn: object } | null = null;

/** The view as it stands now, which a signal would show a microtask later. */
export const currentView = (user: string): View | null =>
  copy && copy.user.id === user ? copy.view : null;
/** The copy is open for the account, and has heard from the server. */
export const copyReady = (user: string) => copy?.user.id === user && copy.snapshot.cursor !== null;
/** The copy is open for the account: what the browser kept is read, whether or not a sync answered yet. */
export const copyOpen = (user: string) => copy?.user.id === user;
/** The copy for the account, once it is open in this tab: at once when it is, or when none is opening. */
export const whenOpen = (user: string): Promise<void> =>
  opening?.user === user ? opening.work.then(() => undefined) : Promise.resolve();

/** A page that draws the account's things calls this as it arrives and draws the copy at once: while online, a copy
    last synced longer ago than `stale` syncs now, and what changed elsewhere joins the page where it stands. */
export function freshen(user: string, stale = 30_000): void {
  const c = copy;
  if (
    !c ||
    c.user.id !== user ||
    !onlineManager.isOnline() ||
    Date.now() - c.meta.syncedAt < stale
  ) {
    return;
  }
  // a sync that failed tries again on its own schedule: a struggling server is not asked more
  if (backoff || waitingUntil > Date.now()) return;
  schedule(0, true);
}
const race = (work: Promise<void>, ms: number) =>
  Promise.race([work, new Promise<void>(resolve => setTimeout(resolve, ms))]);
/** The copy, once it has heard from the server or could not: a first sync is waited for while online, `ms` at most. */
export async function copySettled(user: string, ms = 3000): Promise<void> {
  if (copy?.user.id !== user || copy.snapshot.cursor !== null || !onlineManager.isOnline()) return;
  await race(syncNow(), ms);
}
/** A sync now, waited for `ms` at most: what the server changed by itself (the addresses a new username moved)
    reaches the copy before the page that asked goes on. An answer that comes later is followed where it lands. */
export async function syncWithin(ms = 3000): Promise<void> {
  if (!copy || !onlineManager.isOnline()) return;
  await race(syncNow(), ms);
}

/* the promises of the changes this tab made, by key, settled when a sync hears them back, here or in another tab */
const waiters = new Map<string, { resolve: () => void; reject: (reason: Error) => void }>();
type Heard = Pick<Refusal, "error" | "i18n">;
/** A refusal in the reader's words: the server names the ones a page shows with msg(). */
const refusalText = (refusal: Heard) =>
  refusal.i18n?.message
    ? t(refusal.i18n.message, refusal.i18n.params)
    : t(refusal.error || msg("Couldn't save."));
function settleWaiter(key: string, refusal?: Heard) {
  const waiter = waiters.get(key);
  if (!waiter) return;
  waiters.delete(key);
  if (refusal) waiter.reject(new Error(refusalText(refusal)));
  else waiter.resolve();
}

/* the other tabs of this browser */
type Message = {
  user: string;
  kind: "outbox" | "snapshot" | "closed";
  settled?: { key: string; refusal?: Heard }[];
};
let channel: BroadcastChannel | null = null;
let sessionEnded: () => void = () => {};
/** What to do when the server or another tab says the session is over: the session is checked again. */
export const onSessionEnded = (heard: () => void) => {
  sessionEnded = heard;
};
const tell = (message: Message) => {
  try {
    channel?.postMessage(message);
  } catch {
    // a closed channel tells nobody
  }
};
function hear(event: MessageEvent<Message>) {
  const message = event.data;
  const c = copy;
  if (!message || !c || message.user !== c.user.id) return;
  if (message.kind === "closed") {
    sessionEnded();
    return;
  }
  for (const entry of message.settled ?? []) settleWaiter(entry.key, entry.refusal);
  void reload(c, message.kind === "snapshot");
}

/** The account's collection addresses kept beside the copy, with the moves heard: a move heard before follows its
    collection on, and goes once an address is held again or its collection is gone. */
function keepHint(c: Copy, moved: ReadonlyMap<string, string> = new Map()) {
  const held = new Set(c.view.collections.keys());
  const moves = new Map<string, string>();
  for (const [from, to] of readHint(c.user.id)?.moved ?? []) moves.set(from, moved.get(to) ?? to);
  for (const [from, to] of moved) {
    moves.delete(from);
    moves.set(from, to);
  }
  const kept = [...moves]
    .filter(([from, to]) => !held.has(from) && held.has(to))
    .slice(-MOVES_KEPT);
  try {
    localStorage.setItem(
      HINT_KEY,
      JSON.stringify({ user: c.user.id, slugs: [...held], ...(kept.length ? { moved: kept } : {}) })
    );
  } catch {
    // the copy still answers once it is read
  }
}

/* A change is also kept in local storage from the press until IndexedDB holds it: a transaction a page started dies
   with the page, so a reload in that moment would lose it. The next page that opens the copy writes what is kept here
   into the outbox, which takes a change once by its key. */
const journalKey = (user: string) => `grabient-account-journal:${user}`;
function journaled(user: string): Omit<Pending, "id">[] {
  try {
    const kept = JSON.parse(localStorage.getItem(journalKey(user)) || "[]");
    return Array.isArray(kept) ? kept : [];
  } catch {
    return [];
  }
}
function journal(user: string, entry: Omit<Pending, "id">, keep: boolean) {
  try {
    const rest = journaled(user).filter(kept => kept.key !== entry.key);
    const next = keep ? [...rest, entry] : rest;
    if (next.length) localStorage.setItem(journalKey(user), JSON.stringify(next));
    else localStorage.removeItem(journalKey(user));
  } catch {
    // no storage: IndexedDB alone keeps it
  }
}

const isLike = (op: SyncOp): op is Extract<SyncOp, { op: "like" }> => op.op === "like";

/** The view made again from the snapshot and the pending changes, and every page told what moved. `made` names the
    collections made here that the server kept at another address than this browser gave them. */
function show(c: Copy, from?: View, reset = false, made: ReadonlyMap<string, string> = new Map()) {
  c.pending = c.queue.reduce(
    (list, change) => fold(list, change, c.meta.sending, c.snapshot),
    c.persisted
  );
  const before = from ?? c.view;
  c.view = rebase(c.snapshot, c.pending, c.maker);
  if (copy !== c) return;
  setWaitingLikes(
    new Set(c.pending.flatMap(change => (isLike(change.op) ? [change.op.seed] : [])))
  );
  const likes = new Set<string>();
  const turned = new Map<string, boolean>();
  for (const seed of new Set([...before.likes.keys(), ...c.view.likes.keys()])) {
    if (before.likes.get(seed) === c.view.likes.get(seed)) continue;
    likes.add(seed);
    if (before.likes.has(seed) !== c.view.likes.has(seed)) turned.set(seed, c.view.likes.has(seed));
  }
  showView(c.view, turned);
  patchStatus({
    pending: c.pending.length,
    refused: c.meta.refused,
    persistent: c.store.persistent,
    syncedAt: c.meta.syncedAt
  });
  const collections = new Set<string>();
  for (const [slug, doc] of c.view.collections) {
    if (before.collections.get(slug) !== doc) collections.add(slug);
  }
  /* An address gone while its collection stands at another is a move: the pages follow it. One made here has no id
     yet: the sync that made it says where it went, and to another tab the moves kept beside the copy do. */
  const at = new Map<string, string>();
  for (const [slug, doc] of c.view.collections) if (doc.id) at.set(doc.id, slug);
  const removed = new Set<string>();
  const moved = new Map<string, string>();
  for (const [slug, doc] of before.collections) {
    if (c.view.collections.has(slug)) continue;
    const to = doc.id ? at.get(doc.id) : (made.get(slug) ?? movedCollection(c.user.id, slug));
    if (to && c.view.collections.has(to)) moved.set(slug, to);
    else removed.add(slug);
  }
  const adminTurned = c.admin !== c.snapshot.admin;
  c.admin = c.snapshot.admin;
  if (!reset && !adminTurned && !likes.size && !collections.size && !removed.size && !moved.size) {
    return;
  }
  if (reset || collections.size || removed.size || moved.size) keepHint(c, moved);
  tellChange({ reset, likes, turned, collections, removed, moved, admin: c.snapshot.admin });
}

/** Another tab moved the copy: read again what it wrote. */
async function reload(c: Copy, whole: boolean) {
  try {
    if (whole) {
      const stored = await c.store.load();
      if (copy !== c) return;
      c.snapshot = stored.snapshot;
      c.meta = stored.meta;
      c.persisted = stored.outbox;
    } else {
      const { meta, outbox } = await c.store.outbox();
      if (copy !== c) return;
      c.meta = meta;
      c.persisted = outbox;
    }
    show(c);
  } catch (error) {
    console.error("account copy: could not be read again", error);
  }
}

/** Opens the account's copy in this tab: what the browser kept shows at once, and a sync follows. A later open for
    another account supersedes this one. */
export function openAccount(user: AccountUser): Promise<boolean> {
  start();
  const maker: Maker = { name: user.name, display: user.display, origin: location.origin };
  if (copy?.user.id === user.id) {
    copy.user = user;
    copy.maker = maker;
    return Promise.resolve(true);
  }
  if (opening?.user === user.id) return opening.work.then(c => !!c);
  if (copy) closeCopy();
  const turn = {};
  const work = (async () => {
    const store = await openAccountStore(user.id);
    // the changes a page left before IndexedDB held them, in the order they were made
    for (const entry of journaled(user.id).sort((a, b) => a.at - b.at)) {
      await store.add(entry).catch(() => {});
      journal(user.id, entry, false);
    }
    const stored = await store.load();
    if (opening?.turn !== turn) {
      store.close();
      return null;
    }
    const c: Copy = {
      user,
      store,
      maker,
      snapshot: stored.snapshot,
      meta: stored.meta,
      admin: null,
      refusedSession: 0,
      persisted: stored.outbox,
      queue: [],
      pending: [],
      view: EMPTY_VIEW,
      writes: Promise.resolve()
    };
    copy = c;
    opening = null;
    patchStatus({ signedOut: false });
    show(c, EMPTY_VIEW);
    schedule(0, true);
    return c;
  })().catch(error => {
    console.error("account copy: could not be opened", error);
    if (opening?.turn === turn) opening = null;
    return null;
  });
  opening = { user: user.id, work, turn };
  return work.then(c => !!c);
}

function closeCopy() {
  const c = copy;
  copy = null;
  opening = null;
  clearTimeout(timer);
  clearView();
  setWaitingLikes(new Set());
  patchStatus({ pending: 0, syncing: false, refused: [], cutOff: false });
  c?.store.close();
}

/** The reader signed out, or the server ended the session: the copy closes. `forget` deletes it from the browser,
    except the changes not yet sent, which wait for the same account to sign in here again. */
export async function closeAccount(user: string, forget: boolean): Promise<void> {
  if (copy?.user.id === user || opening?.user === user) closeCopy();
  if (!forget) return;
  try {
    localStorage.removeItem(HINT_KEY);
  } catch {
    // nothing kept
  }
  // the other tabs hear it, and ask the server whether their account is still signed in
  tell({ user, kind: "closed" });
  const store = await openAccountStore(user);
  let unsent = 0;
  try {
    unsent = (await store.outbox()).outbox.length;
    if (unsent) await store.forget();
  } finally {
    store.close();
  }
  if (!unsent) await deleteAccountStore(user);
}

/** The account is gone: everything this browser kept of it goes, its unsent changes too. */
export async function eraseAccount(user: string): Promise<void> {
  if (copy?.user.id === user || opening?.user === user) closeCopy();
  try {
    localStorage.removeItem(HINT_KEY);
    localStorage.removeItem(journalKey(user));
  } catch {
    // nothing kept
  }
  await deleteAccountStore(user);
}

/** Makes a change to the account's things: the copy shows it at once, and `done` settles once the server applied it
    (or folded it into nothing) and rejects with the server's reason when it refused it. `key` names the change: an
    undo of a removal points at it. */
export function makeChange(
  op: SyncOp,
  local?: Pending["local"]
): { key: string; done: Promise<void> } {
  const c = copy;
  const key = randomKey();
  if (!c) return { key, done: Promise.reject(new Error(t("Sign in to save palettes."))) };
  const entry: Omit<Pending, "id"> = {
    key,
    op: withCollectionId(op, c.view),
    at: Date.now(),
    ...(local ? { local } : {})
  };
  if (c.store.persistent) journal(c.user.id, entry, true);
  const done = new Promise<void>((resolve, reject) => waiters.set(key, { resolve, reject }));
  const provisional: Pending = { ...entry, id: UNSENT };
  c.queue.push(provisional);
  show(c);
  c.writes = c.writes
    .then(() => c.store.add(entry))
    .then(
      ({ outbox, dropped }) => {
        journal(c.user.id, entry, false);
        c.queue = c.queue.filter(change => change !== provisional);
        // changes this one folded away never reach the server: what they asked is this change's now, or nothing
        for (const gone of dropped) settleWaiter(gone);
        if (copy !== c) return;
        c.persisted = outbox;
        if (!outbox.some(change => change.key === key)) settleFolded(c, key, op);
        show(c);
        tell({ user: c.user.id, kind: "outbox" });
        schedule(0);
      },
      error => {
        journal(c.user.id, entry, false);
        c.queue = c.queue.filter(change => change !== provisional);
        if (copy === c) show(c);
        settleWaiter(key, { error: error instanceof Error ? error.message : String(error) });
      }
    );
  return { key, done };
}
/** The same, waited for. */
export const changeAccount = (op: SyncOp, local?: Pending["local"]) => makeChange(op, local).done;

/** A change folded away settles with the change already on its way for the same thing, if any. */
function settleFolded(c: Copy, key: string, op: SyncOp) {
  const same = isLike(op)
    ? (change: Pending) => isLike(change.op) && change.op.seed === op.seed
    : (change: Pending) => !isLike(change.op) && change.op.slug === op.slug;
  const carrier = c.persisted.filter(same).at(-1);
  const waiter = waiters.get(key);
  if (!waiter) return;
  if (!carrier) {
    settleWaiter(key);
    return;
  }
  const other = waiters.get(carrier.key);
  waiters.delete(key);
  waiters.set(carrier.key, {
    resolve: () => {
      other?.resolve();
      waiter.resolve();
    },
    reject: reason => {
      other?.reject(reason);
      waiter.reject(reason);
    }
  });
}
const randomKey = () =>
  [...crypto.getRandomValues(new Uint8Array(12))]
    .map(b => b.toString(36).padStart(2, "0"))
    .join("");

/** Where a removal an undo would take back stands: still waiting, on its way, or settled. */
export function removalState(key: string): "pending" | "sent" | "settled" {
  const c = copy;
  const change = c?.pending.find(entry => entry.key === key);
  if (!c || !change) return "settled";
  return change.id > c.meta.sending ? "pending" : "sent";
}

/** The reader has seen the refusals: they leave the menu, here and in every tab. */
export async function dismissRefused() {
  const c = copy;
  if (!c) return;
  c.meta = { ...c.meta, refused: [] };
  patchStatus({ refused: [] });
  await c.store.setMeta({ refused: [] });
  tell({ user: c.user.id, kind: "outbox" });
}

/* syncing */
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let again = false;
let force = false;
let backoff = 0;
let waitingUntil = 0;
const idle: (() => void)[] = [];
let profileHeard: (profile: Profile) => void = () => {};
/** Hear the account each sync's answer carries. */
export const onProfile = (heard: (profile: Profile) => void) => {
  profileHeard = heard;
};

/** A sync `delay` from now; `forced` asks the server even when another tab just did. */
export function schedule(delay = 0, forced = false) {
  force ||= forced;
  if (running) {
    again = true;
    return;
  }
  // a refused session's wait stands until it runs out: only a sync that answers ends it
  if (copy?.refusedSession && waitingUntil > Date.now()) return;
  clearTimeout(timer);
  timer = setTimeout(() => void run(), delay);
}
/** A sync now, waited for. */
export async function syncNow(): Promise<void> {
  if (!copy) return;
  if (running) {
    again = true;
    force = true;
    await new Promise<void>(resolve => idle.push(resolve));
    return;
  }
  clearTimeout(timer);
  force = true;
  await run();
}

const locked = <T>(name: string, work: () => Promise<T>): Promise<T> =>
  navigator.locks?.request ? (navigator.locks.request(name, work) as Promise<T>) : work();
class Unreached extends Error {}
class Wait extends Error {
  readonly ms: number;
  constructor(ms: number) {
    super("wait");
    this.ms = ms;
  }
}

async function run() {
  const c = copy;
  if (!c || running) return;
  // a hidden tab believes the browser; a tab the reader looks at tries anyway, since online is only a hint
  if (!onlineManager.isOnline() && document.visibilityState === "hidden") return;
  running = true;
  patchStatus({ syncing: true });
  try {
    await locked(`grabient-sync:${c.user.id}`, async () => {
      do {
        again = false;
        const forced = force;
        force = false;
        await c.writes;
        if (copy !== c) return;
        while ((await syncOnce(c, forced)) && copy === c) {
          // the outbox held more than one sync carries
        }
      } while (again && copy === c);
    });
    backoff = 0;
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof Wait) {
      waitingUntil = Date.now() + error.ms;
      timer = setTimeout(() => void run(), error.ms);
    } else if (!(error instanceof Unreached) || onlineManager.isOnline()) {
      if (!(error instanceof Unreached)) {
        console.warn(
          "account sync: will try again",
          error instanceof Error ? error.message : error
        );
      }
      const most = error instanceof Unreached ? UNREACHED_MAX : BACKOFF_MAX;
      backoff = Math.min(most, Math.max(BACKOFF_MIN, backoff * 2));
      timer = setTimeout(() => void run(), backoff * (0.75 + Math.random() / 2));
    }
  } finally {
    running = false;
    patchStatus({ syncing: false });
    for (const resolve of idle.splice(0)) resolve();
    if (again && copy) {
      again = false;
      schedule(0);
    }
  }
}

/** The turn's changes go back to waiting: a later change may fold into them again. */
async function release(c: Copy) {
  await c.store.release();
  c.meta = { ...c.meta, sending: 0 };
}

/** A change as the server takes it: an undo of a removal carries the removal's token once its answer brought one. */
function sendable(change: Pending, meta: Meta): SyncOp {
  const op = change.op;
  if (op.op !== "collection.restore" || op.restore || !change.local?.removal) return op;
  const token = meta.tokens[change.local.removal]?.token;
  return token ? { ...op, restore: token } : op;
}

/** One turn: the oldest changes out, what changed in. True when the outbox holds more to send. */
async function syncOnce(c: Copy, forced: boolean, renamed = false): Promise<boolean> {
  const { meta, batch } = await c.store.take(BATCH);
  if (!batch.length && !forced && Date.now() - meta.syncedAt < QUIET_MS) {
    await release(c);
    return false;
  }
  c.meta = meta;
  // the page's language goes with the syncs until one answers that the account has one, for the emails no page asks
  const naming = !meta.languageTold;
  const body: SyncRequest = {
    client: meta.client,
    cursor: meta.cursor,
    mutations: batch.map(change => ({ id: change.id, op: sendable(change, meta) })),
    ...(naming ? { locale: locale() } : {}),
    account: c.user.id
  };
  let response: Response;
  try {
    response = await fetch("/api/me/sync", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // a connection that holds a request open without answering gives it up: the tab holds the sync's lock
      signal: AbortSignal.timeout(SYNC_TIMEOUT_MS)
    });
  } catch {
    await release(c);
    patchStatus({ cutOff: true });
    throw new Unreached();
  }
  if (syncStatus().cutOff) patchStatus({ cutOff: false });
  // the id is another account's (a copied browser profile): this browser names itself again and resends, once a turn
  if (response.status === 409 && !renamed) {
    await c.store.setMeta({ client: newClientId(), sending: 0 });
    c.meta = { ...c.meta, sending: 0 };
    return syncOnce(c, forced, true);
  }
  if (response.status === 401) {
    await release(c);
    /* the session is over on the server: the copy stays, the menu asks the reader to sign in, the pages ask for the
       session once, and the copy waits longer each time it is refused, so a session the browser still believes in
       never turns into a loop of requests */
    patchStatus({ signedOut: true });
    if (!c.refusedSession++) sessionEnded();
    throw new Wait(Math.min(BACKOFF_MAX * 10, BACKOFF_MIN * 2 ** Math.min(c.refusedSession, 10)));
  }
  if (!response.ok) {
    await release(c);
    const after = Number(response.headers.get("Retry-After"));
    throw response.status === 429 && after > 0
      ? new Wait(after * 1000)
      : new Error(`sync ${response.status}`);
  }
  const read = v.safeParse(SyncAnswer, await response.json().catch(() => null));
  if (!read.success) {
    await release(c);
    throw new Error("sync: an answer that is not one");
  }
  const answer = read.output as SyncResponse;
  await c.store.settle({ answer, sent: batch });
  if (copy !== c) return false;
  if (naming && answer.language) await c.store.setMeta({ languageTold: true });
  if (c.refusedSession) {
    c.refusedSession = 0;
    patchStatus({ signedOut: false });
  }
  if (answer.account) profileHeard(answer.account);
  const before = c.view;
  c.snapshot = settled(c.snapshot, answer);
  const { meta: after, outbox } = await c.store.outbox();
  if (copy !== c) return false;
  c.meta = after;
  c.persisted = outbox;
  const sent = new Map(batch.map(change => [change.id, change]));
  const made = new Map<string, string>();
  for (const result of answer.results) {
    const op = sent.get(result.id)?.op;
    if (op?.op === "collection.create" && result.ok && result.slug && result.slug !== op.slug) {
      made.set(op.slug, result.slug);
    }
  }
  show(c, before, answer.reset, made);
  // the changes the answer settled: each tab's promises, the hearts' counts
  const results = new Map(answer.results.map(result => [result.id, result]));
  const heard: NonNullable<Message["settled"]> = [];
  const likes: SettledLike[] = [];
  for (const change of batch) {
    if (change.id > answer.lastMutation) continue;
    const result = results.get(change.id);
    const refusal =
      result && !result.ok
        ? { error: result.error ?? "", ...(result.i18n ? { i18n: result.i18n } : {}) }
        : undefined;
    heard.push({ key: change.key, ...(refusal ? { refusal } : {}) });
    settleWaiter(change.key, refusal);
    if (isLike(change.op) && result?.ok) {
      likes.push({
        seed: change.op.seed,
        liked: change.op.liked,
        likesCount: result.likesCount ?? null,
        view: { style: change.op.style, steps: change.op.steps, angle: change.op.angle }
      });
    }
  }
  if (likes.length) tellSettled(likes);
  tell({ user: c.user.id, kind: "snapshot", settled: heard });
  if (answer.retryAfter) throw new Wait(answer.retryAfter * 1000);
  return batch.length === BATCH && c.persisted.length > 0;
}

/* When to sync: the browser back online, the tab looked at again, and now and then while it is. Started once, with
   the first copy this tab opens, and kept for the tab's life. */
let started = false;
function start() {
  if (started) return;
  started = true;
  try {
    channel = new BroadcastChannel("grabient-account");
    channel.addEventListener("message", hear);
  } catch {
    // no other tab hears this one
  }
  onlineManager.subscribe(online => {
    if (!online) return;
    backoff = 0;
    schedule(0, true);
  });
  focusManager.subscribe(focused => {
    if (focused) schedule(0);
  });
  setInterval(() => {
    if (copy && focusManager.isFocused()) schedule(0);
  }, POLL_MS);
}
