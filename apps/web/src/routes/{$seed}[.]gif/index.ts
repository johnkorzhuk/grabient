import { env, exports, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { seedGifAnswer } from "../../server/images/answers.ts";
import type { GifParts } from "../../server/images/gif-parts.ts";

/* the Worker's own entrypoint, which draws a part of a large GIF in an invocation of its own */
const loopback = exports as unknown as { GifParts: Pick<GifParts, "draw"> };

// A palette's animated blob as a GIF.
export const Route = createFileRoute("/{$seed}.gif/")({
  server: {
    handlers: {
      GET: ({ request }) =>
        seedGifAnswer(request, env, waitUntil, job => loopback.GifParts.draw(job))
    }
  }
});
