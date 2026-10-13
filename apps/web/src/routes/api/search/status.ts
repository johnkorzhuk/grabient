import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { searchStatusResponse } from "../../../server/search/routes.ts";

// What this isolate's search answers from.
export const Route = createFileRoute("/api/search/status")({
  server: { handlers: { GET: () => searchStatusResponse(env, { waitUntil }) } }
});
