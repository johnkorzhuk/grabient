import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { connectionsRoute } from "../../../../server/oauth/connections.ts";

/* POST: the signed-in account's connected apps. */
export const Route = createFileRoute("/api/settings/connections/")({
  server: { handlers: { ANY: ({ request }) => connectionsRoute(request, env) } }
});
