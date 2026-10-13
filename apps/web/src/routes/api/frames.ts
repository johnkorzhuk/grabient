import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { FRESH } from "../../lib/cache.ts";
import { json } from "../../lib/responses.ts";
import { framesOffered } from "../../server/gallery/home.ts";

/* The Rising frames an admin has left on, which a press on Rising moves through. */
export const Route = createFileRoute("/api/frames")({
  server: {
    handlers: {
      GET: async () => json({ frames: await framesOffered(env) }, { headers: FRESH })
    }
  }
});
