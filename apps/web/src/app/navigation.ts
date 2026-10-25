import { delocalizePath, isPagePath, t } from "@grabient/i18n";
import { announce } from "@grabient/ui/announce.ts";
import { focusMain, landFocus } from "@grabient/ui/SkipLink.tsx";
import { type AnyRouter, type HistoryLocation, useRouterState } from "@tanstack/solid-router";
import { createSignal, untrack } from "solid-js";
import { landView } from "../features/list/appearance.ts";
import { openedOutside } from "./framed.ts";
import { goThrough } from "./go.ts";
import { forgetUndoFrom, landUndo } from "./undo.ts";

/* What the frame does as the reader moves between pages, in the browser.

   A press on a plain link to one of the site's pages is the app's own navigation, as a <Link> is: the design system
   draws plain links with the address they are given. A press the browser means for something else goes to it: another
   button or a modifier key, a link with a target or a download, another site, a file or an API, an old grabient.com id
   (the server reads those), and a link to another language (hreflang), which loads its document.

   After a page is pushed, or reached by Back or Forward, focus moves to the new page's main content when the control
   that held it left with the old page, and a screen reader is told the new page's title once the page has set it. An
   address rewritten in place moves and says nothing. Each entry keeps its own undo and what the tab remembered of the
   reader's view when it was left. */

/** How long a page has to set its title before it is announced. */
const LANDED_MS = 120;
/** How long a history write the browser refused waits before the latest is written. */
const REFUSED_MS = 1000;
/** A page that stopped loads whole once in this long at most; the tab notes when in sessionStorage. */
const RELOADS_APART_MS = 10_000;
const RELOADED = "grabient-reloaded";
/** A history entry the selection was opened in, over the page beneath it. */
export const SELECTION_MARK = "selection";

/* the address without the selection's word: what a list beneath it draws */
const beneath = (search: Record<string, unknown>) => {
  const { selection: _, ...rest } = search;
  return JSON.stringify(rest);
};
/** Whether the router is on its way to another page or another list: a turn into the selection or out of it leaves the
    list beneath as it stands, so it is none. */
export const useNavigating = () =>
  useRouterState({
    select: state =>
      state.status === "pending" &&
      !(
        state.resolvedLocation?.pathname === state.location.pathname &&
        beneath(state.resolvedLocation.search) === beneath(state.location.search)
      )
  });

/** Rewrites the page's address in place without the route taking it: a value still being set (a view or a size
    being dragged), which the route takes once it rests. The router hears of every write made through the history
    object, whose methods it wraps, so this one is made with the browser's own. */
export const rewriteQuietly = (href: string): void =>
  History.prototype.replaceState.call(history, history.state, "", href);

/** Rewrites the page's address in place and has the route take it, the entry staying itself: the router keeps the
    depth a page was left at by the entry's key, which a navigation that replaces makes anew. */
export const rewriteInPlace = (href: string): void => history.replaceState(history.state, "", href);

/* Solid stops for good once an error escapes every boundary: the page looks alive, nothing on it updates, and the
   window hears the error. A write that never lands says so. The page then loads whole, once, at the address it stands
   at; one that stops again within ten seconds is left as it is, and every page it is asked for loads whole. */
let stopped = false;
const [pulse, setPulse] = createSignal(0);
function checkPulse(): void {
  if (stopped) return;
  const beat = untrack(pulse) + 1;
  setPulse(beat);
  // Solid applies a write on a microtask it queues at the write: two microtasks on, it has landed or never will
  queueMicrotask(() =>
    queueMicrotask(() => {
      if (stopped || untrack(pulse) === beat) return;
      stopped = true;
      try {
        if (Date.now() - Number(sessionStorage.getItem(RELOADED)) < RELOADS_APART_MS) return;
        sessionStorage.setItem(RELOADED, String(Date.now()));
      } catch {
        return; // with no note of the last reload, a run of them is never ruled out: the next page loads whole
      }
      location.reload();
    })
  );
}
/** Checks in a turn of its own, once the updates that could fail have run. */
const watchPulse = () => void setTimeout(checkPulse);

type HistoryWrite = Parameters<History["pushState"]>;
/** Guards the way between pages from the start, before the router wraps the history's methods. Past a browser's rate
    (Safari's is 100 in 30 seconds) a history write throws, and the router would then never write the address again: a
    refused write waits, and the latest lands a second after the last refusal, as a push if any of the waiting ones
    was. A page that stopped (above) loads whole whatever it is asked for, Back and Forward included. */
