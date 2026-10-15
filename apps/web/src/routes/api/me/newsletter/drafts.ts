import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";

/* GET ?lang=: the newsletter's drafts, an admin's alone. */
export const Route = createFileRoute("/api/me/newsletter/drafts")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { draftsResponse } = await import("../../../../server/newsletter/routes.ts");
        return draftsResponse(request, env);
      }
    }
  }
});
