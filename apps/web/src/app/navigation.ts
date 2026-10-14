import { delocalizePath, isPagePath } from "@grabient/i18n";
import { announce } from "@grabient/ui/announce.ts";
import { focusMain } from "@grabient/ui/SkipLink.tsx";
import type { AnyRouter, HistoryLocation } from "@tanstack/solid-router";
import { pageKey, trackPageView } from "../features/analytics/analytics.ts";
import { landView } from "../features/list/appearance.ts";
import { openedOutside } from "./framed.ts";
import { forgetUndoFrom, landUndo } from "./undo.ts";

/* What the frame does as the reader moves between pages, in the browser.

   A press on a plain link to one of the site's pages is the app's own navigation, as a <Link> is: the design system
   draws plain links with the address they are given. A press the browser means for something else goes to it: another
   button or a modifier key, a link with a target or a download, another site, a file or an API, an old grabient.com id
   (the server reads those), and a link to another language (hreflang), which loads its document.

   After a page is pushed, or reached by Back or Forward, focus moves to the new page's main content when the control
   that held it left with the old page, and a screen reader is told the new page's title once the page has set it. An
   address rewritten in place moves and says nothing. Each entry keeps its own undo and what the tab remembered of the
   reader's view when it was left, and each page reached is counted once (analytics), whatever its palettes are edited
   into or drawn in. */

/** How long a page has to set its title before it is announced. */
const LANDED_MS = 120;
/** A history entry the selection was opened in, over the page beneath it. */
export const SELECTION_MARK = "selection";

/** Rewrites the page's address in place without the route taking it: a value still being set (a view or a size
    being dragged), which the route takes once it rests. The router hears of every write made through the history
    object, whose methods it wraps, so this one is made with the browser's own. */
export const rewriteQuietly = (href: string): void =>
  History.prototype.replaceState.call(history, history.state, "", href);

/** Rewrites the page's address in place and has the route take it, the entry staying itself: the router keeps the
    depth a page was left at by the entry's key, which a navigation that replaces makes anew. */
export const rewriteInPlace = (href: string): void => history.replaceState(history.state, "", href);

/** The router's ways in: link presses, landings and their undo. Returns the way out. */
export function watchNavigation(router: AnyRouter): () => void {
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    const a = (e.target as Element | null)?.closest?.("a[href]");
    if (!(a instanceof HTMLAnchorElement)) return;
    if (a.target || a.hasAttribute("download") || a.hasAttribute("hreflang")) return;
    const href = a.getAttribute("href") ?? "";
    if (!isPagePath(href) || /^\/[_~]/.test(delocalizePath(href).path)) return;
    e.preventDefault();
    if (openedOutside(href)) return;
    void router.navigate({ href });
  };
  document.addEventListener("click", onClick);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const land = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!document.activeElement || document.activeElement === document.body) focusMain();
      announce(document.title);
    }, LANDED_MS);
  };
  const entryOf = (location: HistoryLocation) => {
    const state = location.state as { __TSR_index?: number; mark?: unknown };
    const at = state.__TSR_index ?? 0;
    return state.mark === SELECTION_MARK ? at - 1 : at;
  };
  const placeOf = (location: HistoryLocation) => location.state.__TSR_index ?? 0;
  landUndo(entryOf(router.history.location));
  landView(placeOf(router.history.location));
  let moved = false;
  const leaveHistory = router.history.subscribe(
    ({ location, action }: { location: HistoryLocation; action: { type: string } }) => {
      const pushed = action.type === "PUSH";
      if (pushed) forgetUndoFrom(placeOf(location));
      landUndo(entryOf(location));
      const replaced = action.type === "REPLACE";
      // a page rewritten in place as it lands has still landed
      if (!replaced) moved = true;
      landView(placeOf(location), pushed ? "pushed" : replaced ? undefined : "returned");
    }
  );
  /* a page is counted by the address it was reached at: one rewritten in place on the same route (an edit, a change of
     view) keeps it, and only new words make a new page there */
  let reached = { route: "", path: "" };
  const count = (arrived: boolean) => {
    const route = router.state.matches.at(-1)?.routeId ?? "";
    if (arrived || route !== reached.route) reached = { route, path: location.pathname };
    trackPageView(pageKey(reached.path, location.search));
  };
  count(true);
  const leaveResolved = router.subscribe("onResolved", () => {
    count(moved);
    if (moved) land();
    moved = false;
  });
  return () => {
    document.removeEventListener("click", onClick);
    clearTimeout(timer);
    leaveHistory();
    leaveResolved();
  };
}
