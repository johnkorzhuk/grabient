import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { searchSheetSvg } from "../../server/images/answers.ts";

// A search's sheet as SVG, by its words.
export const Route = createFileRoute("/search/{$words}.svg")({
  server: { handlers: { GET: ({ request }) => searchSheetSvg(request, env) } }
});
