import { VIDEO_MODULE } from "@grabient/engine/video.ts";
import { expect, test } from "vitest";
import { VIDEO_DRAWING } from "../src/server/images/video.ts";
import image from "./image.json" with { type: "json" };
import { containerSources } from "./sources.ts";

/* Staging deploys the image image.json names (cloudflare.config.ts): it must draw today's clips with today's module
   and this folder's sources, or a clip drawn whole would differ from the one the Worker draws under the same key. */
test("the container's image is pushed for today's drawing and sources (pnpm --filter web video:image)", () => {
  expect(image.drawing).toBe(VIDEO_DRAWING);
  expect(image.module).toBe(VIDEO_MODULE);
  expect(image.sources).toBe(containerSources());
});
