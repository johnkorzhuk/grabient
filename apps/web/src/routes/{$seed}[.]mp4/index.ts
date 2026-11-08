import { env, exports, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { seedMp4Answer } from "../../server/images/video.ts";
import type { VideoParts } from "../../server/images/video-parts.ts";

/* the Worker's own entrypoint, which draws a part of a clip in an invocation of its own */
const loopback = exports as unknown as { VideoParts: Pick<VideoParts, "draw"> };

// A palette's effect (engine/video-kinds.ts's) as a looping MP4 beside its page.
export const Route = createFileRoute("/{$seed}.mp4/")({
  server: {
    handlers: {
      GET: ({ request }) =>
        seedMp4Answer(request, env, waitUntil, job => loopback.VideoParts.draw(job))
    }
  }
});
