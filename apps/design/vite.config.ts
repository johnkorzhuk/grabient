import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { motionScript } from "@grabient/ui/motion.ts";
import { scrollbarScript } from "@grabient/ui/scrollbar.ts";
import { themeScript } from "@grabient/ui/theme.ts";
import solid from "@solidjs/vite-plugin";
import { defineConfig, type Plugin } from "vite";

/* The design document: a Solid app built to static files, which the Cloudflare plugin writes out as a Worker of assets
   alone for `cf deploy --prebuilt`. The head carries the site's own stamps, so the theme, the motion choice and the
   scrollbar are set before the first paint, as they are on grabient.com. */
const stamps = (): Plugin => ({
  name: "design-stamps",
  transformIndexHtml: () => [
    {
      tag: "script",
      children: themeScript + motionScript + scrollbarScript,
      injectTo: "head"
    }
  ]
});

/* A module the design system has yet to land is drawn from src/stubs until it lands: a stub answers only where
   packages/ui has no module of that name, as the `paths` in tsconfig.json do for the types. */
const stubs = (): Plugin => {
  const ui = fileURLToPath(new URL("../../packages/ui/src/", import.meta.url));
  const own = fileURLToPath(new URL("./src/stubs/", import.meta.url));
  return {
    name: "design-stubs",
    enforce: "pre",
    resolveId(id) {
      const name = /^@grabient\/ui\/(.+)$/.exec(id)?.[1];
      if (!name || existsSync(ui + name) || !existsSync(own + name)) return null;
      return own + name;
    }
  };
};

export default defineConfig({
  plugins: [stubs(), stamps(), cloudflare(), solid()],
  server: { strictPort: true },
  preview: { strictPort: true },
  build: { target: "esnext" }
});
