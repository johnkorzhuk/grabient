import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { seedPngAnswer } from "../../server/images/answers.ts";

// A palette's picture beside its page, or a public collection's sheet beside its own.
export const Route = createFileRoute("/{$seed}.png/")({
  server: { handlers: { GET: ({ request }) => seedPngAnswer(request, env, waitUntil) } }
});
