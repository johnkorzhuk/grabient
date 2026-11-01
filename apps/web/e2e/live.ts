import type { Page } from "@playwright/test";

/* A page is the app's once its frame is live. The router takes its handoff ($_TSR) away as the app hydrates the
   server's document, and the frame adds its link handler (app/navigation.ts) and its keys as it settles, up to a few
   hundred milliseconds later: a link pressed between the two is a plain link's, a whole page load, and a key does
   nothing. So a test waits for the handler itself, read from Chromium's own list of the document's listeners: of the
   listeners that hear a press as it bubbles, the one whose code navigates. The app marks nothing for the tests. */

/** How long the handler may take to join once the app has hydrated: a cold `vite dev` compiles the frame's modules. */
const SETTLE_MS = 30_000;

/** Waits for the page to answer links and keys as the app does: hydrated, and the frame's link handler in place. */
export async function live(page: Page): Promise<void> {
  await page.waitForFunction(() => !("$_TSR" in window));
  const cdp = await page.context().newCDPSession(page);
  try {
    const until = Date.now() + SETTLE_MS;
    for (;;) {
      const handled = await cdp
        .send("Runtime.evaluate", { expression: "document", objectGroup: "live" })
        .then(({ result }) =>
          cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId ?? "" })
        )
        .then(({ listeners }) =>
          listeners.some(
            l =>
              l.type === "click" &&
              !l.useCapture &&
              /\.navigate\(/.test(l.handler?.description ?? "")
          )
        )
        // a document on its way out has no listeners to read: the next one is read
        .catch(() => false);
      await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "live" }).catch(() => {});
      if (handled) return;
      if (Date.now() > until)
        throw new Error(
          "The frame's link handler (app/navigation.ts) never joined the document: if it no longer calls router.navigate, e2e/live.ts must know it another way"
        );
      await page.waitForTimeout(20);
    }
  } finally {
    await cdp.detach().catch(() => {});
  }
}
