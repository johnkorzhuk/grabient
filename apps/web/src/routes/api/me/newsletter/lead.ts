import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";

/* GET ?issue=&seed=&lang=: an issue's sheet led by a palette it offers; POST { issue, seed }: an admin's choice of lead. */
export const Route = createFileRoute("/api/me/newsletter/lead")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { leadResponse } = await import("../../../../server/newsletter/routes.ts");
        return leadResponse(request, env);
      }
    }
  }
});
