import { delocalizePath } from "@grabient/i18n";

/** A plain press of a link to this site swaps the page in place, as the router's own links do; a press with a key held,
    another button, or a link elsewhere is the browser's. The link stays a link for new tabs and for readers without
    scripts. */
export function followInPlace(e: MouseEvent, go: (href: string) => void): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return;
  const link = (e.target as Element | null)?.closest?.("a[href]");
  if (!link || link.hasAttribute("target") || link.hasAttribute("download")) return;
  const url = new URL(link.getAttribute("href") ?? "", location.href);
  if (url.origin !== location.origin) return;
  e.preventDefault();
  go(delocalizePath(url.pathname).path + url.search);
}
