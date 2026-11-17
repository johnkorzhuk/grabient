import type { AnyRouter } from "@tanstack/solid-router";

/** How long a move waits for the frame that shows its press, in a tab that draws none (one in the background). */
const PRESS_DRAWN_MS = 100;

/* once the browser has drawn a frame: a timer set as the frame begins runs after the frame is drawn */
const frameDrawn = () =>
  new Promise<void>(resolve => {
    const late = setTimeout(resolve, PRESS_DRAWN_MS);
    requestAnimationFrame(() =>
      setTimeout(() => {
        clearTimeout(late);
        resolve();
      })
    );
  });

/** Has every move to another page start once the browser has drawn the press that asked for it: a link, a tab, a
    button that leads to a page. A router begins a page inside the press (it asks for the route's code and the page's
    data and tells the frame a page is on its way), which held a phone's answer to the press back by 40 to 75 ms
    (17 Nov 2026, a Pixel 7 at a quarter of its speed: 96 to 144 ms a press, 24 to 72 with the start a frame on). An
    address rewritten in place (`replace`) answers no press and goes at once, unless a move is waiting: it then
    follows the move, so what is asked first is made first. Returns the way back to the router's own. */
export function afterPress(router: AnyRouter): () => void {
  const own = router.navigate;
  let waiting: Promise<void> | null = null;
  const moved: AnyRouter["navigate"] = options => {
    if (!waiting && options.replace) return own(options);
    const ahead = waiting;
    const turn = (async () => {
      await ahead;
      if (!options.replace) await frameDrawn();
    })();
    waiting = turn;
    return turn.then(() => {
      if (waiting === turn) waiting = null;
      return own(options);
    });
  };
  router.navigate = moved;
  return () => {
    if (router.navigate === moved) router.navigate = own;
  };
}
