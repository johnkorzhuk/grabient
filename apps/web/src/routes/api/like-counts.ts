import { env } from "cloudflare:workers";
import { overLimit } from "@grabient/server/auth/http.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import { createFileRoute } from "@tanstack/solid-router";
import { json } from "../../lib/responses.ts";
import { likeCounts } from "../../server/gallery/likes.ts";

/* How many likes these palettes have now (`keys`, comma separated, 96 at most): the counts a page re-reads once the
   ones its data brought are old. Never kept, since a like moves them, so an address may ask sixty times a minute. */
export const Route = createFileRoute("/api/like-counts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = await overLimit(env, [
          [`like-counts:${clientAddress(request) ?? "local"}`, "likeCounts"]
        ]);
        if (limited) return limited;
        const keys = (new URL(request.url).searchParams.get("keys") ?? "").split(",");
        return json({ counts: await likeCounts(env, keys) });
      }
    }
  }
});
