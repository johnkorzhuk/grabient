import { delocalizePath, localHref } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import { accountPage } from "../lib/links.ts";

/** Whether this page runs inside another site's frame: a frame the browser will not let the page look out of is one.
    False on the server. */
export function framed(): boolean {
  if (isServer) return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** Inside another site's frame an account's page would be refused and its cookies never sent, so it opens in a tab
    of its own. False when it stays here: not framed, not an account's page, or a frame that may not open tabs. */
export function openedOutside(href: string): boolean {
  if (!framed() || !accountPage(delocalizePath(href).path.split(/[?#]/)[0])) return false;
  try {
    /* without noopener, which makes window.open answer null even when the tab opened */
    const tab = window.open(new URL(localHref(href), location.href).href, "_blank");
    if (tab) tab.opener = null;
    return !!tab;
  } catch {
    return false;
  }
}
