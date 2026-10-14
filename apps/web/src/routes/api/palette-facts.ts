import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { paletteFactsResponse } from "../../server/editor/facts.ts";

// What the server knows of a palette, for a page the browser opens on it (features/editor/page.ts).
export const Route = createFileRoute("/api/palette-facts")({
  server: { handlers: { GET: ({ request }) => paletteFactsResponse(request, env) } }
});
