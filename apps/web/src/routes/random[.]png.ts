import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { randomFile } from "../server/files/random.ts";
import { seedPngAnswer } from "../server/images/answers.ts";

// A random palette's picture: the one a name always draws, or a new one each time.
export const Route = createFileRoute("/random.png")({
  server: {
    handlers: {
      GET: ({ request }) =>
        randomFile(request, "png", named => seedPngAnswer(named, env, waitUntil))
    }
  }
});
