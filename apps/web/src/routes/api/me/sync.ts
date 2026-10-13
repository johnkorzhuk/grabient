import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { handleSync } from "../../../server/account/sync.ts";

export const Route = createFileRoute("/api/me/sync")({
  server: { handlers: { ANY: ({ request }) => handleSync(request, env) } }
});
