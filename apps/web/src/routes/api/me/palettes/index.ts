import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { likedAnswer } from "../../../../server/collections/palettes.ts";

/* Of the palettes an admin's page shows, the ones another person liked. */
export const Route = createFileRoute("/api/me/palettes/")({
  server: { handlers: { ANY: ({ request }) => likedAnswer(request, env) } }
});
