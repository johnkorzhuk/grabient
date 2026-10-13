import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { fileAnswer } from "../../server/files/palette-files.ts";

// A palette as a CSS file.
export const Route = createFileRoute("/{$seed}.css/")({
  server: { handlers: { GET: ({ request }) => fileAnswer(request, env, "css") } }
});
