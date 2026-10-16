import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";

/* GET ?issue=&seed=&tip=&lang=: an issue's sheet ending with a quick tip it offers; POST { issue, tip }: an admin's
   choice of tip. */
export const Route = createFileRoute("/api/me/newsletter/tip")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { tipResponse } = await import("../../../../server/newsletter/routes.ts");
        return tipResponse(request, env);
      }
    }
  }
});
