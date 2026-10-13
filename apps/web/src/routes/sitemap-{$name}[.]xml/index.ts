import { env } from "cloudflare:workers";
import { msg } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { json } from "../../lib/responses.ts";
import { publicOrigin } from "../../server/seo/site.ts";
import { sitemapFile, sitemapHeaders } from "../../server/seo/sitemaps.ts";

/* The sitemaps the index names: pages, searches, collections and the palette files. Any other name is no sitemap.
   An index route, as /$id/ is, or that one would take these addresses. */
export const Route = createFileRoute("/sitemap-{$name}.xml/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const body = await sitemapFile(env, params.name, publicOrigin(env, request));
        return body === null
          ? json({ error: msg("Not found") }, { status: 404 })
          : new Response(body, { headers: sitemapHeaders(params.name) });
      }
    }
  }
});
