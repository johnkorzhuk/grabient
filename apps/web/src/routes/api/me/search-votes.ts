import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { searchVotesResponse } from "../../../server/search/votes.ts";

/* GET ?q=: the account's votes for a search. POST {q, seed, vote}: a palette's fit for it. */
export const Route = createFileRoute("/api/me/search-votes")({
  server: { handlers: { ANY: ({ request }) => searchVotesResponse(request, env) } }
});
