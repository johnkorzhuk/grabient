import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";

// A palette's fluted glass or blob as a script any page embeds; its answer loads with the first script asked for.
export const Route = createFileRoute("/{$seed}.js/")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import("../../server/files/embed.ts")).embedAnswer(request, env)
    }
  }
});
