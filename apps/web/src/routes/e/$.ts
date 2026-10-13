import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { replayResponse } from "../../server/analytics/replay.ts";

/* The site's own way to PostHog, for session recordings: /e/static/…, /e/array/…/config and /e/s/. */
export const Route = createFileRoute("/e/$")({
  server: { handlers: { ANY: ({ request }) => replayResponse(request, env) } }
});
