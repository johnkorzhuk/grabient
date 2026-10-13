import { createFileRoute } from "@tanstack/solid-router";
import { catalogResponse } from "./ai-catalog[.]json.ts";

/* Agentic Resource Discovery reads the AI Catalog's document at its own address. */
export const Route = createFileRoute("/.well-known/ard.json")({
  server: { handlers: { GET: ({ request }) => catalogResponse(request) } }
});
