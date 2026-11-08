/* A still drawn a share at a time behind another site's page, as a list's cards share a frame (FxArt.tsx): the
   papercut's cuts and the strings' threads take some tens of milliseconds to trace on a desktop and four times that on
   a phone, which in one task would hold the page as it loads. */

/** How long a share of the still's drawing holds the page's thread. */
const SHARE_MS = 6;

/* the page's thread given back for a moment: a message to itself, which no timer's clamp delays */
const handBack = (): Promise<void> =>
  new Promise(resolve => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(null);
  });

/** The steps taken a share at a time, the thread handed back between shares. */
export async function inShares<T>(steps: Generator<void, T>): Promise<T> {
  for (let end = performance.now() + SHARE_MS; ; ) {
    const step = steps.next();
    if (step.done) return step.value;
    if (performance.now() > end) {
      await handBack();
      end = performance.now() + SHARE_MS;
    }
  }
}
