import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { clientErrorResponse } from "../../server/client-errors/client-errors.ts";

/* An error a page met in the reader's browser, logged: always 204. */
export const Route = createFileRoute("/api/client-error")({
  server: { handlers: { ANY: ({ request }) => clientErrorResponse(request, env) } }
});
