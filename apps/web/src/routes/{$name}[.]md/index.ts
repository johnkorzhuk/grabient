import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { markdownFile } from "../../server/seo/markdown.ts";
import { markdownReads } from "../../server/seo/markdown-reads.ts";
import { publicOrigin } from "../../server/seo/site.ts";

/* A palette or a public collection as Markdown. An index route, as /$id/ is, or that one would take these addresses. */
export const Route = createFileRoute("/{$name}.md/")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        markdownFile(params.name, request, publicOrigin(env, request), markdownReads(env))
    }
  }
});
