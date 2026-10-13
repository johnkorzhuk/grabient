import { isPagePath } from "@grabient/i18n";

/* Addresses as both sides read them. The app routes and links by addresses without the language: the router puts the
   reader's on every <Link> and navigation, and `localHref` from @grabient/i18n on a plain <a>. */

const ACCOUNT_PAGES = new Set([
  "/login",
  "/login/password",
  "/connect",
  "/settings",
  "/unsubscribe",
  "/saved",
  "/palettes/saved",
  "/e",
  "/collections/saved"
]);

/** An account's own pages (a path without the language): no other site may frame them, and inside another site's
    frame they open in a tab of their own. */
export const accountPage = (path: string) =>
  ACCOUNT_PAGES.has(path) || path.startsWith("/e/") || path.startsWith("/unsubscribe/");

/** Campaign tags and click ids say where a reader came from, never what a page is: no address is read with them, no
    cache key holds them, and every redirect carries them on to the page where analytics reads them. */
export const TRACKING_PARAM =
  /^(?:utm_[a-z_]{1,20}|gclid|gbraid|wbraid|dclid|fbclid|msclkid|ttclid|twclid|li_fat_id|igshid|mc_cid|mc_eid|_ga|_gl|ref)$/i;

/** Pages whose query changes nothing the server draws. */
export const FIXED_PAGES = new Set([
  "/about",
  "/privacy",
  "/terms",
  "/contact",
  "/bindings",
  "/mcp-server",
  "/newsletter"
]);
/** The selection and an editor's locks live in the browser: the server draws a page the same with or without them. */
export const BROWSER_ONLY = ["selection", "lock", "unlock"];

/** The address the language menu offers for this page in every language: the page with only the query its HTML is kept
    by, so one reader's query never reaches a menu the cache serves to others. The consent page keeps the request an
    app made, sign-in keeps where it leads, and an address that is no page, or that the site does not know, is the home. */
export function languagePath(pathAndSearch: string, found = true): string {
  if (!found || !isPagePath(pathAndSearch)) return "/";
  const url = new URL(pathAndSearch, "https://grabient.invalid");
  const path = url.pathname;
  if (path === "/connect") return pathAndSearch;
  if (path === "/login") {
    const to = url.searchParams.get("redirect");
    return to ? `/login?redirect=${encodeURIComponent(to)}` : path;
  }
  if (
    FIXED_PAGES.has(path) ||
    path === "/settings" ||
    path === "/unsubscribe" ||
    path.startsWith("/unsubscribe/")
  ) {
    return path;
  }
  for (const name of BROWSER_ONLY) url.searchParams.delete(name);
  return path + url.search;
}
