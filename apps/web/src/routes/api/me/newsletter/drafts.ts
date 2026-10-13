import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { draftsResponse } from "../../../../server/newsletter/routes.ts";

/* GET ?lang=: the newsletter's drafts, an admin's alone. */
export const Route = createFileRoute("/api/me/newsletter/drafts")({
  server: { handlers: { ANY: ({ request }) => draftsResponse(request, env) } }
});
