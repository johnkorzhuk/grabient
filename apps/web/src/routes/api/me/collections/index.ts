import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { mineAnswer } from "../../../../server/collections/me.ts";

/* The account's own collections. */
export const Route = createFileRoute("/api/me/collections/")({
  server: { handlers: { ANY: ({ request }) => mineAnswer(request, env, { waitUntil }) } }
});
