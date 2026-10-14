/* `GET /api/me/search?q=&limit=&sort=`: a signed-in account's search. The words the public search could not read
   for an address are read here within the account's own allowance and the site's day of account searches, from the
   same snapshot. Never kept. */
import { msg } from "@grabient/i18n";
import { json } from "@grabient/server/auth/http.ts";
import { getSession } from "@grabient/server/auth/session.ts";
import type { Env } from "@grabient/server/env.ts";
import { sortSearch } from "../../features/gallery/sort.ts";
import { statusOf, waitOf } from "./routes.ts";
import { searchPalettes, searchRequestInput } from "./search.ts";
import type { Background } from "./snapshot.ts";

export async function accountSearchResponse(
  request: Request,
  env: Env,
  ctx?: Background
): Promise<Response> {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, { Allow: "GET" });
  const session = await getSession(env, request.headers);
  if (!session) return json({ error: msg("Sign in to continue.") }, 401);
  const { query, limit, sort } = searchRequestInput(request);
  if (!query) return json({ error: "Invalid search query." }, 400);
  const result = await searchPalettes(env, query, {
    request,
    ctx,
    limit,
    payer: { account: session.user.id }
  });
  return json(
    { ...result, items: sortSearch(result.items, sort), fetchedAt: Date.now() },
    statusOf(result),
    waitOf(result)
  );
}
