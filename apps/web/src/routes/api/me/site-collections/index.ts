import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { siteAnswer } from "../../../../server/collections/me.ts";

/* Grabient's collections, for an admin's checklist. */
export const Route = createFileRoute("/api/me/site-collections/")({
  server: { handlers: { ANY: ({ request }) => siteAnswer(request, env) } }
});
