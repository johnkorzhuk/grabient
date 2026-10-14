import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { searchJsonResponse } from "../../server/search/routes.ts";

// The public search under the palette list's address: a palette's page asks here for the palettes like it.
export const Route = createFileRoute("/api/palettes_/search")({
  server: { handlers: { GET: ({ request }) => searchJsonResponse(request, env, { waitUntil }) } }
});
