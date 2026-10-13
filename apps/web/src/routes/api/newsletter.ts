import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { issuesResponse } from "../../server/newsletter/routes.ts";

/* GET ?before=&lang=: the newsletter's published issues, for anyone, a page at a time. */
export const Route = createFileRoute("/api/newsletter")({
  server: { handlers: { GET: ({ request }) => issuesResponse(request, env) } }
});
