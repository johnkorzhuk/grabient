import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { cardAnswer } from "../../../server/images/answers.ts";

// A palette's share card.
export const Route = createFileRoute("/api/og/")({
  server: { handlers: { GET: ({ request }) => cardAnswer(request, env, waitUntil) } }
});
