import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { searchSuggestionsResponse } from "../../server/search/tags.ts";

// The tags' first address, which whatever still asks there is answered at.
export const Route = createFileRoute("/api/popular-searches")({
  server: { handlers: { GET: ({ request }) => searchSuggestionsResponse(request, env) } }
});
