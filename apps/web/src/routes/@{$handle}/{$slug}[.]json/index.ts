import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { fileAnswer } from "../../../server/files/palette-files.ts";

// An account's collection as design tokens, at .tokens.json.
export const Route = createFileRoute("/@{$handle}/{$slug}.json/")({
  server: { handlers: { GET: ({ request }) => fileAnswer(request, env, "json") } }
});
