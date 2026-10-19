/* Work an isolate shares between its requests, such as reading a file once for all of them. A promise that waits on a
   request's I/O settles only while that request lasts: once it has answered, or was cancelled when its reader hung
   up, the promise never settles, and every request that awaits it waits for good. On 19 Oct 2026 such waits on
   grabient.com were ended as hung, or held for as long as an hour and a half until their isolate ran out of memory and
   took every request it held with it. So a request never waits on another's work alone: it waits beside a timer of its
   own, and when the timer runs out first, does the work itself. A read that refreshes what an isolate already holds
   waits on no other request at all: while another's read is out, a request answers from what is held (flags.ts, and
   the app's GitHub stars and popular searches). */

/** How long a request waits for work another request began before doing it itself: past the usual time of any such
    work (the search snapshot's first read, the longest, gives its store 1.5 s), and short enough that a request whose
    maker went away still answers. */
export const JOIN_WAIT_MS = 5000;

const LATE = Symbol("late");

/** `work`, which another request may have begun, or else `own()`, this request doing it, when `work` has not settled
    within `ms`. */
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
    const first = await Promise.race([work, late]);
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
