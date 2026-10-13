import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { collectionsCardAnswer } from "../../../server/images/answers.ts";

// The share card of the collections list.
export const Route = createFileRoute("/api/og/collections")({
  server: { handlers: { GET: ({ request }) => collectionsCardAnswer(request, env, waitUntil) } }
});
