import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { TEXT } from "../lib/cache.ts";
import { robots } from "../server/robots.ts";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }) =>
        new Response(
          robots(env.DEPLOYMENT === "production", env.PUBLIC_ORIGIN ?? new URL(request.url).origin),
          {
            headers: { ...TEXT, "Content-Type": "text/plain; charset=utf-8" }
          }
        )
    }
  }
});
