import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { searchVotesResponse } from "../../../server/search/votes.ts";

// An account's fit votes for a search's palettes: read, or cast.
export const Route = createFileRoute("/api/me/search-votes")({
  server: { handlers: { ANY: ({ request }) => searchVotesResponse(request, env) } }
});
