import { env } from "cloudflare:workers";
import { msg } from "@grabient/i18n";
import { clientAddress } from "@grabient/server/limits/address.ts";
import { checkLimits } from "@grabient/server/limits/check.ts";
import { createFileRoute } from "@tanstack/solid-router";
import { PAGE } from "../../lib/cache.ts";
import { json } from "../../lib/responses.ts";
import { listWords } from "../../lib/words.ts";
import { homeHead } from "../../server/gallery/home.ts";

/* The head of the home, for anyone: the hottest palettes, or with `q` the best answers to the words. The edge keeps
   it by its words alone; a read it misses counts against the reader's address. An answer the search could not give
   in full is never kept, and says so with its status. */
export const Route = createFileRoute("/api/hot")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const asked = new URL(request.url).searchParams.get("q") ?? "";
        const words = listWords(asked);
        if (asked.trim() && !words) {
          return json({ error: msg("Invalid search query.") }, { status: 400 });
        }
        const missed = await checkLimits(env, [
          [`list-miss:${clientAddress(request) ?? "local"}`, "listMiss"]
        ]);
        if (!missed?.success) {
          return json(
            { error: msg("Too many requests. Try again later.") },
            { status: 429, headers: { "Retry-After": "60" } }
          );
        }
        const answer = await homeHead(env, request, words);
        return json(answer.head, {
          status: answer.status,
          headers: answer.kept && answer.status === 200 ? PAGE : {}
        });
      }
    }
  }
});
