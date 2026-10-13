import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { pngAnswer } from "../../../server/images/answers.ts";

// A palette's picture, as /{seed}.png.
export const Route = createFileRoute("/api/png/")({
  server: { handlers: { GET: ({ request }) => pngAnswer(request, env, waitUntil) } }
});
