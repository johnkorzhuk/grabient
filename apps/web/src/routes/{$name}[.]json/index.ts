import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { fileAnswer } from "../../server/files/palette-files.ts";

// A palette's JSON, or its design tokens at .tokens.json.
export const Route = createFileRoute("/{$name}.json/")({
  server: { handlers: { GET: ({ request }) => fileAnswer(request, env, "json") } }
});
