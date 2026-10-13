import { env } from "cloudflare:workers";
import { msg } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { json } from "../../lib/responses.ts";
import { indexNowKeyFile } from "../../server/seo/indexnow.ts";

/* The IndexNow key file, production's alone; any other name ending in .txt is no file here. An index route, as /$id/
   is, or that one would take these addresses. */
export const Route = createFileRoute("/{$key}.txt/")({
  server: {
    handlers: {
      GET: ({ params }) =>
        indexNowKeyFile(env, params.key) ?? json({ error: msg("Not found") }, { status: 404 })
    }
  }
});
