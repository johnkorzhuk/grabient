import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { mineAt } from "../../../../server/collections/me.ts";

/* One of the account's collections, or one it reads, votes on, curates or saved (me.ts lists them). */
export const Route = createFileRoute("/api/me/collections/$")({
  server: { handlers: { ANY: ({ request }) => mineAt(request, env) } }
});
