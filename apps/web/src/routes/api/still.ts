import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";

// The fluted glass's still that a palette's first screen paints (server/glass-still.ts), as WebP. Its drawing and its
// encoder load with the first one an isolate is asked for.
export const Route = createFileRoute("/api/still")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import("../../server/images/still.ts")).stillAnswer(request, env, waitUntil)
    }
  }
});
