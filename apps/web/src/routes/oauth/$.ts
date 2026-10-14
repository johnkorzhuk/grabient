import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { handleOAuth } from "../../server/oauth/routes.ts";

/* The authorization server for connected apps: registration, the authorization page, the consent's answer and the
   token endpoint. */
export const Route = createFileRoute("/oauth/$")({
  server: { handlers: { ANY: ({ request }) => handleOAuth(request, env, { waitUntil }) } }
});
