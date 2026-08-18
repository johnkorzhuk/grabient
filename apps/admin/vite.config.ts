import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

/**
 * The island bundle, built to ONE file that the worker inlines.
 *
 * apps/web builds islands into `dist/client` and serves them through its
 * assets binding. This worker deliberately has no assets binding — the comment
 * in wrangler.jsonc is explicit that there must be nothing for an
 * unauthenticated visitor to download even if they find the hostname, and
 * static assets are served by the platform BEFORE worker code runs, so an
 * assets directory would also skip the second Access gate in access.ts.
 *
 * So the output is a single self-contained ES module with no code splitting
 * and no module preload, imported by html.ts as a text module (same mechanism
 * as the Tailwind CSS already is) and inlined into a <script type="module">.
 * The page stays one self-contained response, both Access gates keep applying
 * to every byte, and the islands still get Solid and TanStack.
 */
export default defineConfig({
  plugins: [solid()],
  build: {
    outDir: "dist",
    emptyOutDir: false, // dist/styles.css is written by the Tailwind step
    target: "es2022",
    minify: "esbuild",
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: "src/islands/entry.tsx",
      output: {
        format: "es",
        entryFileNames: "islands.js",
        // One file. inlineDynamicImports is what forbids a second chunk the
        // worker would have no way to serve.
        inlineDynamicImports: true,
        assetFileNames: "islands-[name][extname]",
      },
    },
  },
});
