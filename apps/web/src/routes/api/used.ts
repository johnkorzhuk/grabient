import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { usedResponse } from "../../server/palette-use/use.ts";

/* A public palette a reader opened, copied or downloaded, counted: always 204. */
export const Route = createFileRoute("/api/used")({
  server: { handlers: { ANY: ({ request }) => usedResponse(request, env) } }
});
