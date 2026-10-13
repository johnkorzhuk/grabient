import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { robotsTxt } from "../server/seo/robots.ts";
import { indexed, publicOrigin } from "../server/seo/site.ts";
import { textResponse } from "../server/seo/text.ts";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }) =>
        textResponse(robotsTxt(indexed(env), publicOrigin(env, request)), "text/plain")
    }
  }
});
