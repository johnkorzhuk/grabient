import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { connectionsRoute } from "../../../../server/oauth/connections.ts";

/* POST {clientId}: ends every grant of that app for the signed-in account, with its tokens. */
export const Route = createFileRoute("/api/settings/connections/disconnect")({
  server: { handlers: { ANY: ({ request }) => connectionsRoute(request, env) } }
});
