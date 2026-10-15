import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";

/* GET: whether the account gets the newsletter. PUT {subscribed}: Settings' switch. */
export const Route = createFileRoute("/api/me/newsletter/")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { choiceResponse } = await import("../../../../server/newsletter/routes.ts");
        return choiceResponse(request, env);
      }
    }
  }
});
