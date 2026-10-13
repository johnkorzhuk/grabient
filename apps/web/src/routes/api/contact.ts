import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { contactResponse } from "../../server/contact/contact.ts";

/* A message from the contact page, sent to the site's own address. */
export const Route = createFileRoute("/api/contact")({
  server: { handlers: { POST: ({ request }) => contactResponse(request, env) } }
});
