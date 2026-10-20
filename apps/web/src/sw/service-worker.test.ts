import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { OFF, offlineFiles, workerSource } from "../../scripts/service-worker.ts";

/* The service worker as a build ships it, run against caches and a network the test keeps: a shell is kept from this
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

type Site = Record<string, string | Error | { private: string }>;
/** A worker with empty caches, answering from `site`: a path's body, one kept by no cache, an Error for no connection,
    or nothing (404). `windows` are the pages the browser has open. */
function install(site: Site, code = source, windows: string[] = []) {
  const stores = new Map<string, Map<string, Response>>();
  const fetched: string[] = [];
  const keyOf = (request: string | { url: string }) =>
    new URL(typeof request === "string" ? request : request.url, ORIGIN).href;
  const reach = async (request: string | { url: string }) => {
    const url = new URL(keyOf(request));
    fetched.push(url.pathname + url.search);
    const body = site[url.pathname];
    if (body instanceof Error) throw new TypeError("Failed to fetch");
    if (body === undefined) return new Response("", { status: 404 });
    const type = url.pathname.startsWith("/assets/")
      ? "text/javascript"
      : "text/html; charset=utf-8";
    if (typeof body === "string") {
      return new Response(body, { status: 200, headers: { "Content-Type": type } });
    }
    return new Response(body.private, {
      status: 200,
      headers: { "Content-Type": type, "Cache-Control": "no-store" }
    });
  };
  const cache = (name: string) => {
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
    open: async (name: string) => cache(name),
    match: async (request: string | { url: string }) => {
      for (const name of stores.keys()) {
        const hit = await cache(name).match(request);
        if (hit) return hit;
      }
      return undefined;
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name)
  };
  const listeners: Record<string, (event: object) => void> = {};
  const worker = { skipped: false, unregistered: false, stores, fetched };
  const self = {
    location: new URL("/sw.js", ORIGIN),
    addEventListener: (type: string, listener: (event: object) => void) => {
      listeners[type] = listener;
    },
    skipWaiting: async () => {
      worker.skipped = true;
    },
    clients: {
      claim: async () => {},
      matchAll: async () => windows.map(path => ({ url: ORIGIN + path }))
    },
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
    shell: async () => (await cache(SHELLS).match(`${ORIGIN}/palettes/saved`))?.text(),
    open: cache
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

  it("keeps the messages a shell's head asks for along with it", async () => {
    const named = THIS_BUILD.replace(
      "</head>",
      '<script>self.$catalog=fetch("/assets/i18n-fr-b2.json")</script></head>'
    );
    const site = files(named);
    const worker = install(site);
    await worker.install();
    expect(await worker.shell()).toBeUndefined();
    site["/assets/i18n-fr-b2.json"] = "{}";
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

  it("keeps each open page again as it takes over, with the files it names, a request for each", async () => {
    const list = html([...CONFIG.assets, "/assets/list-b2.js"]);
    const site = files(THIS_BUILD, {
      "/palettes": list,
      "/fr/palettes": list,
      "/fr/palettes/saved": THIS_BUILD,
      "/assets/list-b2.js": "file",
      "/collections/saved": { private: THIS_BUILD },
      "/blog": LAST_BUILD
    });
    const worker = install(site, source, [
      "/palettes?utm_source=x",
      "/palettes",
      "/fr/palettes",
      "/collections/saved",
      "/blog"
    ]);
    // the last build's pages, which name files this build does not have
    const last = new Map([[`${ORIGIN}/palettes`, new Response(LAST_BUILD)]]);
    worker.stores.set("grabient-pages-b1", last);
    await worker.install();
    worker.fetched.length = 0;
    await worker.activate();
    expect(worker.stores.has("grabient-pages-b1")).toBe(false);
    expect(worker.fetched).toEqual([
      "/fr/palettes/saved",
      "/palettes",
      "/assets/list-b2.js",
      "/fr/palettes",
      "/collections/saved",
      "/blog"
    ]);
    const kept = await worker.open(`grabient-pages-${CONFIG.build}`).keys();
    expect(kept.map(page => page.url)).toEqual([`${ORIGIN}/palettes`, `${ORIGIN}/fr/palettes`]);
    // a refresh with no connection opens the page in view, whose file is kept
    site["/palettes"] = new Error("offline");
    site["/assets/list-b2.js"] = new Error("offline");
    const response = await worker.visit("/palettes");
    expect(await response?.text()).toBe(list);
    expect(response?.headers.get("Server-Timing")).toMatch(/offline/);
    expect(await worker.open("grabient-runtime").match("/assets/list-b2.js")).toBeDefined();
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

  it("keeps at install what a page that opens offline may load, at once or on demand, and no other page's own", () => {
    /** A chunk of a build: its module (none for code the bundler shared out), and the chunks it imports. */
    const chunk = (
      fileName: string,
      module: string | null,
      links: { imports?: string[]; dynamicImports?: string[] } = {}
    ) => ({
      type: "chunk" as const,
      fileName,
      isEntry: module === "src/client.tsx",
      imports: links.imports ?? [],
      dynamicImports: links.dynamicImports ?? [],
      facadeModuleId: module && `/app/${module}`
    });
    const bundle: Record<string, ReturnType<typeof chunk> | { type: "asset" }> = {
      "style.css": { type: "asset" },
      "i18n-fr.json": { type: "asset" }
    };
    for (const file of [
      chunk("entry.js", "src/client.tsx", {
        imports: ["vendor.js"],
        dynamicImports: ["saved.js", "palette.js", "login.js", "editor.js", "sync.js"]
      }),
      chunk("vendor.js", null),
      chunk("saved.js", "src/routes/palettes/saved.tsx?tsr-split=component"),
      chunk("palette.js", "src/routes/$id/index.tsx?tsr-split=component"),
      chunk("login.js", "src/routes/login.tsx?tsr-split=component", { imports: ["form.js"] }),
      chunk("form.js", null),
      chunk("editor.js", "src/features/editor/Editor.tsx", { dynamicImports: ["collect.js"] }),
      chunk("collect.js", "src/features/editor/Collect.tsx"),
      chunk("sync.js", "src/features/account/sync.ts")
    ])
      bundle[file.fileName] = file;
    expect(offlineFiles(bundle).sort()).toEqual([
      "collect.js",
      "editor.js",
      "entry.js",
      "palette.js",
      "saved.js",
      "style.css",
      "sync.js",
      "vendor.js"
    ]);
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
