import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";

/* POST: the signed-in account's connected apps. */
export const Route = createFileRoute("/api/settings/connections/")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { connectionsRoute } = await import("../../../../server/oauth/connections.ts");
        return connectionsRoute(request, env);
      }
    }
  }
});
