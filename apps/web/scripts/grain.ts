import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { grainPng } from "@grabient/engine/grain.ts";
import { GRAIN_MAX } from "@grabient/engine/view.ts";
import type { Plugin } from "vite";

/* Writes the grain's tile (engine/grain.ts) at every strength, 1 to GRAIN_MAX, into the browser's build as PNGs in one
   folder under /assets/ named by the tile's contents, and gives the folder's address to the browser and the Worker as
   __GRAIN__: a picture with grain lays `${__GRAIN__}/${grain}.png` over itself, so every grain is one file a reader's
   cache keeps for good. `vite dev` answers them from memory. */

export async function grain(): Promise<Plugin> {
  const files = new Map<number, Uint8Array>();
  for (let n = 1; n <= GRAIN_MAX; n++)
    files.set(n, await grainPng(n, bytes => deflateSync(bytes, { level: 9 })));
  const folder = `assets/grain-${createHash("sha256").update(files.get(GRAIN_MAX)!).digest("hex").slice(0, 10)}`;
  return {
    name: "grabient:grain",
    config: () => ({ define: { __GRAIN__: JSON.stringify(`/${folder}`) } }),
    configureServer(server) {
      server.middlewares.use(`/${folder}`, (request, response, next) => {
        const n = /^\/(\d{1,3})\.png$/.exec(request.url ?? "")?.[1];
        const file = n ? files.get(Number(n)) : undefined;
        if (!file) return next();
        response.setHeader("Content-Type", "image/png");
        response.end(file);
      });
    },
    applyToEnvironment: environment => environment.name === "client",
    generateBundle() {
      for (const [n, file] of files)
        this.emitFile({ type: "asset", fileName: `${folder}/${n}.png`, source: file });
    }
  };
}
