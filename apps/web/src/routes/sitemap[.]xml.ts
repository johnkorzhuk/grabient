import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { publicOrigin } from "../server/seo/site.ts";
import { paletteShards, sitemapHeaders, sitemapIndex } from "../server/seo/sitemaps.ts";

/* The sitemaps' index: one indexed read of the highest palette rowid says how many palette files there are. */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        new Response(sitemapIndex(publicOrigin(env, request), await paletteShards(env)), {
          headers: sitemapHeaders("index")
        })
    }
  }
});
