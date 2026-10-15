import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { leadResponse } from "../../../../server/newsletter/routes.ts";

/* GET ?issue=&seed=&lang=: an issue's sheet led by a palette it offers; POST { issue, seed }: an admin's choice of lead. */
export const Route = createFileRoute("/api/me/newsletter/lead")({
  server: { handlers: { ANY: ({ request }) => leadResponse(request, env) } }
});
