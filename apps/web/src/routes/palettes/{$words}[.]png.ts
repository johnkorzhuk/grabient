import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { searchPictureAnswer } from "../../server/images/answers.ts";

// A search's palettes as one picture, by its words.
export const Route = createFileRoute("/palettes/{$words}.png")({
  server: {
    handlers: { GET: ({ request }) => searchPictureAnswer(request, env, waitUntil, false) }
  }
});
