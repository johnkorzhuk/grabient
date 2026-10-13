/* What the editor asks the server about the palette on screen (how many like it, the palettes like it, the served
   Markdown of one opened from a card) is asked for a palette that has come to rest, never one passing by. Every edit
   makes another palette, whose answer no cache holds, and a held key makes many a second: the editing is never slowed,
   the asking is.

   A palette has rested once it has stood for a wait: half a second for a reader who edits now and then, doubling with
   each ask made in the last ten seconds, up to two. One who holds Random down asks once, on letting go; one who presses
   it again and again asks at most every two seconds; and however the presses are timed, no more than twelve asks leave
   in a minute. A palette that has stood its wait already is asked about at once, and so is one a page opened on. */
const REST_MS = 500;
const REST_MAX = 2000;
const QUICK_MS = 10_000;
const MINUTE = 60_000;
const PER_MINUTE = 12;
/* two questions about one palette (its neighbors and its file) are one ask */
const SAME_MS = 2000;

export function createRest(clock: () => number = Date.now) {
  let changed = 0;
  let asks: { at: number; key: string }[] = [];
  let seedShown: string | null = null;
  let viewShown: string | null = null;
  let opened: string | null = null;

  /** How long a palette must stand now before the server is asked about it. */
  function wait(now = clock()): number {
    asks = asks.filter(ask => now - ask.at < MINUTE);
    const quick = asks.filter(ask => now - ask.at < QUICK_MS).length;
    const rest = Math.min(REST_MAX, REST_MS * 2 ** quick);
    /* the minute's allowance: the wait until the oldest ask in it is a minute old */
    const room = asks.length >= PER_MINUTE ? asks[asks.length - PER_MINUTE].at + MINUTE - now : 0;
    return Math.max(rest, room);
  }

  return {
    wait,
    /** A page opened on this palette: it has been standing, and what is asked about it is asked at once. */
    opened(seed: string) {
      seedShown = seed;
      viewShown = null;
      opened = seed;
      changed = 0;
    },
    /** Whether a page opened on this palette, which no edit made. */
    openedOn: (seed: string) => opened === seed,
    /** The palette on screen, told by whoever is about to ask about it, with how it is drawn where that decides the
        answer: another palette or view than the last told has just changed, and starts its rest. */
    is(seed: string, view?: string, now = clock()) {
      if (seedShown !== null && seed !== seedShown) changed = now;
      seedShown = seed;
      if (view === undefined) return;
      if (viewShown !== null && view !== viewShown) changed = now;
      viewShown = view;
    },
    /** How long until the palette on screen has rested: nothing for one that has stood its wait already. */
    left: (now = clock()) => Math.max(0, changed + wait(now) - now),
    /** The server is asked about a palette now; `key` names it, so its second question counts with its first. */
    asked(key: string, now = clock()) {
      const last = asks[asks.length - 1];
      if (last && last.key === key && now - last.at < SAME_MS) return;
      asks.push({ at: now, key });
    }
  };
}
export type Rest = ReturnType<typeof createRest>;
