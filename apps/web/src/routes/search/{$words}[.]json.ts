import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { searchJsonResponse } from "../../server/search/routes.ts";

// The public search as JSON, by the words in its address: hyphens are spaces, and a palette's seed is itself.
export const Route = createFileRoute("/search/{$words}.json")({
  server: { handlers: { GET: ({ request }) => searchJsonResponse(request, env, { waitUntil }) } }
});
