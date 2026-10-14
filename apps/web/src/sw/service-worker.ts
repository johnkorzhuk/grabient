/* Grabient's service worker, built into /sw.js (scripts/service-worker.ts) with the build's id, the files it keeps at
   install, and the languages' first segments. It lets the site open with no connection: every page still comes from
   the network first, and offline a page is the copy kept of it, or the app's shell, which draws any page in the
   browser and reads the account's own things from its copy (features/account/sync.ts). It never answers the API,
   and never keeps a private page. A classic script: no imports. */

interface Config {
  build: string;
  /** the files every page needs and the pages that open offline, kept at install */
  assets: string[];
  segments: string[];
}
interface Waiting extends Event {
  waitUntil(work: Promise<unknown>): void;
}
interface Fetching extends Waiting {
  request: Request;
  preloadResponse: Promise<Response | undefined>;
  respondWith(answer: Promise<Response>): void;
}
interface Scope {
  location: Location;
  registration: {
    navigationPreload?: { enable(): Promise<void> };
    unregister(): Promise<boolean>;
  };
  clients: {
    claim(): Promise<void>;
    matchAll(options: { type: "window" }): Promise<{ url: string }[]>;
  };
  skipWaiting(): Promise<void>;
  addEventListener(type: "install" | "activate", listener: (event: Waiting) => void): void;
  addEventListener(type: "fetch", listener: (event: Fetching) => void): void;
}
declare const __GRABIENT_SW__: Config;

const sw = self as unknown as Scope;
const CONFIG = __GRABIENT_SW__;
const ASSETS = `grabient-assets-${CONFIG.build}`;
const SHELLS = `grabient-shells-${CONFIG.build}`;
const PAGES = `grabient-pages-${CONFIG.build}`;
const RUNTIME = "grabient-runtime";
/** the shell is Saved's document: a page the browser draws, with nothing of the account in it */
const SHELL = "/palettes/saved";
const PAGES_KEPT = 60;
const RUNTIME_KEPT = 160;

const segmentOf = (pathname: string) => {
  const first = pathname.split("/")[1] ?? "";
  return CONFIG.segments.includes(first) ? first : "";
};
const shellUrl = (segment: string) =>
  new URL((segment ? `/${segment}` : "") + SHELL, sw.location.origin).href;
/** a page by its address: the campaign tags and click ids a link carries are no page of their own */
function pageKey(url: URL): string {
  const key = new URL(url.href);
  key.hash = "";
  for (const name of [...key.searchParams.keys()]) {
    if (/^(utm_|gclid$|fbclid$|msclkid$)/.test(name)) key.searchParams.delete(name);
  }
  return key.href;
}
/** a page any browser may keep: public HTML, answered whole */
const keepable = (response: Response) =>
  response.status === 200 &&
  !response.redirected &&
  (response.headers.get("Content-Type") ?? "").includes("text/html") &&
  !/no-store|private/.test(response.headers.get("Cache-Control") ?? "");

async function trim(cache: Cache, kept: number) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - kept))) await cache.delete(key);
}

/** The shell in a language, and the files it names (its links and scripts, and the messages its head asks for), kept
    once per build: whole or not at all, since a shell without its files opens blank offline. While a deploy spreads, the address can still answer with the last build's page,
    whose files this build deletes when it takes over: that one is left for the next page to try. */
async function keepShell(segment: string) {
  const shells = await caches.open(SHELLS);
  const url = shellUrl(segment);
  if (await shells.match(url)) return;
  const response = await fetch(url, { credentials: "omit", cache: "no-store" });
  if (!response.ok) return;
  const html = await response.clone().text();
  const named = [...new Set([...html.matchAll(/"(\/(?:assets|fonts)\/[^"]+)"/g)].map(m => m[1]!))];
  if (!named.some(path => path.startsWith("/assets/") && CONFIG.assets.includes(path))) return;
  const runtime = await caches.open(RUNTIME);
  for (const path of named) if (!(await caches.match(path))) await runtime.add(path);
  await shells.put(url, response);
}

sw.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      await (await caches.open(ASSETS)).addAll(CONFIG.assets);
      // a shell not kept now is tried again as pages load
      await keepShell("").catch(() => {});
      await sw.skipWaiting();
    })()
  );
});

sw.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      // another build's files and pages go: a page kept from it names files this build does not have
      const own = [ASSETS, SHELLS, PAGES, RUNTIME];
      for (const key of await caches.keys()) {
        if (key.startsWith("grabient-") && !own.includes(key)) await caches.delete(key);
      }
      await sw.registration.navigationPreload?.enable();
      await sw.clients.claim();
      // the shell in each language the open pages are in
      for (const client of await sw.clients.matchAll({ type: "window" })) {
        await keepShell(segmentOf(new URL(client.url).pathname)).catch(() => {});
      }
    })()
  );
});

/** A page answered with no connection says so (connection.ts), since the browser can still say it is online. */
function answeredOffline(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.append("Server-Timing", "offline");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function navigate(event: Fetching, url: URL): Promise<Response> {
  try {
    const response = (await event.preloadResponse) ?? (await fetch(event.request));
    if (keepable(response)) {
      const copy = response.clone();
      event.waitUntil(
        (async () => {
          const pages = await caches.open(PAGES);
          await pages.put(pageKey(url), copy);
          await trim(pages, PAGES_KEPT);
        })()
      );
    }
    if (response.ok) event.waitUntil(keepShell(segmentOf(url.pathname)).catch(() => {}));
    return response;
  } catch (error) {
    const page = await (await caches.open(PAGES)).match(pageKey(url));
    if (page) return answeredOffline(page);
    const shells = await caches.open(SHELLS);
    const shell =
      (await shells.match(shellUrl(segmentOf(url.pathname)))) ?? (await shells.match(shellUrl("")));
    if (shell) return answeredOffline(shell);
    throw error;
  }
}

/** The build's files are named by their contents, so a kept one is the right one. */
async function asset(request: Request): Promise<Response> {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    void caches.open(RUNTIME).then(async cache => {
      await cache.put(request, copy);
      await trim(cache, RUNTIME_KEPT);
    });
  }
  return response;
}

sw.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;
  if (request.mode === "navigate") event.respondWith(navigate(event, url));
  else if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/")) {
    event.respondWith(asset(request));
  }
});
