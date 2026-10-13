import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { collectionPictureAnswer } from "../../../server/images/answers.ts";

// A collection's palettes as one picture.
export const Route = createFileRoute("/api/png/collection")({
  server: {
    handlers: { GET: ({ request }) => collectionPictureAnswer(request, env, waitUntil, false) }
  }
});
