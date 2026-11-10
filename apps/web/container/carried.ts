/* What the video container's image carries over Node's (scripts/video-image.ts): its server, drawer and encoder bundled
   by esbuild with everything of the engine they import (the clips' drawing of every effect, each field effect's
   definition among it, engine/video.ts reading kit/registry.ts), and the clips' module, video.wasm. image.json records
   the hash of those bytes when the image is pushed, and a test holds the image to it (image.test.ts). It held the image
   to this folder's own sources alone, so a field effect's file replaced by kit:add, which leaves the module as it was,
   passed every check while the image went on drawing whole clips by the old file: frame 7 at 320 by 180 of the zen
   garden's, a field effect the site played from 8 to 10 Nov 2026, the shadow's alpha changed from 0.24 to 0.3,
   differed in 47,941 of 172,800 bytes, by up to 11 levels (8 Nov 2026). The bundles are written with their whitespace
   minified, which drops their comments (esbuild keeps a comment inside a statement or an object otherwise), so a
   comment or a line's layout changed anywhere bundles to the same bytes and asks for no push; names and code stay as
   written. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { build } from "esbuild";

const web = new URL("..", import.meta.url).pathname;
/** The clips' module, which the image carries beside the bundles. */
export const VIDEO_WASM = join(web, "../../packages/engine/src/video/video.wasm");

/** The container's three entry points bundled as the image carries them, by file name: from apps/web, so the bundles'
    paths are the same whoever builds them, wherever. */
export async function containerBundles(): Promise<Map<string, Uint8Array>> {
  const { outputFiles } = await build({
    absWorkingDir: web,
    entryPoints: ["server", "drawer", "encoder"].map(name => `container/${name}.ts`),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    outdir: "container/out",
    outExtension: { ".js": ".mjs" },
    minifyWhitespace: true,
    write: false,
    logLevel: "warning"
  });
  return new Map(outputFiles.map(file => [basename(file.path), file.contents]));
}

/** The hash of what an image carries: each bundle by its name, then the module. */
export function carriedHash(
  bundles: Map<string, Uint8Array>,
  wasm: Uint8Array = readFileSync(VIDEO_WASM)
): string {
  const hash = createHash("sha256");
  for (const name of [...bundles.keys()].sort())
    hash.update(`${name}\0`).update(bundles.get(name)!).update("\0");
  return hash.update("video.wasm\0").update(wasm).digest("hex").slice(0, 16);
}
