import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { OFF, workerSource } from "../../scripts/service-worker.ts";

/* The service worker as a build ships it, run against stand-in caches and a stand-in network: a shell is kept from this
   build with every file it names or not at all, so a page opened offline never mounts blank; offline pages say so. */

const ORIGIN = "https://grabient.test";
const CONFIG = {
  build: "b2",
  assets: ["/assets/entry-b2.css", "/assets/entry-b2.js", "/fonts/poppins-latin-500-normal.woff2"],
  segments: ["fr"]
};
const SHELLS = `grabient-shells-${CONFIG.build}`;
const html = (files: readonly string[]) =>
  `<!doctype html><html><head>${files
    .map(path =>
      path.endsWith(".js")
        ? `<script type="module" src="${path}"></script>`
        : path.endsWith(".css")
          ? `<link rel="stylesheet" href="${path}">`
          : `<link rel="preload" as="font" href="${path}" crossorigin>`
    )
    .join("")}</head><body></body></html>`;
const THIS_BUILD = html(CONFIG.assets);
const LAST_BUILD = html([
  "/assets/entry-b1.css",
  "/assets/entry-b1.js",
  "/fonts/poppins-latin-500-normal.woff2"
]);
const source = await workerSource(CONFIG);

type Site = Record<string, string | Error>;
/** A worker with empty caches, answering from `site`: a path's body, an Error for no connection, or nothing (404). */
function install(site: Site, code = source) {
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (request: string | { url: string }) =>
    new URL(typeof request === "string" ? request : request.url, ORIGIN).href;
  const reach = async (request: string | { url: string }) => {
    const url = new URL(keyOf(request));
    const body = site[url.pathname];
    if (body instanceof Error) throw new TypeError("Failed to fetch");
    if (body === undefined) return new Response("", { status: 404 });
    const type = url.pathname.startsWith("/assets/")
      ? "text/javascript"
      : "text/html; charset=utf-8";
    return new Response(body, { status: 200, headers: { "Content-Type": type } });
  };
  const open = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    const keep = (request: string | { url: string }, response: Response) => {
      if (!response.ok) throw new TypeError(`${response.status} for ${keyOf(request)}`);
      store.set(keyOf(request), response);
    };
    return {
      match: async (request: string | { url: string }) => store.get(keyOf(request))?.clone(),
      put: async (request: string, response: Response) => void store.set(keyOf(request), response),
      add: async (request: string) => keep(request, await reach(request)),
      addAll: async (requests: string[]) => {
        const answers = await Promise.all(requests.map(reach));
        if (answers.some(response => !response.ok)) throw new TypeError("a file failed");
        for (const [i, response] of answers.entries()) keep(requests[i]!, response);
      },
      keys: async () => [...store.keys()].map(url => ({ url })),
      delete: async (request: string | { url: string }) => store.delete(keyOf(request))
    };
  };
  const caches = {
    open: async (name: string) => open(name),
    match: async (request: string | { url: string }) => {
      for (const name of stores.keys()) {
        const hit = await open(name).match(request);
        if (hit) return hit;
      }
      return undefined;
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name)
  };
  const listeners: Record<string, (event: object) => void> = {};
  const worker = { skipped: false, unregistered: false, stores };
  const self = {
    location: new URL("/sw.js", ORIGIN),
    addEventListener: (type: string, listener: (event: object) => void) => {
      listeners[type] = listener;
    },
    skipWaiting: async () => {
      worker.skipped = true;
    },
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration: {
      unregister: async () => {
        worker.unregistered = true;
        return true;
      }
    }
  };
  vm.runInNewContext(code, { self, caches, fetch: reach, Response, Headers, URL, console });
  /** an event's work, run to its end */
  const run = async (type: string, extra: object = {}) => {
    const waits: Promise<unknown>[] = [];
    let answer: Promise<Response> | undefined;
    listeners[type]!({
      ...extra,
      waitUntil: (work: Promise<unknown>) => waits.push(work),
      respondWith: (work: Promise<Response>) => {
        answer = work;
      }
    });
    const response = await answer;
    for (const wait of waits) await wait;
    return response;
  };
  return Object.assign(worker, {
    install: () => run("install"),
    activate: () => run("activate"),
    visit: (path: string) =>
      run("fetch", {
        request: { method: "GET", url: ORIGIN + path, mode: "navigate" },
        preloadResponse: Promise.resolve(undefined)
      }),
    shell: async () => (await open(SHELLS).match(`${ORIGIN}/palettes/saved`))?.text(),
    open
  });
}
const files = (shell: string | Error, extra: Site = {}): Site => ({
  ...Object.fromEntries(CONFIG.assets.map(path => [path, "file"])),
  "/palettes/saved": shell,
  "/about": html(CONFIG.assets),
  ...extra
});

describe("the service worker", () => {
  it("keeps a shell from this build at install, with the files it names", async () => {
    const worker = install(files(THIS_BUILD));
    await worker.install();
    expect(worker.skipped).toBe(true);
    expect(await worker.shell()).toBe(THIS_BUILD);
  });

  it("leaves the last build's shell, files or not, and the next page keeps this build's", async () => {
    const kept: Site[] = [{}, { "/assets/entry-b1.css": "file", "/assets/entry-b1.js": "file" }];
    for (const extra of kept) {
      const site = files(LAST_BUILD, extra);
      const worker = install(site);
      await worker.install();
      expect(worker.skipped).toBe(true);
      expect(await worker.shell()).toBeUndefined();
      site["/palettes/saved"] = THIS_BUILD;
      await worker.visit("/about");
      expect(await worker.shell()).toBe(THIS_BUILD);
    }
  });

  it("leaves a shell whose file did not load until the file loads", async () => {
    const named = html([...CONFIG.assets, "/assets/messages-b2.js"]);
    const site = files(named);
    const worker = install(site);
    await worker.install();
    expect(await worker.shell()).toBeUndefined();
    site["/assets/messages-b2.js"] = "file";
    await worker.visit("/about");
    expect(await worker.shell()).toBe(named);
  });

  it("opens a page it never kept from the shell offline, and says it answered offline", async () => {
    const site = files(THIS_BUILD);
    const worker = install(site);
    await worker.install();
    site["/palettes/saved"] = new Error("offline");
    site["/collections/saved"] = new Error("offline");
    const response = await worker.visit("/collections/saved");
    expect(await response?.text()).toBe(THIS_BUILD);
    expect(response?.headers.get("Server-Timing")).toMatch(/offline/);
  });

  it("keeps a public page it opened, and answers it offline", async () => {
    const site = files(THIS_BUILD);
    const worker = install(site);
    await worker.install();
    await worker.visit("/about?utm_source=x");
    site["/about"] = new Error("offline");
    const response = await worker.visit("/about");
    expect(await response?.text()).toBe(html(CONFIG.assets));
  });

  it("takes itself and its caches out of the browser in a build with SW=off", async () => {
    const worker = install(files(THIS_BUILD));
    await worker.install();
    const off = install({}, OFF);
    for (const [name, store] of worker.stores) off.stores.set(name, store);
    off.stores.set("other-site-cache", new Map());
    await off.activate();
    expect([...off.stores.keys()]).toEqual(["other-site-cache"]);
    expect(off.unregistered).toBe(true);
  });
});
