import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { fileAnswer } from "../../server/files/palette-files.ts";

// A palette, or a public collection, as Markdown.
export const Route = createFileRoute("/{$name}.md/")({
  server: { handlers: { GET: ({ request }) => fileAnswer(request, env, "md") } }
});
