import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { fileAnswer } from "../../../server/files/palette-files.ts";

// An account's public collection as CSS, a class to each palette.
export const Route = createFileRoute("/@{$handle}/{$slug}.css/")({
  server: { handlers: { GET: ({ request }) => fileAnswer(request, env, "css") } }
});
