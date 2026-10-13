import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { fileAnswer } from "../../../server/files/palette-files.ts";

// An account's collection as Photoshop gradients.
export const Route = createFileRoute("/@{$handle}/{$slug}.grd/")({
  server: { handlers: { GET: ({ request }) => fileAnswer(request, env, "grd") } }
});
