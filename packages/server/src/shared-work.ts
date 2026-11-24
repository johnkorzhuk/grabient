/* Work an isolate shares between its requests, such as reading a file once for all of them. A promise that waits on a
   request's I/O settles only while that request lasts: once it has answered, or was cancelled when its reader hung
   up, the promise never settles, and every request that awaits it waits for good. On 19 Oct 2026 such waits on
   grabient.com were ended as hung, or held for as long as an hour and a half until their isolate ran out of memory and
   took every request it held with it. So a request never waits on another's work alone: it waits beside a timer of its
   own, and when the timer runs out first, does the work itself. A read that refreshes what an isolate already holds
   waits on no other request at all: while another's read is out, a request answers from what is held (flags.ts, and
   the app's GitHub stars and popular searches).
   Since 16 Nov 2026 the runtime no longer leaves such a wait hanging: it fails it at once, in the words of ENDED. What
   the maker would have done as its work settled never runs either, so the isolate kept that ended promise as the work
   under way, and every request that joined it failed with a 500 until the isolate went (up to 316 answers a day). Such
   a request now does the work itself, as when its timer runs out. */

/** How long a request waits for work another request began before doing it itself: past the usual time of any such
    work (the search snapshot's first read, the longest, gives its store 1.5 s), and short enough that a request whose
    maker went away still answers. */
export const JOIN_WAIT_MS = 5000;

const LATE = Symbol("late");

/** The runtime's words for a promise whose request has ended, so that it can never settle: "This promise was created by
    a request that has since ended, so it can never settle." The work did not fail, its maker went away. */
const ENDED = /request that has since ended/;

/** Whether `error` is the runtime saying that the request that made a promise has ended. */
const ended = (error: unknown): boolean =>
  ENDED.test(String((error as { message?: unknown } | null)?.message ?? error));

/** `work`, which another request may have begun, or else `own()`, this request doing it, when `work` has not settled
    within `ms` or the request that began it has ended. Work that fails of itself fails here too. */
export async function joined<T>(
  work: Promise<T>,
  own: () => Promise<T>,
  ms = JOIN_WAIT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<typeof LATE>(done => {
    timer = setTimeout(() => done(LATE), ms);
  });
  try {
    const first = await Promise.race([work, late]).catch((error: unknown): typeof LATE => {
      if (ended(error)) return LATE;
      throw error;
    });
    return first === LATE ? await own() : first;
  } finally {
    clearTimeout(timer);
  }
}

/** What `make` makes, made once in an isolate for all its requests. A request that comes while it is being made waits
    for it beside a timer of its own (`joined`), and a failure is not kept, so the next request makes it again. */
export function madeOnce<T>(make: () => Promise<T>): () => Promise<T> {
  let made: { value: T } | undefined;
  let making: Promise<T> | undefined;
  const begin = (): Promise<T> => {
    const mine: Promise<T> = Promise.resolve()
      .then(make)
      .then(
        value => {
          made = { value };
          return value;
        },
        error => {
          if (making === mine) making = undefined;
          throw error;
        }
      );
    making = mine;
    return mine;
  };
  const get = (): Promise<T> => {
    if (made) return Promise.resolve(made.value);
    const begun = making;
    // past the wait, the work is begun again only if no other request has begun it again already
    return begun ? joined(begun, () => (making === begun ? begin() : get())) : begin();
  };
  return get;
}
