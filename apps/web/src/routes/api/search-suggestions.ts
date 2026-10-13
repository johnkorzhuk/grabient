import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { searchSuggestionsResponse } from "../../server/search/tags.ts";

// The tags under a search field: the row at rest, or the searches that answer what is typed.
export const Route = createFileRoute("/api/search-suggestions")({
  server: { handlers: { GET: ({ request }) => searchSuggestionsResponse(request, env) } }
});