export function guardNavigation(): void {
  const own = { push: History.prototype.pushState, replace: History.prototype.replaceState };
  let waiting: { push: boolean; args: HistoryWrite } | null = null;
  const write = (target: History, push: boolean, args: HistoryWrite) => {
    const to = args[2];
    if (stopped && to != null) {
      const href = new URL(to, location.href).href;
      return push ? location.assign(href) : location.replace(href);
    }
    if (waiting) {
      waiting = { push: waiting.push || push, args };
      return;
    }
    try {
      (push ? own.push : own.replace).apply(target, args);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "SecurityError")) throw error;
      waiting = { push, args };
      setTimeout(() => {
        const latest = waiting;
        waiting = null;
        if (latest) write(target, latest.push, latest.args);
      }, REFUSED_MS);
    }
  };
  History.prototype.pushState = function (...args: HistoryWrite) {
    write(this, true, args);
  };
  History.prototype.replaceState = function (...args: HistoryWrite) {
    write(this, false, args);
  };
  addEventListener("popstate", () => {
    if (stopped) location.reload();
  });
  addEventListener("error", watchPulse);
}

/* an address to a part of its page (Settings' #account) lands the keyboard on that part */
function focusPart(hash: string): boolean {
  let id = hash.replace(/^#/, "");
  try {
    id = decodeURIComponent(id);
  } catch {
    /* the hash as written */
  }
  const part = id ? document.getElementById(id) : null;
  return !!part && landFocus(part);
}

const shown = (selector: string) =>
  [...document.querySelectorAll<HTMLElement>(selector)].find(el => el.offsetParent !== null) ??
  null;

/** The router's ways in: link presses, landings and their undo. Returns the way out. */
export function watchNavigation(router: AnyRouter): () => void {
  const stopGoing = goThrough(router);
  const placeOf = (location: HistoryLocation) => location.state.__TSR_index ?? 0;
  /* the link a page was left by, by its entry: Back lands the focus on it again, at the depth the reader left */
  const leftBy = new Map<number, string>();
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
  /* noted as it is pressed, whatever answers the press: a card's Edit answers its own */
  const noteLink = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.("main a[href]");
    if (a && e.button === 0)
      leftBy.set(placeOf(router.history.location), a.getAttribute("href") ?? "");
  };
  document.addEventListener("click", noteLink, true);

  let timer: ReturnType<typeof setTimeout> | undefined;
  /* where the focus lands with a page: the selection's Close over it, the link the reader left by (a card's presses
     come a moment after its list), or the page */
  const inSelection = () =>
    (router.history.location.state as { mark?: unknown }).mark === SELECTION_MARK;
  const focusLanding = (tries = 20) => {
    const location = router.history.location;
    const left = leftBy.get(placeOf(location));
    const selection = inSelection();
    const target = selection
      ? shown(`aside button[aria-label="${CSS.escape(t("Close selection"))}"]`)
      : left
        ? shown(`main a[href="${CSS.escape(left)}"]`)
        : null;
    if (target) target.focus({ preventScroll: true });
    else if ((selection || left) && tries > 0)
      timer = setTimeout(() => {
        if (!document.activeElement || document.activeElement === document.body)
          focusLanding(tries - 1);
      }, 50);
    else if (!focusPart(location.hash)) focusMain();
  };
  /* the selection keeps the title of the page it stands over, so it is told by its own name */
  const land = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!document.activeElement || document.activeElement === document.body) focusLanding();
      announce(inSelection() ? t("Selection") : document.title);
    }, LANDED_MS);
  };
  const entryOf = (location: HistoryLocation) => {
    const state = location.state as { __TSR_index?: number; mark?: unknown };
    const at = state.__TSR_index ?? 0;
    return state.mark === SELECTION_MARK ? at - 1 : at;
  };
  landUndo(entryOf(router.history.location));
  landView(placeOf(router.history.location));
  let moved = false;
  const leaveHistory = router.history.subscribe(
    ({ location, action }: { location: HistoryLocation; action: { type: string } }) => {
      const pushed = action.type === "PUSH";
      if (pushed) {
        forgetUndoFrom(placeOf(location));
        for (const at of leftBy.keys()) if (at >= placeOf(location)) leftBy.delete(at);
      }
      landUndo(entryOf(location));
      const replaced = action.type === "REPLACE";
      // a page rewritten in place as it lands has still landed
      if (!replaced) moved = true;
      landView(placeOf(location), pushed ? "pushed" : replaced ? undefined : "returned");
    }
  );
  const leaveResolved = router.subscribe("onResolved", () => {
    watchPulse();
    /* an address reached in the app that no page here answers loads whole: the Worker leads an old form of an address
       to its page (/saved, /newest, a slug's case), and answers the rest with its own 404 */
    if (moved && router.state.matches.some(m => m.status === "notFound" || m._notFound))
      return location.reload();
    if (moved) land();
    moved = false;
  });
  return () => {
    stopGoing();
    document.removeEventListener("click", onClick);
    document.removeEventListener("click", noteLink, true);
    clearTimeout(timer);
    leaveHistory();
    leaveResolved();
  };
}
