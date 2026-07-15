import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { FontaineTransform } from "fontaine";
import { visualizer } from "rollup-plugin-visualizer";
import path from "node:path";

const config = defineConfig({
  plugins: [
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart({
      srcDirectory: "src",
      start: { entry: "./start.tsx" },
      server: { entry: "./server.ts" },
    }),
    viteReact(),
    cloudflare({
      viteEnvironment: {
        name: "ssr",
      },
    }),
    FontaineTransform.vite({
      fallbacks: [
        "BlinkMacSystemFont",
        "Segoe UI",
        "Roboto",
        "Helvetica Neue",
        "Arial",
        "Noto Sans",
      ],
      resolvePath: (id: string) => {
        if (
          id.includes("/files/") ||
          id.includes(".woff") ||
          id.includes(".woff2")
        ) {
          return id;
        }
        return new URL(
          path.join(path.dirname(import.meta.url), "node_modules", id),
        ).href;
      },
    }),
    visualizer({
      filename: "stats.html",
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  ssr: {
    noExternal: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Separate analytics/monitoring into their own chunks
          if (id.includes("@sentry")) {
            return "sentry";
          }
          if (id.includes("posthog-js")) {
            return "posthog";
          }
          // Pin React core to its own chunk. Without this, rollup glues it
          // into whatever vendor chunk references it first (previously
          // dnd-kit), which then loads eagerly on every page.
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/")
          ) {
            return "react";
          }
          // Everything else (radix, dnd-kit, date-fns, tanstack-query/form)
          // is left to rollup's import-graph splitting so libraries only load
          // with the routes/components that actually use them.
        },
      },
    },
  },
});

export default config;
