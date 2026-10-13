import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { LOCALE_SEGMENTS } from "@grabient/i18n";
import { type Plugin, type Rolldown, transformWithOxc } from "vite";

/* Writes /sw.js into the browser's build: src/sw/service-worker.ts with this build's files, which it keeps at install,
   the languages' first segments, and an id named by the files, so a build that changed nothing leaves the installed
   worker as it is. It keeps the scripts and styles every page needs and those of the pages that open with no
   connection (app/connection.ts, opensOffline); any other page's files are kept as they are first
   fetched. With SW=off it writes a worker that takes itself and its caches out of every browser that has one. */

const SOURCE = new URL("../src/sw/service-worker.ts", import.meta.url);
const FONTS = new URL("../public/fonts/", import.meta.url);
const OFFLINE_ROUTES = [
  "routes/palettes/saved.tsx",
  "routes/collections/saved.tsx",
  "routes/@{$handle}/$slug/index.tsx",
  "routes/$id/index.tsx",
  "routes/about.tsx",
  "routes/settings.tsx",
  "routes/bindings.tsx",
  "routes/privacy.tsx",
  "routes/terms.tsx"
];

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

/** The chunk's files and those it imports, with their styles. */
function closure(
  bundle: Rolldown.OutputBundle,
  from: readonly Rolldown.OutputChunk[]
): Set<string> {
  const files = new Set<string>();
  const visit = (chunk: Rolldown.OutputChunk) => {
    if (files.has(chunk.fileName)) return;
    files.add(chunk.fileName);
    for (const css of chunk.viteMetadata?.importedCss ?? []) files.add(css);
    for (const name of chunk.imports) {
      const next = bundle[name];
      if (next?.type === "chunk") visit(next);
    }
  };
  for (const chunk of from) visit(chunk);
  return files;
}

export function serviceWorker(): Plugin {
  return {
    name: "grabient:service-worker",
    apply: "build",
    applyToEnvironment: environment => environment.name === "client",
    async generateBundle(_options, bundle) {
      if (process.env.SW === "off") {
        this.emitFile({ type: "asset", fileName: "sw.js", source: OFF });
        return;
      }
      const chunks = Object.values(bundle).filter(
        (file): file is Rolldown.OutputChunk => file.type === "chunk"
      );
      const kept = closure(
        bundle,
        chunks.filter(
          chunk =>
            chunk.isEntry ||
            // a route's chunk is its module split by the router: its id carries a query
            OFFLINE_ROUTES.some(route =>
              chunk.facadeModuleId?.split("?")[0]?.endsWith(`/src/${route}`)
            )
        )
      );
      const fonts = readdirSync(FONTS).filter(name => name.endsWith(".woff2"));
      const assets = [
        ...[...kept].map(name => `/${name}`),
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
