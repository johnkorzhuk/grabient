import { delocalizePath, LOCALE_COOKIE, type Locale } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import { languagePath } from "../lib/links.ts";

/* The page in another language. A page's language is its address's (/ja/palettes), so a choice is a new document,
   and the cookie the Worker reads before Accept-Language keeps it for the addresses that name none. */

/** Remembers the reader's language for a year. */
export function chooseLanguage(locale: Locale): void {
  try {
    // biome-ignore lint/suspicious/noDocumentCookie: Firefox has no Cookie Store API
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {
    /* a sandboxed frame keeps no cookies: the address still names the language */
  }
}

/** The address the language menu offers for this page in every language, without the language: only the part of the
    query its HTML is kept by, and the home where the page is none. The server reads the request's address; the
    browser reads the address bar, which a page may have rewritten in place since. */
export function pageInEveryLanguage(requested: string, found: boolean): string {
  const here = isServer ? requested : delocalizePath(location.pathname + location.search).path;
  return languagePath(here, found);
}
