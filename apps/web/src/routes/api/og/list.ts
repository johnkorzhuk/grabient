import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { listCardAnswer } from "../../../server/images/answers.ts";

// The share card of a palette list or the home.
export const Route = createFileRoute("/api/og/list")({
  server: { handlers: { GET: ({ request }) => listCardAnswer(request, env, waitUntil) } }
});
