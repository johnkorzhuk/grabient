import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { examplesCardAnswer } from "../../../server/images/answers.ts";

// A palette's examples page's share card.
export const Route = createFileRoute("/api/og/examples")({
  server: { handlers: { GET: ({ request }) => examplesCardAnswer(request, env, waitUntil) } }
});
