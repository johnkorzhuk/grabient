import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { embedAnswer } from "../../server/files/embed.ts";

// A palette's animated blob as a script any page embeds.
export const Route = createFileRoute("/{$seed}.js/")({
  server: { handlers: { GET: ({ request }) => embedAnswer(request, env) } }
});
