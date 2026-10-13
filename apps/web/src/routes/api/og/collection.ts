import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { collectionPictureAnswer } from "../../../server/images/answers.ts";

// A collection's share card.
export const Route = createFileRoute("/api/og/collection")({
  server: {
    handlers: { GET: ({ request }) => collectionPictureAnswer(request, env, waitUntil, true) }
  }
});
