import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { accountSearchResponse } from "../../../server/search/account.ts";

/* GET ?q=&limit=&sort=: a signed-in account's search, within its own allowance. */
export const Route = createFileRoute("/api/me/search")({
  server: { handlers: { ANY: ({ request }) => accountSearchResponse(request, env, { waitUntil }) } }
});
