import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { LOCALE_SEGMENTS } from "@grabient/i18n";
import { type Plugin, type Rolldown, transformWithOxc } from "vite";

/* Writes /sw.js into the browser's build: src/sw/service-worker.ts with this build's files, which it keeps at install,
   the languages' first segments, and an id named by the files, so a build that changed nothing leaves the installed
   worker as it is. It keeps every script and style a page the shell draws with no connection may load, at once or on
   demand: the pages that open offline (app/connection.ts, opensOffline), and the lists, which say there that they
   cannot be read. Another page's own files are kept as they are first fetched. With SW=off it writes a worker that
   takes itself and its caches out of every browser that has one. */

const SOURCE = new URL("../src/sw/service-worker.ts", import.meta.url);
const FONTS = new URL("../public/fonts/", import.meta.url);
const OFFLINE_ROUTES = [
  "routes/index.tsx",
  "routes/palettes/{-$order}.{-$frame}.tsx",
  "routes/collections/{-$order}.{-$frame}.tsx",
  "routes/palettes/saved.tsx",
  "routes/collections/saved.tsx",
  "routes/@{$handle}/$slug/index.tsx",
  "routes/@{$handle}/$slug/rising.tsx",
  "routes/$id/index.tsx",
  "routes/$id/rising.tsx",
  "routes/about.tsx",
  "routes/settings.tsx",
  "routes/bindings.tsx",
  "routes/privacy.tsx",
  "routes/terms.tsx"
];
/** The session recorder, which sends what it records: no use to a page with no connection. */
const RECORDER = "/node_modules/posthog-js/";

/** The worker a build with SW=off ships. */
export const OFF = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith("grabient-")) await caches.delete(key);
  await self.registration.unregister();
})()));
`;

/** The worker's script for a build: its source as JavaScript, with the build's files and languages in. */
export async function workerSource(config: {
  build: string;
  assets: readonly string[];
  segments: readonly string[];
}): Promise<string> {
  const { code } = await transformWithOxc(readFileSync(SOURCE, "utf8"), "service-worker.ts", {
    lang: "ts"
  });
  if (!code.includes("__GRABIENT_SW__")) {
    throw new Error("src/sw/service-worker.ts no longer reads __GRABIENT_SW__");
  }
  return code.replace("__GRABIENT_SW__", JSON.stringify(config));
}

type Chunk = Pick<
  Rolldown.OutputChunk,
  "type" | "fileName" | "isEntry" | "imports" | "dynamicImports" | "facadeModuleId"
>;

/** Whether a page that opens offline may load the chunk: any but the recorder and another page's own, its route's
    module split off by the router (whose id carries a query). */
function needed(chunk: Chunk): boolean {
  const [module = "", split] = (chunk.facadeModuleId ?? "").split("?");
  if (module.includes(RECORDER)) return false;
  return !split || OFFLINE_ROUTES.some(route => module.endsWith(`/src/${route}`));
}

/** The scripts and styles kept at install: the site's stylesheet, which belongs to no chunk, and every chunk the app's
    entry leads to, by its imports or on demand, that a page opened offline may load. */
export function offlineFiles(
  bundle: Readonly<Record<string, Chunk | { type: "asset" }>>
): string[] {
  const files = new Set(Object.keys(bundle).filter(name => name.endsWith(".css")));
  const visit = (chunk: Chunk) => {
    if (files.has(chunk.fileName) || !needed(chunk)) return;
    files.add(chunk.fileName);
    for (const name of [...chunk.imports, ...chunk.dynamicImports]) {
      const next = bundle[name];
      if (next?.type === "chunk") visit(next);
    }
  };
  for (const file of Object.values(bundle)) if (file.type === "chunk" && file.isEntry) visit(file);
  return [...files];
}

export function serviceWorker(): Plugin {
  return {
    name: "grabient:service-worker",
    apply: "build",
    // after the build has written the stylesheet into the bundle
    enforce: "post",
    applyToEnvironment: environment => environment.name === "client",
    async generateBundle(_options, bundle) {
      if (process.env.SW === "off") {
        this.emitFile({ type: "asset", fileName: "sw.js", source: OFF });
        return;
      }
      const fonts = readdirSync(FONTS).filter(name => name.endsWith(".woff2"));
      const assets = [
        ...offlineFiles(bundle).map(name => `/${name}`),
        ...fonts.map(name => `/fonts/${name}`)
      ].sort();
      const build = createHash("sha256").update(assets.join("\n")).digest("hex").slice(0, 12);
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: await workerSource({ build, assets, segments: LOCALE_SEGMENTS })
      });
    }
  };
}
