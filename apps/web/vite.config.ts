import { cloudflare } from "@cloudflare/vite-plugin";
import { i18n } from "@grabient/i18n/vite.ts";
import solid from "@solidjs/vite-plugin";
import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import { defineConfig } from "vite";

/* One app on one Worker. The Cloudflare plugin reads cloudflare.config.ts for the mode (`vite dev` is development,
   `vite build --mode staging` is staging) and runs the Worker in workerd under `vite dev` and `vite preview`, with every
   binding simulated on this machine. src/server.ts is the Worker: its pipeline runs around Start. */
export default defineConfig({
  // Base 36 of the build's clock: in each Worker answer's Server-Timing and in the edge cache's keys.
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  server: { strictPort: true },
  preview: { strictPort: true },
  environments: {
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
    cloudflare({ viteEnvironment: { name: "ssr" }, remoteBindings: false }),
    tanstackStart({
      // Worker-only code never reaches the browser: the build fails on an import of it from code the client runs.
      importProtection: {
        behavior: "error",
        client: { files: ["**/*.server.*", "src/server/**"], specifiers: ["cloudflare:workers"] }
      }
    }),
    // The Worker entry stays out of Solid's transform, which would add an export workerd refuses on a main module.
    solid({ ssr: true, exclude: ["src/server.ts"] })
  ]
});
