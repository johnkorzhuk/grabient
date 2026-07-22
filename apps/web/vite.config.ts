import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  build: {
    outDir: "dist/client",
    manifest: true,
    target: "es2022",
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: "src/islands/entry.tsx",
    },
  },
});
