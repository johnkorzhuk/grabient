import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { fileAnswer } from "../../../server/files/palette-files.ts";

// An account's public collection as a sheet of its palettes, in SVG.
export const Route = createFileRoute("/@{$handle}/{$slug}.svg/")({
  server: { handlers: { GET: ({ request }) => fileAnswer(request, env, "svg") } }
});
