import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { fileAnswer } from "../../../server/files/palette-files.ts";

// An account's collection as Markdown.
export const Route = createFileRoute("/@{$handle}/{$slug}.md/")({
  server: { handlers: { GET: ({ request }) => fileAnswer(request, env, "md") } }
});
