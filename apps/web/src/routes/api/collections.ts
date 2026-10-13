import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { PAGE } from "../../lib/cache.ts";
import { json } from "../../lib/responses.ts";
import { listWords } from "../../lib/words.ts";
import { publicCollections } from "../../server/gallery/seams.ts";

/* Stands in for the collections list's API (U04) until that area lands: the pages the home's feed joins beneath its
   first, in the hot order, or searched, the popular one. */
export const Route = createFileRoute("/api/collections")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const page = Math.max(1, Math.min(10_000, Number(params.get("page")) || 1));
        const query = listWords(params.get("q"));
        return json(
          await publicCollections(env, {
            query,
            sort: params.get("sort") === "hot" ? "hot" : "popular",
            page,
            limit: 24
          }),
          { headers: PAGE }
        );
      }
    }
  }
});
