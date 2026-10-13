import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { accountSearchResponse } from "../../../server/search/account.ts";

// A signed-in account's search of words the public search could not read for it.
export const Route = createFileRoute("/api/me/search")({
  server: {
    handlers: { ANY: ({ request }) => accountSearchResponse(request, env, { waitUntil }) }
  }
});
