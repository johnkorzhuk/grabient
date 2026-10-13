import { msg } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { json } from "../../lib/responses.ts";

/* An API address no route answers, whatever the method: JSON, never a page. */
export const Route = createFileRoute("/api/$")({
  server: { handlers: { ANY: () => json({ error: msg("Not found") }, { status: 404 }) } }
});
