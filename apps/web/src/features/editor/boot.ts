/* A palette's page while the editor's code loads. The server sends the static page, for crawlers and for readers
   without JavaScript. A reader with JavaScript never sees it: the script below, which the page carries before the
   static page, marks <html> as booting, and the page's styles hide the static page while the mark stands. The mark
   goes when an editor has mounted, and also when a script throws, when a module fails to load or after ten seconds,
   so a page whose editor cannot come is the static page, whole. */

declare global {
  interface Window {
    /** ends the boot: set by the script while its mark stands */
    __seedBoot?: () => void;
  }
}

/** The mark on <html> while a palette's page boots. */
export const BOOT_MARK = "data-seed-boot";

/** The script, run as the document is read: on a navigation in the browser it is drawn and never run. */
export const BOOT_SCRIPT = `(function(r){var t;function end(){clearTimeout(t);removeEventListener("error",failed,true);r.removeAttribute("${BOOT_MARK}");delete window.__seedBoot}function failed(e){if(e instanceof ErrorEvent||e.target instanceof HTMLScriptElement&&e.target.type==="module")end()}r.setAttribute("${BOOT_MARK}","");window.__seedBoot=end;addEventListener("error",failed,true);t=setTimeout(end,1e4)})(document.documentElement)`;

/** An editor stands, or none will: the mark goes. */
export const endBoot = (): void => window.__seedBoot?.();
