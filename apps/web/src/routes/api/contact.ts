import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { contactResponse } from "../../server/contact/contact.ts";

/* A message from the contact page, sent to the site's own address; any other method is refused there. */
export const Route = createFileRoute("/api/contact")({
  server: { handlers: { ANY: ({ request }) => contactResponse(request, env) } }
});
