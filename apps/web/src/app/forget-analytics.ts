import { isServer } from "@solidjs/web";

/* What the site's analytics kept in a reader's browser until it stopped in October 2026, cleared once a page has
   started: the consent record, the first visit's cookie and a sign-in's marker, and what Google Analytics (through
   Zaraz) and PostHog kept of their own. Visits are counted on the server now, with nothing in the browser, so none of
   it comes back (the privacy policy's cookies). Browser only. */

const COOKIES = /^(?:gb_attr|_ga(?:_\w+)?|_gid|ph_\w+|_?cfzs?_[\w-]+|zaraz[\w-]*)$/;
const KEYS =
  /^(?:consent-preferences|gb_login|gb_su_[\w-]+|_?_?ph_[\w$-]+|_?cfzs?_[\w-]+|_?zaraz[\w-]*)$/;

export function forgetOldAnalytics(): void {
  if (isServer) return;
  try {
    const names = document.cookie
      .split(";")
      .map(cookie => cookie.trim().split("=")[0] ?? "")
      .filter(name => COOKIES.test(name));
    const bare = location.hostname.replace(/^www\./, "");
    for (const name of names) {
      for (const domain of ["", `; domain=${location.hostname}`, `; domain=.${bare}`]) {
        // biome-ignore lint/suspicious/noDocumentCookie: Firefox has no Cookie Store API
        document.cookie = `${name}=; Path=/; Max-Age=0${domain}`;
      }
    }
    for (const store of [localStorage, sessionStorage]) {
      for (const key of Object.keys(store)) if (KEYS.test(key)) store.removeItem(key);
    }
  } catch {
    // a browser that keeps nothing has nothing to clear
  }
}
