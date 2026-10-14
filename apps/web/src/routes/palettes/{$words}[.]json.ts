import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { searchJsonResponse } from "../../server/search/routes.ts";

// The public search as JSON, by the words in its address under the palette list's.
export const Route = createFileRoute("/palettes/{$words}.json")({
  server: { handlers: { GET: ({ request }) => searchJsonResponse(request, env, { waitUntil }) } }
});
