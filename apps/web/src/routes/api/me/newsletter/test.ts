import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";

/* POST: an admin sends the newest issue to their own address. */
export const Route = createFileRoute("/api/me/newsletter/test")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { testResponse } = await import("../../../../server/newsletter/routes.ts");
        return testResponse(request, env);
      }
    }
  }
});
