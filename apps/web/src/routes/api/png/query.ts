import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { searchPictureAnswer } from "../../../server/images/answers.ts";

// A search's palettes as one picture.
export const Route = createFileRoute("/api/png/query")({
  server: {
    handlers: { GET: ({ request }) => searchPictureAnswer(request, env, waitUntil, false) }
  }
});
