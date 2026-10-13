import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { fileAnswer } from "../../server/files/palette-files.ts";

// A palette, or a public collection, as Photoshop gradients.
export const Route = createFileRoute("/{$name}.grd/")({
  server: { handlers: { GET: ({ request }) => fileAnswer(request, env, "grd") } }
});
