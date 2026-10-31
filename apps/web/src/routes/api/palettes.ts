import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { json } from "../../lib/responses.ts";
import { listPalettes } from "../../server/gallery/list.ts";

/* A page of a palette list, for anyone: `sort` popular, rising, newest or oldest, Rising's `frame` (3m or 1y), `page`
   and `limit` (12 to 96). It reads the list's own record, shared with the list's pages in every view, so the edge
   cache keeps no copy of it apart. */
export const Route = createFileRoute("/api/palettes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // the record loads with the first list asked for, as the ceiling loads it: no first-request chunk holds it
        const { freshFor, listQueryOf, listTtl, publicList } = await import(
          "../../server/gallery/cache.ts"
        );
        const query = listQueryOf(new URL(request.url).searchParams);
        const page = await publicList(env, request, query, waitUntil, listPalettes);
        return json(page, { headers: freshFor(page.fetchedAt, listTtl(query.sort)) });
      }
    }
  }
});
