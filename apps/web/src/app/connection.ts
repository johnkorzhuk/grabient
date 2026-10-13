import { decodePalette } from "@grabient/engine";
import { delocalizePath } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import { onlineManager } from "@tanstack/solid-query";
import { createSignal } from "solid-js";
import { account } from "../features/account/session.ts";
import {
  accountView,
  hintedCollection,
  patchStatus,
  syncStatus
} from "../features/account/state.ts";

/* Whether the site can be reached, for the ways a page offers. With no connection a page keeps every link and control
   in its place and disables the ones that need the server, so nothing moves; the ones that open from the browser
   stay live: the account's own things from its copy, the editor, and the pages whose words are in the code. Offline
   is the browser's word, a page the service worker answered from its kept copy, or a sync that could not reach the
   server, since a page opened offline can believe it is online. It reads online on both sides until the page has
   started (watchConnection), so a page hydrates as the server drew it. */

const [started, setStarted] = createSignal(false);
/* the service worker answered this page from its kept copy, the network having failed */
const [answeredOffline, setAnsweredOffline] = createSignal(false);
export const offline = (): boolean =>
  !isServer && started() && (answeredOffline() || !syncStatus().online || syncStatus().cutOff);
const online = () => !offline();

const PROBE_MS = 5_000;
/** The client entry, once the first page stands: from now on the page reads the connection. */
export function watchConnection() {
  if (isServer || started()) return;
  setStarted(true);
  // the browser's own word at the start: Query's online manager assumes a connection until it hears otherwise
  if (navigator.onLine === false) onlineManager.setOnline(false);
  patchStatus({ online: onlineManager.isOnline() });
  onlineManager.subscribe(isOnline => patchStatus({ online: isOnline }));
  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  if (entry?.serverTiming?.some(timing => timing.name === "offline")) {
    setAnsweredOffline(true);
    askUntilAnswered();
  }
}
/* A page answered offline asks the Worker on the browser's own signs and every few seconds until it answers: a
   reader signed out has no sync to find the connection again. */
function askUntilAnswered() {
  const ask = () => {
    fetch("/api/build", { cache: "no-store", credentials: "omit" }).then(
      () => {
        setAnsweredOffline(false);
        clearInterval(timer);
        removeEventListener("online", ask);
        removeEventListener("focus", ask);
      },
      () => {}
    );
  };
  const timer = setInterval(ask, PROBE_MS);
  addEventListener("online", ask);
  addEventListener("focus", ask);
}

const OFFLINE_PAGES = new Set(["/about", "/settings", "/bindings", "/privacy", "/terms"]);
/** Whether the page at an address opens with no connection. Another site's never does. */
export function opensOffline(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  const path = delocalizePath(href).path.replace(/[?#].*$/s, "");
  if (OFFLINE_PAGES.has(path)) return true;
  const user = account()?.id ?? null;
  if (path === "/palettes/saved" || path === "/collections/saved") return !!user;
  const words = path.slice(1).split("/");
  // a palette's page, which the editor draws from its seed
  if (words.length === 1 && decodePalette(words[0])) return true;
  if (words.at(-1) === "rising") words.pop();
  // an address of one word, or an account's two, may be a collection: the account's own opens
  const slug = words[0]?.startsWith("@") ? words.slice(0, 2).join("/") : words.join("/");
  return !!user && (accountView().collections.has(slug) || hintedCollection(user, slug));
}

/** A list that cannot be shown now: offline, every list but the account's own, and with no account all of them. */
export const listUnavailable = (choice: string): boolean =>
  !online() && (choice === "popular" || choice === "rising" || !account());
/** Whether a press that leads to sign in has nowhere to go: offline, with no account. */
export const signInUnavailable = (): boolean => offline() && !account();
/** Whether a link leads nowhere now: offline, to a page that needs the server, or with no address, a press that
    asks the server. */
export const unreachable = (href: string | undefined): boolean =>
  !online() && !(href && opensOffline(href));
/** The links a page shows, each in its place: disabled while offline when its page needs the server. */
export const marked = <T extends { href?: string; disabled?: boolean }>(
  links: readonly T[]
): T[] =>
  online()
    ? [...links]
    : links.map(link => (unreachable(link.href) ? { ...link, disabled: true } : link));
