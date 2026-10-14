import { cloudflare } from "@cloudflare/vite-plugin";
import { i18n } from "@grabient/i18n/vite.ts";
import solid from "@solidjs/vite-plugin";
import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import { defineConfig, type Rolldown } from "vite";
import { colorNames } from "./scripts/color-names.ts";
import { serviceWorker } from "./scripts/service-worker.ts";
import { mcpView } from "./src/mcp-view/build.ts";
import { draftsStayPrivate } from "./src/server/newsletter/private.ts";

/* The two chunks every page starts with: each module a chain of static imports leads to from the app's entry, the
   packages' in one file and the app's own in the entry's. Left to itself the bundler gives every module the entry
   shares with a page a chunk of its own, some sixty requests before a page can run, each compressed apart. What the
   app takes from its packages changes rarely, so a deploy leaves that file in a returning reader's cache. What a page
   alone loads stays in that page's chunks. */
function startChunks(): Rolldown.CodeSplittingGroup[] {
  const starts = new Map<string, boolean>();
  const packaged = new Map<string, boolean>();
  const atStart = (id: string, ctx: Rolldown.ChunkingContext): boolean => {
    if (!starts.has(id)) {
      const reached = new Set([id]);
      let found = false;
      for (const at of reached) {
        const info = ctx.getModuleInfo(at);
        // a page the router loads on demand is an entry too: the app's own is the one nothing imports
        found = starts.get(at) === true || (!!info?.isEntry && !info.dynamicImporters.length);
        if (found) break;
        if (starts.get(at) !== false) for (const from of info?.importers ?? []) reached.add(from);
      }
      if (found) starts.set(id, true);
      // nothing that leads here starts with the app, so none of it does either
      else for (const at of reached) starts.set(at, false);
    }
    return starts.get(id) === true;
  };
  /* A package's module that imports nothing of the app's, however far its imports are followed. The packages' file
     then never imports the app's, and the two load in one order. Vite's helper for an import on demand counts as a
     package's: Solid's runtime imports it. */
  const fromPackages = (id: string, ctx: Rolldown.ChunkingContext): boolean => {
    if (!packaged.has(id)) {
      const reached = new Set([id]);
      let all = true;
      for (const at of reached) {
        all = packaged.get(at) ?? (at.includes("/node_modules/") || at.startsWith("\0vite/"));
        if (!all) break;
        if (!packaged.has(at))
          for (const to of ctx.getModuleInfo(at)?.importedIds ?? []) reached.add(to);
      }
      if (all) for (const at of reached) packaged.set(at, true);
      else packaged.set(id, false);
    }
    return packaged.get(id) === true;
  };
  return [
    { name: (id, ctx) => (atStart(id, ctx) && fromPackages(id, ctx) ? "vendor" : null) },
    { name: (id, ctx) => (atStart(id, ctx) ? "start" : null) }
  ];
}

/* One app on one Worker. The Cloudflare plugin reads cloudflare.config.ts for the mode (`vite dev` is development,
   `vite build --mode staging` is staging) and runs the Worker in workerd under `vite dev` and `vite preview`, with every
   binding simulated on this machine. src/server.ts is the Worker: its pipeline runs around Start. */
export default defineConfig({
  // Base 36 of the build's clock: in each Worker answer's Server-Timing and in the edge cache's keys.
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  server: { strictPort: true },
  /* The served build answers as a deploy does. Vite's own CORS would add `Vary: Origin` to every file, and a module
     script's request, which carries an Origin, would then miss every file the service worker kept. */
  preview: { strictPort: true, cors: false },
  /* One stylesheet for the whole site, which the document links and every later page already has. Split by chunk, a
     page's styles are up to thirty requests its first paint waits for, in an order that differs from page to page. */
  build: { cssCodeSplit: false },
  environments: {
    client: {
      build: {
        rolldownOptions: { output: { codeSplitting: { groups: startChunks() } } }
      }
    },
    ssr: {
      // The Worker parses less on a cold start.
      build: { minify: true },
      /* Discovered on the first request instead, Solid's runtime is optimized again and the module runner keeps both
         copies: the router's context splits and rendering fails until a restart. */
      optimizeDeps: {
        include: [
          "solid-js",
          "solid-js/internal",
          "@solidjs/web",
          "@solidjs/web/storage",
          "@solidjs/web/server-functions/server",
          "@tanstack/solid-query",
          "valibot"
        ]
      }
    }
  },
  plugins: [
    i18n(),
    // The MCP App view, built into one page the Worker serves to AI apps.
    mcpView(),
    // A newsletter issue that has no publication day yet never reaches a file the browser is given.
    draftsStayPrivate(),
    // The precise color names swatch files carry, one file the browser and the Worker read when a file needs them.
    colorNames(),
    cloudflare({ viteEnvironment: { name: "ssr" }, remoteBindings: false }),
    tanstackStart({
      // Worker-only code never reaches the browser: the build fails on an import of it from code the client runs.
      importProtection: {
        behavior: "error",
        client: { files: ["**/*.server.*", "src/server/**"], specifiers: ["cloudflare:workers"] }
      }
    }),
    // The Worker entry stays out of Solid's transform, which would add an export workerd refuses on a main module.
    solid({ ssr: true, exclude: ["src/server.ts"] }),
    serviceWorker()
  ]
});
