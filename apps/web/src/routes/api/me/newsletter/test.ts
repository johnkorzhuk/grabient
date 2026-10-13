import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { testResponse } from "../../../../server/newsletter/routes.ts";

/* POST: an admin sends the newest issue to their own address. */
export const Route = createFileRoute("/api/me/newsletter/test")({
  server: { handlers: { ANY: ({ request }) => testResponse(request, env) } }
});
