import { createFileRoute } from "@tanstack/solid-router";
import { NO_STORE } from "../../lib/cache.ts";

/* Nothing but the build that answers, which every answer names in Server-Timing: a tab back from the background asks
   it once to learn whether a deploy happened while it was away. */
export const Route = createFileRoute("/api/build")({
  server: { handlers: { GET: () => new Response(null, { status: 204, headers: NO_STORE }) } }
});
