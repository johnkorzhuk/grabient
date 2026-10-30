import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { seedPngAnswer } from "../../../server/images/answers.ts";

// An account's public collection as a sheet of its palettes beside its page.
export const Route = createFileRoute("/@{$handle}/{$slug}.png/")({
  server: { handlers: { GET: ({ request }) => seedPngAnswer(request, env, waitUntil) } }
});
