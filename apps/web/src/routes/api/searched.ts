import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { searchedResponse } from "../../server/search/counts.ts";

// A search a reader made with Enter, counted for the tags. Always 204.
export const Route = createFileRoute("/api/searched")({
  server: { handlers: { ANY: ({ request }) => searchedResponse(request, env) } }
});
