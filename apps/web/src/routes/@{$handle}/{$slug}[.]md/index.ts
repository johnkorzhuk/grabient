import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { markdownFile } from "../../../server/seo/markdown.ts";
import { markdownReads } from "../../../server/seo/markdown-reads.ts";
import { publicOrigin } from "../../../server/seo/site.ts";

/* An account's collection as Markdown, when it is public. */
export const Route = createFileRoute("/@{$handle}/{$slug}.md/")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        markdownFile(
          `@${params.handle}/${params.slug}`,
          request,
          publicOrigin(env, request),
          markdownReads(env)
        )
    }
  }
});
