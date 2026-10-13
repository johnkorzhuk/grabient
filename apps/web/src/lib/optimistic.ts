/* A press that sets something the server keeps (a flag, the newsletter switch, a fit vote, who sees a collection)
   shows at once, and its write follows. Each write sets the state it sends, so a repeat changes nothing and only the
   order can go wrong. A key has one write out at a time: presses made meanwhile change what is wanted and share the
   write's promise, and when the write returns, the last press is sent if the server does not hold it yet. A failure
   draws what the server last held and rejects every press it carried.

   Solid's own optimistic actions hold other writes to the same state until one lands, so a failed press would stand
   until another lands, and two quick presses could reach the server in either order. The account's likes and its
   collections have their own copy and outbox (features/account/sync.ts). */

export interface OptimisticWrites<V, H> {
  /** The reader asked for `value`. `held` is what the server holds as the page knows it; a key with a write out keeps
      what its own answers said. Resolves once the server holds the last press. */
  set(key: string, held: H, value: V): Promise<void>;
  /** A write for the key is out: the page shows a press the server may not hold yet. */
  pending(key: string): boolean;
}

export function createOptimisticWrites<V, H>(options: {
  /** the value a state the server holds stands for */
  valueOf: (held: H) => V;
  /** draws the value on the page beside what the server holds, for whatever follows from both (a count) */
  show: (key: string, value: V, held: H) => void;
  /** writes the value; resolves with what the server holds once it is written */
  send: (key: string, value: V, held: H) => Promise<H>;
  /** false once the writes no longer belong to the page (another account signed in): an answer then draws nothing
      and sends nothing more, and a failure is not the page's to say */
  live?: () => boolean;
}): OptimisticWrites<V, H> {
  const out = new Map<string, { held: H; wanted: V; work: Promise<void> }>();
  const gone = () => options.live?.() === false;
  return {
    set(key, held, value) {
      const running = out.get(key);
      if (running) {
        running.wanted = value;
        options.show(key, value, running.held);
        return running.work;
      }
      const write = { held, wanted: value, work: Promise.resolve() };
      out.set(key, write);
      options.show(key, value, held);
      write.work = (async () => {
        try {
          while (options.valueOf(write.held) !== write.wanted) {
            const answer = await options.send(key, write.wanted, write.held);
            if (gone()) return;
            write.held = answer;
            options.show(key, write.wanted, write.held);
          }
        } catch (reason) {
          if (gone()) return;
          options.show(key, options.valueOf(write.held), write.held);
          throw reason;
        } finally {
          out.delete(key);
        }
      })();
      return write.work;
    },
    pending: key => out.has(key)
  };
}
