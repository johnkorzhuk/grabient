import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";

/* POST {clientId}: ends every grant of that app for the signed-in account, with its tokens. */
export const Route = createFileRoute("/api/settings/connections/disconnect")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { connectionsRoute } = await import("../../../../server/oauth/connections.ts");
        return connectionsRoute(request, env);
      }
    }
  }
});
