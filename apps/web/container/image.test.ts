import { VIDEO_MODULE } from "@grabient/engine/video.ts";
import { expect, test } from "vitest";
import { VIDEO_DRAWING } from "../src/server/images/video.ts";
import { carriedHash, containerBundles } from "./carried.ts";
import image from "./image.json" with { type: "json" };

/* Staging deploys the image image.json names (cloudflare.config.ts): it must draw today's clips with today's module
   and carry today's code, this folder's and the engine's it bundles (each field effect's definition among it), or a
   clip drawn whole would differ from the one the Worker draws under the same key. */
test("the container's image is pushed for today's drawing, module and code (pnpm --filter web video:image)", async () => {
  expect(image.drawing).toBe(VIDEO_DRAWING);
  expect(image.module).toBe(VIDEO_MODULE);
  expect((image as { carries?: string }).carries).toBe(carriedHash(await containerBundles()));
});
