import { all, batch, run, type Statement } from "../../db/d1.ts";
import type { Env } from "../../env.ts";
import { isCollectionSlug, newId, normalizeListQuery } from "../site.ts";
import { actorName } from "./record.ts";

/* What the admins' connected apps keep and read beside the site itself: the log of every change one made, and the
   reviews they write as they judge palettes. */

const parse = (raw: string | null): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** One change an admin's app made, written after it succeeded. `detail` is small: counts and names. */
export async function logContribution(
  env: Pick<Env, "DB">,
  who: { userId: string; client: string },
  tool: string,
  target: string,
  detail: unknown = {}
): Promise<void> {
  await run(
    env.DB,
    "INSERT INTO k_contributions (id, actor_id, client, tool, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    newId(),
    who.userId,
    who.client.slice(0, 80),
    tool,
    target.slice(0, 200),
    JSON.stringify(detail).slice(0, 4000),
    Date.now()
  );
}

export async function listContributions(
  env: Pick<Env, "DB">,
  query: { since?: number; tool?: string; limit: number }
) {
  const where: string[] = [];
  const bind: (string | number)[] = [];
  if (query.since) {
    where.push("k.created_at > ?");
    bind.push(Math.floor(query.since));
  }
  if (query.tool) {
    where.push("k.tool = ?");
    bind.push(query.tool);
  }
  const rows = await all<{
    client: string;
    tool: string;
    target: string;
    detail: string;
    created_at: number;
    username: string | null;
    name: string | null;
  }>(
    env.DB,
    `SELECT k.client, k.tool, k.target, k.detail, k.created_at, u.username, u.name
     FROM k_contributions k LEFT JOIN auth_user u ON u.id = k.actor_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY k.created_at DESC, k.id LIMIT ?`,
    ...bind,
    query.limit
  );
  return rows.map(row => ({
    at: Number(row.created_at),
    by: actorName(row.name, row.username),
    app: row.client,
    tool: row.tool,
    target: row.target,
    detail: parse(row.detail)
  }));
}

export const VERDICTS = ["good", "bad", "unsure"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const REVIEW_NOTE_MAX = 500;
export const REVIEW_RUN_MAX = 60;

/** What a review is about, as the table keys it: the palette itself (''), its place in a collection, or its answer to
    a search. Null for a collection or a search that is not one. */
export function reviewSubject(
  about: { collection?: unknown; search?: unknown } | null | undefined
): string | null {
  if (typeof about?.collection === "string" && about.collection) {
    return isCollectionSlug(about.collection) ? `collection:${about.collection}` : null;
  }
  if (typeof about?.search === "string" && about.search) {
    const words = normalizeListQuery(about.search);
    return words ? `search:${words}` : null;
  }
  return "";
}

export interface ReviewInput {
  seed: string;
  subject: string;
  verdict: Verdict;
  note: string;
}
export interface Review extends ReviewInput {
  run: string;
  by: string;
  at: number;
}

/** Writes reviews: one per palette and subject, the last one standing, its time moved up. */
export async function markReviews(
  env: Pick<Env, "DB">,
  reviewerId: string,
  runName: string,
  reviews: readonly ReviewInput[]
): Promise<number> {
  const now = Date.now();
  for (let at = 0; at < reviews.length; at += 50) {
    await batch(
      env.DB,
      reviews.slice(at, at + 50).map(
        (review): Statement => [
          `INSERT INTO k_reviews (seed, subject, verdict, note, run, reviewer_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(seed, subject) DO UPDATE SET verdict = excluded.verdict, note = excluded.note, run = excluded.run,
             reviewer_id = excluded.reviewer_id, updated_at = excluded.updated_at`,
          review.seed,
          review.subject,
          review.verdict,
          review.note,
          runName,
          reviewerId,
          now,
          now
        ]
      )
    );
  }
  return reviews.length;
}

interface ReviewRow {
  seed: string;
  subject: string;
  verdict: Verdict;
  note: string;
  run: string;
  updated_at: number;
  username: string | null;
  name: string | null;
}
const reviewOf = (row: ReviewRow): Review => ({
  seed: row.seed,
  subject: row.subject,
  verdict: row.verdict,
  note: row.note,
  run: row.run,
  by: actorName(row.name, row.username),
  at: Number(row.updated_at)
});
const REVIEWS =
  "SELECT r.seed, r.subject, r.verdict, r.note, r.run, r.updated_at, u.username, u.name FROM k_reviews r LEFT JOIN auth_user u ON u.id = r.reviewer_id";

export async function listReviews(
  env: Pick<Env, "DB">,
  query: {
    subject?: string;
    verdict?: Verdict;
    run?: string;
    since?: number;
    limit: number;
    offset: number;
  }
): Promise<Review[]> {
  const where: string[] = [];
  const bind: (string | number)[] = [];
  if (query.subject !== undefined) {
    where.push("r.subject = ?");
    bind.push(query.subject);
  }
  if (query.verdict) {
    where.push("r.verdict = ?");
    bind.push(query.verdict);
  }
  if (query.run) {
    where.push("r.run = ?");
    bind.push(query.run);
  }
  if (query.since) {
    where.push("r.updated_at > ?");
    bind.push(Math.floor(query.since));
  }
  const rows = await all<ReviewRow>(
    env.DB,
    `${REVIEWS} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY r.updated_at DESC, r.seed LIMIT ? OFFSET ?`,
    ...bind,
    query.limit,
    query.offset
  );
  return rows.map(reviewOf);
}

/** Every review of these palettes, by seed. */
export async function reviewsOf(
  env: Pick<Env, "DB">,
  seeds: readonly string[]
): Promise<Map<string, Review[]>> {
  const found = new Map<string, Review[]>();
  if (!seeds.length) return found;
  const rows = await all<ReviewRow>(
    env.DB,
    `${REVIEWS} WHERE r.seed IN (SELECT value FROM json_each(?)) ORDER BY r.updated_at DESC`,
    JSON.stringify(seeds)
  );
  for (const row of rows) found.set(row.seed, [...(found.get(row.seed) ?? []), reviewOf(row)]);
  return found;
}
