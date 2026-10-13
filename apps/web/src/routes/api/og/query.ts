import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { searchPictureAnswer } from "../../../server/images/answers.ts";

// A search's share card.
export const Route = createFileRoute("/api/og/query")({
  server: { handlers: { GET: ({ request }) => searchPictureAnswer(request, env, waitUntil, true) } }
});
