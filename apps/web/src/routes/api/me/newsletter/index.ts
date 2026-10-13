import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { choiceResponse } from "../../../../server/newsletter/routes.ts";

/* GET: whether the account gets the newsletter. PUT {subscribed}: Settings' switch. */
export const Route = createFileRoute("/api/me/newsletter/")({
  server: { handlers: { ANY: ({ request }) => choiceResponse(request, env) } }
});
