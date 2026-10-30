import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { seedGifAnswer } from "../../server/images/answers.ts";

// A palette's animated blob as a GIF.
export const Route = createFileRoute("/{$seed}.gif/")({
  server: { handlers: { GET: ({ request }) => seedGifAnswer(request, env, waitUntil) } }
});
