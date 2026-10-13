import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { paletteAnswer } from "../../../../server/collections/palettes.ts";

/* An admin's curation of one gallery palette (palettes.ts lists the routes). */
export const Route = createFileRoute("/api/me/palettes/$")({
  server: { handlers: { ANY: ({ request }) => paletteAnswer(request, env) } }
});
