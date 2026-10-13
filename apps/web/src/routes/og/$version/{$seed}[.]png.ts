import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { oldCardAnswer } from "../../../server/images/answers.ts";

// Where the build once wrote palettes' cards as files.
export const Route = createFileRoute("/og/$version/{$seed}.png")({
  server: { handlers: { GET: ({ request }) => oldCardAnswer(request, env, waitUntil) } }
});
