import { createSignal } from "solid-js";
import { PAGES, type Page, pageAt } from "./contents.ts";

/* Three pages on real addresses, so a link or a reload lands on the same view. A press on a link to another page of
   the document swaps the page in place, so the header and its bar carry on; a link to a section of the page on screen
   is the browser's own. Any other address is the cover's. */
export function createRouter() {
  const [path, setPath] = createSignal(location.pathname);
  const page = (): Page => pageAt(path()) ?? PAGES[0];

  /* the section a hash names, once the page has drawn it; the top of the page without one */
  const land = () =>
    requestAnimationFrame(() => {
      const id = decodeURIComponent(location.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      if (target) target.scrollIntoView({ block: "start" });
      else if (!id) scrollTo({ top: 0 });
    });

  const go = (to: string) => {
    history.pushState(null, "", to);
    setPath(location.pathname);
    land();
  };

  /** Follows presses on the document's own links and the browser's back and forward, until the returned function is
      called. */
  const install = (): (() => void) => {
    if (!pageAt(location.pathname)) history.replaceState(null, "", `/${location.hash}`);
    setPath(location.pathname);
    if (location.hash) land();
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const link = (e.target as Element | null)?.closest("a");
      if (!link?.href || link.target || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || !pageAt(url.pathname)) return;
      if (url.pathname === location.pathname && url.hash) return;
      e.preventDefault();
      go(url.pathname + url.hash);
    };
    const onPop = () => {
      setPath(location.pathname);
      land();
    };
    document.addEventListener("click", onClick);
    addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick);
      removeEventListener("popstate", onPop);
    };
  };

  return { page, go, install };
}
