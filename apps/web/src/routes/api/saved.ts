import { env } from "cloudflare:workers";
import { msg } from "@grabient/i18n";
import { getSession } from "@grabient/server/auth/session.ts";
import { checkLimits } from "@grabient/server/limits/check.ts";
import { createFileRoute } from "@tanstack/solid-router";
import { json } from "../../lib/responses.ts";
import { listWords } from "../../lib/words.ts";
import { savedPage } from "../../server/gallery/likes.ts";

const int = (raw: string | null, min: number, max: number, fallback: number) => {
  const n = raw && /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  return n >= min && n <= max ? n : fallback;
};

/* A page of the signed-in account's saved palettes, newest first, or with `q` the ones that answer the words. Each
   read counts against the account's minute. */
export const Route = createFileRoute("/api/saved")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSession(env, request.headers);
        if (!session) return json({ error: msg("Sign in to continue.") }, { status: 401 });
        const limited = await checkLimits(env, [[`saved:${session.user.id}`, "savedRead"]]);
        if (!limited?.success) {
          return json(
            { error: msg("Too many requests. Try again later.") },
            { status: 429, headers: { "Retry-After": "60" } }
          );
        }
        const params = new URL(request.url).searchParams;
        return json(
          await savedPage(env, request, session.user.id, {
            page: int(params.get("page"), 1, 100_000, 1),
            limit: int(params.get("limit"), 12, 96, 24),
            words: listWords(params.get("q"))
          })
        );
      }
    }
  }
});
