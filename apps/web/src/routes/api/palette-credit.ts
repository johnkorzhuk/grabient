import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { paletteCreditResponse } from "../../server/gallery/credit.ts";

// Who to credit for a palette, for its cards and its page (features/gallery/credit.ts).
export const Route = createFileRoute("/api/palette-credit")({
  server: { handlers: { GET: ({ request }) => paletteCreditResponse(request, env) } }
});
