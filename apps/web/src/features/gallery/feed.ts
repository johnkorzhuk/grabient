import type { AnyRouter } from "@tanstack/solid-router";
import { createMemo, createSignal, onSettled, untrack } from "solid-js";
import { type Failed, failed } from "./queries.ts";

/* A feed: the address's own page, then each page after it that joins beneath it as the reader nears the end, while
   the address stays the same. The pages come from the query cache, so a feed returned to stands as deep as it was left,
   from memory. A page that fails says why and waits for Retry: the mark at the end, still in view, never asks again. */

export interface FeedPage {
  page: number;
  totalPages: number;
}

/** How many pages joined each feed the reader left, by its key: what a return restores. Kept in this tab, the oldest
    let go first. */
const reached = new Map<string, number>();
const REACHED_KEPT = 64;

/** The cards a page starts with live: a desktop's first row, and more than a phone's first screen. Each costs its
    reading and drawing while the page starts; the rest of what the server drew stands still until the reader moves. */
export const FIRST_SCREEN = 4;

/** How far ahead of the end a page is asked for: a screen and more, so it lands before the reader gets there. */
const AHEAD = "0px 0px 1200px 0px";

export function createFeed<P extends FeedPage>(o: {
  /** the list's identity: the pages that joined belong to it */
  key: () => string;
  start: () => number;
  /** the address's own page as it stands, or the reason it could not be read; none while it is not the feed's to
      continue */
  head: () => P | Failed | undefined;
  /** a page the cache holds now */
  kept: (n: number) => P | undefined;
  read: (n: number) => Promise<P | Failed>;
}) {
  const restore = (): P[] => {
    const key = o.key();
    const out: P[] = [];
    for (let n = 1; n <= (reached.get(key) ?? 0); n++) {
      const page = o.kept(o.start() + n);
      if (!page) break;
      out.push(page);
    }
    return out;
  };
  /* The pages that joined, for the list the address names now: another list starts from what was kept of it. They are
     read again only when the list or its first page changes, so the same list in another view keeps the pages it has,
     which the cache may have let go of since. */
  const origin = createMemo(() => `${o.start()} ${o.key()}`);
  const [joined, setJoined] = createSignal(() => {
    origin();
    return untrack(restore);
  });
  const [asking, setAsking] = createSignal<{ key: string; reason?: string } | null>(null);
  const ask = () => {
    const now = asking();
    return now && now.key === o.key() ? now : null;
  };

  const last = (): P | Failed | undefined => joined().at(-1) ?? o.head();
  const more = () => {
    const end = last();
    return !!end && !failed(end) && end.page < end.totalPages;
  };

  /** The next page, as the reader nears the end; again after a failure only when `retry` says so. Says whether a
      page joined. */
  async function next(retry = false): Promise<boolean> {
    const key = o.key();
    const now = ask();
    if (!more() || (now && (!now.reason || !retry))) return false;
    const n = (last() as P).page + 1;
    setAsking({ key });
    const page = await o.read(n);
    if (o.key() !== key) return false;
    if (failed(page)) {
      setAsking({ key, reason: page.failed });
      return false;
    }
    setAsking(null);
    setJoined(pages => [...pages, page]);
    reached.delete(key);
    reached.set(key, n - o.start());
    if (reached.size > REACHED_KEPT) reached.delete(reached.keys().next().value!);
    return true;
  }

  /* the mark under the feed is watched from a screen away; after a page joins it is looked at again, since a short
     page may leave it in view */
  let mark: HTMLElement | undefined;
  let watcher: IntersectionObserver | undefined;
  const look = () => {
    if (watcher && mark) {
      watcher.unobserve(mark);
      watcher.observe(mark);
    }
  };
  /* The keyboard in what stands past the feed, the footer: a page joining would push it out of view, so the feed waits
     until the keyboard comes back up into it, and a group drawn at its own height as the window reaches it leaves the
     focus in view. */
  let held = false;
  const past = () => {
    const at = document.activeElement;
    return (
      !!mark && !!at && !!(mark.compareDocumentPosition(at) & Node.DOCUMENT_POSITION_FOLLOWING)
    );
  };
  onSettled(() => {
    watcher = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        held = past();
        if (held) return;
        void next().then(joined => {
          if (joined) look();
        });
      },
      { rootMargin: AHEAD }
    );
    if (mark) watcher.observe(mark);
    const back = () => {
      if (held && !past()) {
        held = false;
        look();
      }
    };
    document.addEventListener("focusin", back);
    const grown = new ResizeObserver(() => {
      if (!past()) return;
      const at = document.activeElement as HTMLElement;
      const box = at.getBoundingClientRect();
      if (box.top < 0 || box.bottom > innerHeight) at.scrollIntoView({ block: "nearest" });
    });
    grown.observe(document.documentElement);
    return () => {
      watcher?.disconnect();
      grown.disconnect();
      document.removeEventListener("focusin", back);
    };
  });

  return {
    /** the pages after the address's own */
    joined,
    /** the feed has pages still to come */
    more,
    /** a page is on its way */
    loading: () => !!ask() && !ask()!.reason,
    /** why the last page asked for did not come */
    reason: () => ask()?.reason ?? "",
    next,
    /** the mark the next page waits on */
    mark: (el: HTMLElement) => {
      if (watcher && mark) watcher.unobserve(mark);
      mark = el;
      watcher?.observe(el);
    }
  };
}

/** A plain left press on a link the page answers in place; any other press follows the link. */
export const inPlace = (e: MouseEvent, answer: () => void) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  answer();
};

/** A More press answered in place: the next page joins, and a reader whose focus left with the press goes on at the
    first of what joined (`items`: its cards, or its collections), where one long list would have led the next Tab. */
export async function joinNext(next: () => Promise<boolean>, items: string): Promise<void> {
  const before = document.querySelectorAll(items).length;
  if (!(await next())) return;
  requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    document
      .querySelectorAll(items)
      [before]?.querySelector<HTMLElement>("a[href], button")
      ?.focus();
  });
}

/** Asks for what a press on this address would show, so the press lands as a swap. */
export function preloadHref(router: AnyRouter, href: string): void {
  const url = new URL(href, "https://grabient.invalid");
  void router
    .preloadRoute({ to: url.pathname, search: router.options.parseSearch(url.search) } as never)
    .catch(() => {});
}
