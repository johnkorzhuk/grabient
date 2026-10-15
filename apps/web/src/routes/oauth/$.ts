import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";

/* The authorization server for connected apps: registration, the authorization page, the consent's answer and the
   token endpoint. */
export const Route = createFileRoute("/oauth/$")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { handleOAuth } = await import("../../server/oauth/routes.ts");
        return handleOAuth(request, env, { waitUntil });
      }
    }
  }
});
