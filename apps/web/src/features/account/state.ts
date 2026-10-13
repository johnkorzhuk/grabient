import { isServer } from "@solidjs/web";
import { createSignal, createStore } from "solid-js";
import { EMPTY_VIEW, type View } from "./model.ts";
import type { Refusal } from "./store.ts";

/* What pages read of the account's copy, before the copy's engine (sync.ts) has loaded and after: the view, the
   hearts and the sync's status. The engine alone writes them, in the browser; on the server they are never read
   (every reader checks isServer first), so a page renders its public form there and hydrates as it was drawn. */

export interface SyncStatus {
  /** the browser says it has a connection */
  online: boolean;
  /** the last sync could not reach the server, whatever the browser says */
  cutOff: boolean;
  /** changes made here the server has not applied yet */
  pending: number;
  syncing: boolean;
  /** changes the server refused, which the reader has not seen */
  refused: readonly Refusal[];
  /** the copy outlasts the tab (IndexedDB); false in a browser that refuses it */
  persistent: boolean;
  /** when the last sync answered, or 0 */
  syncedAt: number;
  /** the session ended on the server: the changes wait for the reader to sign in again */
  signedOut: boolean;
}

const [status, setStatus] = createSignal<SyncStatus>({
  online: true,
  cutOff: false,
  pending: 0,
  syncing: false,
  refused: [],
  persistent: true,
  syncedAt: 0,
  signedOut: false
});
/** The copy's sync, for the account menu and the offline state. */
export const syncStatus = status;
export const patchStatus = (patch: Partial<SyncStatus>) => setStatus(s => ({ ...s, ...patch }));

const [view, setView] = createSignal<View>(EMPTY_VIEW);
/* the same view, plain: a signal written now reads its old value until the write settles, and the copy's own logic
   reads what it just made */
let plain: View = EMPTY_VIEW;
/** The account's own things as a page shows them: the copy's snapshot with the changes made here over it. Empty
    signed out, and until the copy opens. */
export const accountView = (): View => (isServer ? EMPTY_VIEW : view());
/** The same, read now rather than tracked. */
export const viewNow = (): View => plain;

/* The palettes the account likes, by seed: each heart reads its own key, so a press redraws the hearts it turned and
   no others. */
const [hearts, setHearts] = createStore<Record<string, true>>({});
/** Whether the heart is on, for drawing it: reactive per palette. */
export const heartOn = (seed: string): boolean => !isServer && hearts[seed] === true;
/** Whether the heart is on now, for a decision made at once. */
export const heartNow = (seed: string): boolean => plain.likes.has(seed);

/** The engine shows a new view: the hearts that turned turn with it. */
export function showView(next: View, turned: ReadonlyMap<string, boolean>) {
  plain = next;
  setView(next);
  if (!turned.size) return;
  setHearts(draft => {
    for (const [seed, on] of turned) {
      if (on) draft[seed] = true;
      else delete draft[seed];
    }
  });
}
/** The copy closed: no view, no hearts. */
export function clearView() {
  plain = EMPTY_VIEW;
  setView(EMPTY_VIEW);
  setHearts(draft => {
    for (const seed of Object.keys(draft)) delete draft[seed];
  });
}

/* The addresses of the account's collections, kept in local storage beside the copy: a page the service worker opens
   offline routes its address before IndexedDB is read, and this says it is a collection. Beside them, the addresses
   the server moved a collection from (a new title, who may see it, a new username) and where each went, so Back, an
   open tab or a kept link still leads to the collection. */
export const HINT_KEY = "grabient-account-slugs";
export interface Hint {
  user: string;
  slugs: string[];
  moved: [string, string][];
}
export function readHint(user: string | null): Hint | null {
  if (!user || isServer) return null;
  try {
    const hint = JSON.parse(localStorage.getItem(HINT_KEY) || "null");
    if (hint?.user !== user || !Array.isArray(hint.slugs)) return null;
    const moved = Array.isArray(hint.moved)
      ? hint.moved.filter(
          (pair: unknown): pair is [string, string] =>
            Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string"
        )
      : [];
    return { user, slugs: hint.slugs, moved };
  } catch {
    return null;
  }
}
/** Whether the account's copy last held a collection at this address, or one moved from it. */
export function hintedCollection(user: string | null, slug: string): boolean {
  const hint = readHint(user);
  return !!hint && (hint.slugs.includes(slug) || hint.moved.some(([from]) => from === slug));
}
/** Where the account's collection the copy held at this address lives now, when the server moved it since. */
export const movedCollection = (user: string | null, slug: string): string | null =>
  readHint(user)?.moved.find(([from]) => from === slug)?.[1] ?? null;

/** What a change to the copy moved, for the pages and caches that keep account data of their own. An address gone
    while its collection stands at another is a move (`moved`, old to new), never a removal. */
export interface AccountChange {
  reset: boolean;
  /** the likes that changed in any way */
  likes: ReadonlySet<string>;
  /** the hearts that turned, and whether each is on now */
  turned: ReadonlyMap<string, boolean>;
  collections: ReadonlySet<string>;
  removed: ReadonlySet<string>;
  moved: ReadonlyMap<string, string>;
  /** the account is an admin's, as the copy holds it now */
  admin: boolean;
}
/** A like the server applied: its count now, and the like an unsave took (an undo puts it back). */
export interface SettledLike {
  seed: string;
  liked: boolean;
  likesCount: number | null;
  view: { style: string; steps: number; angle: number };
}

const changeListeners = new Set<(change: AccountChange) => void>();
const settledListeners = new Set<(likes: readonly SettledLike[]) => void>();
/** Hear of every change to the copy that moved what a page shows. Returns the way to stop. */
export function onAccountChange(listener: (change: AccountChange) => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}
/** Hear of the likes each sync settled, with their counts. */
export function onSettledLikes(listener: (likes: readonly SettledLike[]) => void): () => void {
  settledListeners.add(listener);
  return () => settledListeners.delete(listener);
}
const tellEach = <T>(listeners: Set<(value: T) => void>, value: T) => {
  for (const listener of listeners) {
    try {
      listener(value);
    } catch (error) {
      console.error(error);
    }
  }
};
export const tellChange = (change: AccountChange) => tellEach(changeListeners, change);
export const tellSettled = (likes: readonly SettledLike[]) => tellEach(settledListeners, likes);

/* the palettes whose like waits for the server, as the copy last showed them */
let waitingLikes: ReadonlySet<string> = new Set();
export const setWaitingLikes = (seeds: ReadonlySet<string>) => {
  waitingLikes = seeds;
};
/** A change to the palette's like is waiting for the server: its heart shows the press, and its count the press too. */
export const likePending = (seed: string) => waitingLikes.has(seed);
