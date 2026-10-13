import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { searchColorsResponse } from "../../server/search/routes.ts";

// A search's colors, for its tag and the tab's icon.
export const Route = createFileRoute("/api/search-colors")({
  server: { handlers: { GET: ({ request }) => searchColorsResponse(request, env) } }
});
