import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { fileAnswer } from "../../server/files/palette-files.ts";

// A palette as SVG.
export const Route = createFileRoute("/{$seed}.svg/")({
  server: { handlers: { GET: ({ request }) => fileAnswer(request, env, "svg") } }
});
