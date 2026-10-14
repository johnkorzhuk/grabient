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

export default defineConfig({
  plugins: [stamps(), cloudflare(), solid()],
  server: { strictPort: true },
  preview: { strictPort: true },
  build: { target: "esnext" }
});
