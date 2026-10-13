import { DEFAULT_ANGLE, DEFAULT_STEPS, DEFAULT_STYLE } from "@grabient/engine/view.ts";
import { localHref, t } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import { createStore } from "solid-js";
import * as v from "valibot";
import { openedOutside } from "../../app/framed.ts";
import { record } from "../../app/undo.ts";
import { trackEvent, trackSignInPrompt } from "../analytics/analytics.ts";
import {
  account,
  accountKnown,
  adminAccount,
  copyEngine,
  loadAccount,
  loginHref
} from "./session.ts";
import {
  heartNow,
  heartOn,
  likePending,
  onAccountChange,
  onSettledLikes,
  viewNow
} from "./state.ts";
import type { ItemView, SyncOp } from "./wire.ts";

/* The hearts and their counts. A heart is the account's like of a palette, kept in the account's copy (sync.ts): it
   turns over at once, offline too, and the server follows. The count beside it is the server's, read with the page
   or asked for in batches, moved by a press the server has not settled. Counts are public: they are kept for every
   visitor, signed in or not. */

/** Whether the account likes the palette: its heart. Reactive per palette; false signed out and on the server. */
export const liked = (seed: string): boolean => heartOn(seed);

// a count is asked for again this long after it was read, and a liked palette's after this, since another device of
// the account may have liked it since the page read it
const COUNT_FRESH_MS = 300_000;
const LIKED_RECOUNT_MS = 10_000;
const COUNTS_KEPT = 2048;
const COUNTS_ASKED = 96;

/* Each count the page knows and when it was read (0: due again), oldest first, which the logic reads at once; and
   the same counts in a store each count's text reads. */
const known = new Map<string, { count: number; at: number }>();
const [counts, setCounts] = createStore<Record<string, number>>({});
/* a like changed since an ask left: its answer is older than the press, and dropped */
let likesVersion = 0;

/** The count beside a palette's heart: the latest this page knows, else `shown`, the one its page read with its data.
    A page that reads none asks for it with readLikeCounts. */
export const likeCount = (seed: string, shown = 0): number =>
  isServer ? shown : (counts[seed] ?? shown);

/** Counts read from the server or a page. A palette whose like is being written shows the press instead, and the
    write's answer brings its count. */
const storeCounts = (entries: readonly (readonly [string, number])[], at: number) =>
  put(
    entries.filter(([seed]) => !likePending(seed)),
    at
  );
function put(kept: readonly (readonly [string, number])[], at: number) {
  if (!kept.length) return;
  for (const [seed, count] of kept) {
    known.delete(seed);
    known.set(seed, { count, at });
  }
  const dropped: string[] = [];
  for (const seed of known.keys()) {
    if (known.size - dropped.length <= COUNTS_KEPT) break;
    dropped.push(seed);
  }
  for (const seed of dropped) known.delete(seed);
  setCounts(draft => {
    for (const [seed, count] of kept) draft[seed] = count;
    for (const seed of dropped) delete draft[seed];
  });
}

/* The counts this browser's likes left, kept a quarter of an hour in local storage: a list is drawn from data kept for
   minutes at the edge, so without them a palette liked a moment ago would read one short after a reload. A kept count
   stands over page data read before it, and data read after it stands over it. A count is public: no account is kept
   with it. */
