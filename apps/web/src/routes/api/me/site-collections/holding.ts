import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { siteAnswer } from "../../../../server/collections/me.ts";

/* Which of Grabient's collections hold the palettes at hand. */
export const Route = createFileRoute("/api/me/site-collections/holding")({
  server: { handlers: { ANY: ({ request }) => siteAnswer(request, env) } }
});
