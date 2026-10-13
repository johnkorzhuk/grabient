import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { apiJsonAnswer } from "../../server/files/palette-files.ts";

// A palette's JSON, as /{seed}.json.
export const Route = createFileRoute("/api/palette.json")({
  server: { handlers: { GET: ({ request }) => apiJsonAnswer(request, env) } }
});
