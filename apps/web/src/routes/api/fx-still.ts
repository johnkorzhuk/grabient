import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";

// A vector effect's still as a picture, which a page's first screen and a list's cards show where its kind has one
// (server/fx-still.ts, features/editor/FxArt.tsx), as WebP. Its drawing and its encoder load with the first one an
// isolate is asked for.
export const Route = createFileRoute("/api/fx-still")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import("../../server/images/fx-picture.ts")).fxPictureAnswer(request, env, waitUntil)
    }
  }
});
