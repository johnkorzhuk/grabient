import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";

/* GET: an admin reads the latest sends. POST: an admin prepares, arms, pauses, resumes or cancels one, or sends its
   proof. */
export const Route = createFileRoute("/api/me/newsletter/sends")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { sendsResponse } = await import("../../../../server/newsletter/routes.ts");
        return sendsResponse(request, env);
      }
    }
  }
});