const KEPT_KEY = "grabient-like-counts";
const KEPT_MS = 15 * 60_000;
const KEPT_MAX = 200;
const Kept = v.record(v.string(), v.object({ count: v.number(), at: v.number() }));
function keptCounts(): Map<string, { count: number; at: number }> {
  const now = Date.now();
  try {
    const read = v.safeParse(Kept, JSON.parse(localStorage.getItem(KEPT_KEY) || "{}"));
    if (!read.success) return new Map();
    return new Map(Object.entries(read.output).filter(([, kept]) => now - kept.at < KEPT_MS));
  } catch {
    return new Map();
  }
}
function keepCount(seed: string, count: number, at: number) {
  // read again first: another tab may have kept some since this one looked
  const all = keptCounts();
  all.delete(seed);
  all.set(seed, { count, at });
  const newest = [...all].sort((a, b) => b[1].at - a[1].at).slice(0, KEPT_MAX);
  try {
    localStorage.setItem(KEPT_KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch {
    // this page keeps them
  }
}

/** The counts a page read with its data, at `at` (its read time): kept with their age, so a remount never makes an
    old count fresh again, and passed over where this browser's own like left a newer one. */
export function noteCounts(items: readonly { seed: string; likes: number }[], at?: number) {
  if (isServer) return;
  const kept = keptCounts();
  const recount: string[] = [];
  const now = Date.now();
  for (const { seed, likes } of items) {
    if (!Number.isFinite(likes) || likes < 0) continue;
    const previous = known.get(seed)?.at;
    if (at === undefined && previous !== undefined) continue;
    const read = at === undefined ? now : Math.min(now, at);
    const mine = kept.get(seed);
    const newer = !!mine && mine.at > read && (previous === undefined || previous < mine.at);
    /* a like this browser made after the page's data was read: its count stands over the page's, a task later as a
       count asked from the server would, since a card still hydrating with the server's count must keep it */
    if (newer) {
      setTimeout(() => {
        if ((known.get(seed)?.at ?? 0) < mine.at) storeCounts([[seed, mine.count]], mine.at);
      }, 0);
    }
    if (previous !== undefined && previous >= read) continue;
    storeCounts([[seed, likes]], read);
    if (!newer && heartNow(seed) && now - read > LIKED_RECOUNT_MS) recount.push(seed);
  }
  askAgain(recount);
}

/* counts asked again whatever their age: something the data they came from cannot know changed them */
function askAgain(seeds: readonly string[]) {
  if (!seeds.length) return;
  for (const seed of seeds) {
    const held = known.get(seed);
    if (held) held.at = 0;
  }
  void readLikeCounts(seeds).catch(() => {});
}

const queue = new Set<string>();
const asking = new Set<string>();
let batch: Promise<void> | null = null;
/** Whether a palette's count would be asked for now: none read lately, and none on its way. */
export const countDue = (seed: string, now = Date.now()): boolean =>
  !asking.has(seed) && now - (known.get(seed)?.at ?? 0) >= COUNT_FRESH_MS;
/** Asks the server for the counts that are due, together: cards mount together, so their asks gather for a
    microtask and go 96 at a time. */
export function readLikeCounts(seeds: readonly string[]): Promise<void> {
  if (isServer) return Promise.resolve();
  const now = Date.now();
  for (const seed of seeds) {
    if (!countDue(seed, now)) continue;
    queue.add(seed);
    asking.add(seed);
  }
  if (batch) return batch;
  if (!queue.size) return Promise.resolve();
  batch = (async () => {
    await Promise.resolve();
    while (queue.size) {
      const keys = [...queue].slice(0, COUNTS_ASKED);
      const version = likesVersion;
      for (const seed of keys) queue.delete(seed);
      try {
        const response = await fetch(`/api/like-counts?keys=${encodeURIComponent(keys.join(","))}`);
        if (!response.ok) throw new Error(`like counts ${response.status}`);
        const read = ((await response.json()) as { counts?: Record<string, unknown> }).counts ?? {};
        if (version !== likesVersion) continue;
        storeCounts(
          keys.flatMap(seed => {
            const count = read[seed];
            return typeof count === "number" && count >= 0 ? [[seed, count] as const] : [];
          }),
          Date.now()
        );
      } finally {
        for (const seed of keys) asking.delete(seed);
      }
    }
  })()
    .catch(error => {
      // a batch queued while this one was out is let go too, so a later ask asks again
      for (const seed of queue) asking.delete(seed);
      queue.clear();
      throw error;
    })
    .finally(() => {
      batch = null;
    });
  return batch;
}

/* the count beside a heart the server has not settled: the server's count moved by the reader's press */
const moved = (count: number, countedLiked: boolean, liked: boolean) =>
  Math.max(0, count + (liked === countedLiked ? 0 : liked ? 1 : -1));

if (!isServer) {
  /* The hearts follow the copy: a press, another tab's press, a sync that brought another device's like or took back a
     refused one. A heart that turns moves its count by one at once; a like the server sent comes with its count, and
     an unlike it sent is counted again. */
  onAccountChange(change => {
    if (!change.turned.size) return;
    likesVersion++;
    const now = Date.now();
    const recount: string[] = [];
    for (const [seed, on] of change.turned) {
      const held = known.get(seed);
      if (!held) continue;
      put([[seed, moved(held.count, !on, on)]], held.at);
      if (likePending(seed)) continue;
      const like = viewNow().likes.get(seed);
      if (like) put([[seed, like.likes]], now);
      else recount.push(seed);
    }
    askAgain(recount);
  });
  /* The likes a sync settled: each one's count as the server answered, moved by any press still waiting on it, and
     kept for a reload over list data read before it. */
  onSettledLikes(settled => {
    likesVersion++;
    const now = Date.now();
    for (const { seed, liked: on, likesCount, view } of settled) {
      trackEvent(on ? "save_gradient" : "unsave_gradient", { seed, ...view });
      if (likesCount === null) {
        const held = known.get(seed);
        if (held) held.at = 0;
        continue;
      }
      keepCount(seed, likesCount, now);
      put([[seed, moved(likesCount, on, heartNow(seed))]], now);
    }
  });
}

/* The like each palette had when it was unsaved, as the copy held it: what an undo or a redo that saves it again puts
   back, at its own time, in its own view and with any title an app gave it, so it stands where it stood in Saved. */
type Was = ItemView & { at: number; title?: string };
const likeWas = new Map<string, Was>();
const LIKES_REMEMBERED = 512;
function keepWas(seed: string, was: Was) {
  likeWas.delete(seed);
  likeWas.set(seed, was);
  if (likeWas.size > LIKES_REMEMBERED) likeWas.delete(likeWas.keys().next().value!);
}

/** Where a heart was pressed, for an admin's like alone: the words of the search its page answers, or the collection
    its page shows (by its id or address). And the view the palette is saved in, as the page shows it. */
export interface LikeContext {
  view?: ItemView;
  query?: string;
  collectionId?: string;
}

/** A heart pressed: the palette's like turns over on the page at once, the account's copy keeps it, offline too, and
    the server follows. Every heart goes through here; signed out it leads to sign in. Resolves once the server holds
    the reader's last press on the palette; rejects when it refuses it, with the heart and the count put back, for
    the page to say why. */
export function toggleLike(seed: string, on: boolean, context: LikeContext = {}): Promise<void> {
  return setLiked(seed, on, context, {});
}

async function setLiked(
  seed: string,
  on: boolean,
  context: LikeContext,
  how: { quiet?: boolean; restore?: boolean }
): Promise<void> {
  // a press made before the page knows who is signed in waits for the answer; one made after never waits
  if (account() === undefined) await accountKnown();
  if (!account()) {
    trackSignInPrompt("like");
    const to = loginHref();
    if (!openedOutside(to)) location.assign(localHref(to));
    return;
  }
  const sync = await copyEngine();
  if (!sync.copyOpen(account()?.id ?? "")) await loadAccount();
  const id = account()?.id;
  if (!id || !sync.copyOpen(id)) throw new Error(t("Sign in to save palettes."));
  const was = on && how.restore ? likeWas.get(seed) : undefined;
  // the like as the copy holds it, for an undo of this unsave to put back
  const held = on ? undefined : sync.currentView(id)?.likes.get(seed);
  if (held) {
    keepWas(seed, {
      at: held.at,
      style: held.style,
      steps: held.steps,
      angle: held.angle,
      ...(held.title ? { title: held.title } : {})
    });
  }
  /* a press is a step of the page's undo, read from what the page shows: taken back, the heart turns over the other
     way, and a palette unsaved comes back at its own time; done again, it turns as pressed */
  if (!how.quiet && heartNow(seed) !== on) {
    record({
      undo: () => setLiked(seed, !on, context, { quiet: true, restore: !on }),
      redo: () => setLiked(seed, on, context, { quiet: true, restore: on })
    });
  }
  const view = was ??
    context.view ?? { style: DEFAULT_STYLE, steps: DEFAULT_STEPS, angle: DEFAULT_ANGLE };
  const from = on && adminAccount() ? pressedAt(context) : undefined;
  const op: SyncOp = {
    op: "like",
    seed,
    liked: on,
    style: view.style,
    steps: view.steps,
    angle: view.angle,
    ...(was ? { at: was.at, ...(was.title ? { title: was.title } : {}) } : {}),
    ...(from ? { from } : {})
  };
  return sync.changeAccount(op);
}
const pressedAt = (context: LikeContext) =>
  context.query || context.collectionId
    ? {
        ...(context.query ? { q: context.query } : {}),
        ...(context.collectionId ? { collection: context.collectionId } : {})
      }
    : undefined;

/** An admin saved an edit of a palette over it: the likes moved with it on the server, and the next sync brings the
    hearts; the count follows at once. */
export function movePaletteLike(from: string, to: string) {
  likesVersion++;
  const held = known.get(from);
  if (held) storeCounts([[to, held.count]], Date.now());
  void copyEngine().then(sync => sync.schedule(0, true));
}
