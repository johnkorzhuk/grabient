import { createFileRoute } from "@tanstack/solid-router";
import { json } from "../../lib/responses.ts";
import { freshFor, listQueryOf, listTtl, publicList } from "../../server/gallery/lists.ts";

/* A page of a palette list, for anyone: `sort` popular, rising, newest or oldest, Rising's `frame` (3m or 1y), `page`
   and `limit` (12 to 96). It reads the list's own record, shared with the list's pages in every view, so the edge
   cache keeps no copy of it apart. */
export const Route = createFileRoute("/api/palettes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const query = listQueryOf(new URL(request.url).searchParams);
        const answer = await publicList(request, query);
        if ("refused" in answer) {
          return json({ error: answer.refused }, { status: 429, headers: { "Retry-After": "60" } });
        }
        return json(answer.page, { headers: freshFor(answer.page.fetchedAt, listTtl(query.sort)) });
      }
    }
  }
});
