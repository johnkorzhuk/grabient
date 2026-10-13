/* Whether a palette fits a search: the thumbs on every palette a page shows for words. One vote per account, palette
   and search, up or down, changed in place and taken back with null. A search is keyed by its words as every list's
   address writes them, so a page and this route agree however it was typed. An account's votes are its own: they go
   with the account, and the admins' tools read them only summed by palette.

   GET  /api/me/search-votes?q=words   the account's votes for these words, by seed
   POST /api/me/search-votes           { q, seed, vote: "up" | "down" | null }

   A vote counts against the account's fit-vote allowance, shared with collections' fit votes, and the site's day, both
   before the write. */
import { decodePalette, encodePalette } from "@grabient/engine";
import { msg } from "@grabient/i18n";
import { json, overLimit, readJson, sameOrigin } from "@grabient/server/auth/http.ts";
import { getSession } from "@grabient/server/auth/session.ts";
import { all, run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import * as v from "valibot";
import { type FitVote, SearchVoteBody } from "../../features/search/bodies.ts";
import { normalizeListQuery } from "./seams.ts";

/** the votes one account keeps for one search that a page reads back: sixty answers a page, and a reader may page on */
const OWN_MAX = 500;

async function castSearchVote(
  env: Env,
  query: string,
  seed: string,
  userId: string,
  vote: FitVote | null
) {
  if (vote === null) {
    await run(
      env.DB,
      "DELETE FROM k_search_votes WHERE query = ? AND seed = ? AND user_id = ?",
      query,
      seed,
      userId
    );
    return;
  }
  const now = Date.now();
  await run(
    env.DB,
    `INSERT INTO k_search_votes (query, seed, user_id, vote, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (query, seed, user_id) DO UPDATE SET vote = excluded.vote, updated_at = excluded.updated_at`,
    query,
    seed,
    userId,
    vote === "up" ? 1 : -1,
    now,
    now
  );
}

async function ownSearchVotes(
  env: Env,
  query: string,
  userId: string
): Promise<Record<string, FitVote>> {
  const rows = await all<{ seed: string; vote: number }>(
    env.DB,
    "SELECT seed, vote FROM k_search_votes WHERE user_id = ? AND query = ? ORDER BY updated_at DESC LIMIT ?",
    userId,
    query,
    OWN_MAX
  );
  return Object.fromEntries(rows.map(row => [row.seed, row.vote === 1 ? "up" : "down"]));
}

/** `/api/me/search-votes`: the account's votes for a search, and a vote cast. */
export async function searchVotesResponse(request: Request, env: Env): Promise<Response> {
  const { method } = request;
  if (method !== "GET" && method !== "POST") return json({ error: "Method not allowed" }, 405);
  // a write reads the session fresh, so a sign-out elsewhere counts at once
  const session = await getSession(env, request.headers, { fresh: method === "POST" });
  if (!session) return json({ error: msg("Sign in to continue.") }, 401);
  const userId = session.user.id;
  if (method === "GET") {
    const query = normalizeListQuery(new URL(request.url).searchParams.get("q"));
    return json({ votes: query ? await ownSearchVotes(env, query, userId) : {} });
  }
  if (!sameOrigin(request)) return json({ error: msg("Invalid request.") }, 403);
  const limited = await overLimit(env, [
    [`fit:${userId}`, ["fitVote", "fitVoteDaily"]],
    ["search-votes", "searchVotesSite"]
  ]);
  if (limited) return limited;
  const body = v.safeParse(SearchVoteBody, await readJson(request, 1024));
  const query = body.success ? normalizeListQuery(body.output.q) : "";
  const palette = body.success ? decodePalette(body.output.seed) : null;
  if (!body.success || !query || !palette) return json({ error: msg("Invalid vote.") }, 400);
  const seed = encodePalette(palette);
  await castSearchVote(env, query, seed, userId, body.output.vote);
  return json({ q: query, seed, vote: body.output.vote });
}
