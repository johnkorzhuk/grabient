import { env } from "cloudflare:workers";
import { msg } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { homePage } from "../../features/gallery/address.ts";
import { PAGE } from "../../lib/cache.ts";
import { json } from "../../lib/responses.ts";
import { listWords } from "../../lib/words.ts";
import { homeCollections, homeHead } from "../../server/gallery/home.ts";
import { askedLocale } from "../../server/mcp/admin/translations.ts";

/* The home as data, for anyone: its page, the hottest palettes or with `q` the best answers to the words, and the
   page of collections beneath them in the language `lang` names. With `head`, the palettes alone: the home's own page
   reads its collections as the collections list does. The edge keeps an answer by what decides it; a read it misses
   counts against the reader's address (pipeline.ts). An answer the search could not give in full is never kept, and
   says so with its status and how long to wait. */
export const Route = createFileRoute("/api/hot")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const asked = url.searchParams.get("q") ?? "";
        const words = listWords(asked);
        if (asked.trim() && !words) {
          return json({ error: msg("Invalid search query.") }, { status: 400 });
        }
        const answer = await homeHead(env, request, words);
        const page = homePage(url.searchParams);
        const collections = url.searchParams.has("head")
          ? null
          : await homeCollections(env, request, words, page, askedLocale(url));
        const kept = answer.kept && !collections?.unkept;
        return json(collections ? { page, ...answer.head, collections } : answer.head, {
          status: answer.status,
          headers: {
            ...(kept ? PAGE : {}),
            ...(answer.retryAfter ? { "Retry-After": String(answer.retryAfter) } : {})
          }
        });
      }
    }
  }
});
