import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { FontaineTransform } from "fontaine";
import { visualizer } from "rollup-plugin-visualizer";
import path from "node:path";

const config = defineConfig(({ mode }) => {
  return {
    define: {
      "process.env.NODE_ENV": JSON.stringify(mode),
    },
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
      resolvePath: (id) => {
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
          // Separate Radix UI components
          if (id.includes("@radix-ui")) {
            return "radix-ui";
          }
          // Separate DND kit
          if (id.includes("@dnd-kit")) {
            return "dnd-kit";
          }
          // Separate date-fns
          if (id.includes("date-fns")) {
            return "date-fns";
          }
          // Separate TanStack Query
          if (id.includes("@tanstack/react-query") || id.includes("@tanstack/query-core")) {
            return "tanstack-query";
          }
          // Separate TanStack Form
          if (id.includes("@tanstack/react-form") || id.includes("@tanstack/form-core")) {
            return "tanstack-form";
          }
        },
      },
    },
  },
};
});

export default config;
