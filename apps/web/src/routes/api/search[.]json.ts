import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { searchJsonResponse } from "../../server/search/routes.ts";

// The public search as JSON: a list's search reads its pool of palettes here.
export const Route = createFileRoute("/api/search.json")({
  server: { handlers: { GET: ({ request }) => searchJsonResponse(request, env, { waitUntil }) } }
});
