/* A palette's page while the editor's code loads. The server sends the static page, for crawlers and for readers
   without JavaScript. A reader with JavaScript never sees it: the script below, which the page carries before the
   static page, marks <html> as booting, and while the mark stands the page's styles hide the static page and show
   what the editor will draw first (Boot.tsx). The mark says how the side stands, open or away as the reader left it
   (Editor.tsx keeps that choice), and `bare` where the address opens the selection's screen, which nothing can draw
   before the editor. The mark goes when an editor has mounted, and also when a script throws, when a module fails to
   load or after ten seconds, so a page whose editor cannot come is the static page, whole. */

declare global {
  interface Window {
    /** ends the boot: set by the script while its mark stands */
    __seedBoot?: () => void;
  }
}

/** The mark on <html> while a palette's page boots. */
export const BOOT_MARK = "data-seed-boot";

/** The script, run as the document is read: on a navigation in the browser it is drawn and never run. */
export const BOOT_SCRIPT = `(function(r){var t,v="";function end(){clearTimeout(t);removeEventListener("error",failed,true);r.removeAttribute("${BOOT_MARK}");delete window.__seedBoot}function failed(e){if(e instanceof ErrorEvent||e.target instanceof HTMLScriptElement&&e.target.type==="module")end()}try{if(localStorage.getItem("grabient-panel")==="0")v="away"}catch(e){}if(/[?&]selection(=|&|$)/.test(location.search))v="bare";r.setAttribute("${BOOT_MARK}",v);window.__seedBoot=end;addEventListener("error",failed,true);t=setTimeout(end,1e4)})(document.documentElement)`;

/* The static page's elements as the browser first drew them, for the page they show (its key), while the page boots. */
let kept: { key: string; nodes: unknown } | undefined;

/** An editor stands, or none will: the mark goes, and with it the static page's elements kept for it. */
export const endBoot = (): void => {
  kept = undefined;
  window.__seedBoot?.();
};

/** Whether the page draws the editor's first screen while its code loads, its stops along the screen's foot as the
    editor's will be. False on the server. */
export const booting = (): boolean =>
  typeof document !== "undefined" && document.documentElement.hasAttribute(BOOT_MARK);

/** Runs `then` once the page no longer boots, however its boot ends: at once on a page that is not booting. */
export function afterBoot(then: () => void): void {
  if (!booting()) {
    then();
    return;
  }
  const watch = new MutationObserver(() => {
    if (booting()) return;
    watch.disconnect();
    then();
  });
  watch.observe(document.documentElement, { attributes: true, attributeFilter: [BOOT_MARK] });
}

/** The static page drawn once while the page boots. The browser draws it up to three times before the editor takes its
    place, the same each time: as it hydrates the server's (the router's pending page), again once hydrated (the
    match's pending page, while its loader runs) and as the editor's code comes (the route's Loading). Each draw would
    put new elements where the last stood, and the first screen's picture, the glass's still a filter over all of it,
    would be drawn again whole: a second and more of the browser's raster work where it draws on its processor
    (Lighthouse's), all of it before the editor can draw. While the mark stands, a later draw of the page `key` names
    takes the elements the first one made, which the browser then never draws again. Outside the boot, and on the
    server, each draw makes its own. */
export function bootOnce<T>(key: string, make: () => T): T {
  if (!booting()) {
    kept = undefined;
    return make();
  }
  if (kept?.key === key) return kept.nodes as T;
  const nodes = make();
  kept = { key, nodes };
  return nodes;
}
