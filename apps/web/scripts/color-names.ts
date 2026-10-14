import { createHash } from "node:crypto";
import { colorNamesText } from "@grabient/engine/precise-names.ts";
import { colornames } from "color-name-list";
import type { Plugin } from "vite";

/* Writes the precise color names (color-name-list, see NOTICE) into the browser's build as one text file under
   /assets/, named by its contents, and gives its address to the browser and the Worker as __COLOR_NAMES__. The
   browser fetches it when it first writes a swatch file and the service worker keeps it; the Worker reads it through
   its ASSETS binding. `vite dev` answers its address from memory. */

export function colorNames(): Plugin {
  const text = colorNamesText(colornames);
  const path = `assets/color-names-${createHash("sha256").update(text).digest("hex").slice(0, 10)}.txt`;
  return {
    name: "grabient:color-names",
    config: () => ({ define: { __COLOR_NAMES__: JSON.stringify(`/${path}`) } }),
    configureServer(server) {
      server.middlewares.use(`/${path}`, (_request, response) => {
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end(text);
      });
    },
    applyToEnvironment: environment => environment.name === "client",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: path, source: text });
    }
  };
}
