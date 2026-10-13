import { delocalizePath } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import { createSignal } from "solid-js";
import { account } from "../features/account/session.ts";

/* Whether the site can be reached, for the ways a page offers. With no connection every link and control keeps its
   place, and the ones whose page needs the server are disabled, so nothing moves; the header says Offline. The browser
   says so, or a page the service worker answered from its kept copy (`Server-Timing: offline`), or a feature that
   could not reach the server (the account's sync). It reads online on both sides until the page is live, so a page
   hydrates as the server drew it. Browser only past that. */

const [live, setLive] = createSignal(false);
const [browserOffline, setBrowserOffline] = createSignal(false);
const [unreached, setUnreached] = createSignal(false);

/** No connection: the page offers only what opens without the server. */
export const offline = (): boolean => live() && (browserOffline() || unreached());

/** A feature reached the server or could not. */
export function reached(ok: boolean): void {
  if (!isServer) setUnreached(!ok);
}

let installed = false;
/** Follows the connection once the page is live. A page answered from the kept copy asks the Worker every few
    seconds, and on the browser's own signs, until it answers. */
export function watchConnection(): void {
  if (isServer || installed) return;
  installed = true;
  setLive(true);
  setBrowserOffline(!navigator.onLine);
  window.addEventListener("online", () => setBrowserOffline(false));
  window.addEventListener("offline", () => setBrowserOffline(true));
  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  if (!entry?.serverTiming?.some(timing => timing.name === "offline")) return;
  setUnreached(true);
  const ask = () => {
    fetch("/api/build", { cache: "no-store", credentials: "omit" }).then(
      () => {
        setUnreached(false);
        clearInterval(timer);
        window.removeEventListener("online", ask);
        window.removeEventListener("focus", ask);
      },
      () => {}
    );
  };
  const timer = setInterval(ask, 5_000);
  window.addEventListener("online", ask);
  window.addEventListener("focus", ask);
}

/** Pages whose words are in the code, which open with no connection: a palette's too, which the browser draws. */
const IN_THE_CODE = /^\/(about|settings|bindings|privacy|terms)$|^\/k[A-Za-z0-9_-]{8,49}$/;
/** The account's own lists, which open from its copy in this browser. */
const THE_ACCOUNTS = /^\/(palettes|collections)\/saved$/;

/** Whether the page at an address opens with no connection. Another site's never does. */
export function opensOffline(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  const path = delocalizePath(href).path.split(/[?#]/)[0];
  return IN_THE_CODE.test(path) || (!!account() && THE_ACCOUNTS.test(path));
}

/** Whether a link leads nowhere now: offline, to a page that needs the server. */
export const unreachable = (href: string | undefined): boolean =>
  offline() && !(href && opensOffline(href));

/** The links a page shows, each in its place: disabled while offline when its page needs the server. */
export const marked = <T extends { href?: string; disabled?: boolean }>(
  links: readonly T[]
): T[] =>
  offline()
    ? links.map(link => (unreachable(link.href) ? { ...link, disabled: true } : link))
    : [...links];
