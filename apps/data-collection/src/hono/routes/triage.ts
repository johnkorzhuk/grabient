import { Hono } from "hono";
import * as v from "valibot";
import { drizzle } from "drizzle-orm/d1";
import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { counters, palettes, pairs, queries } from "@/db/schema";
import {
  BATCH_LIMIT,
  DAILY_AI_CALL_CAP,
  SEAT_MODELS,
  decideReject,
  parseVote,
  triagePrompt,
  type PanelVote,
} from "@/lib/triage";
import { LEASE_TTL_MS } from "./caption";

/**
 * Consensus triage over pending pairs using free Workers AI models. Invoked
 * by loop.sh ahead of judge iterations. Fail-closed by design: budget
 * exhausted, model errors, or unparseable output all mean "no rejection" and
 * the pair flows to the Opus judge unchanged.
 */

const runBodySchema = v.object({
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(BATCH_LIMIT))),
  // Testing hook: triage the newest pending pairs instead of the oldest.
  newestFirst: v.optional(v.boolean()),
});

interface AiRunner {
  run(model: string, input: unknown): Promise<unknown>;
}

function extractText(result: unknown): string {
  if (result && typeof result === "object") {
    const r = result as {
      response?: unknown;
      choices?: { message?: { content?: unknown } }[];
    };
    if (typeof r.response === "string") return r.response;
    const c = r.choices?.[0]?.message?.content;
    if (typeof c === "string") return c;
  }
  return "";
}

function todayKey(): string {
  return `triage-calls-${new Date().toISOString().slice(0, 10)}`;
}

export const triageRoutes = new Hono<{ Bindings: Env }>().post(
  "/run",
  async (c) => {
    const body = v.safeParse(runBodySchema, await c.req.json().catch(() => ({})));
    if (!body.success) {
      return c.json({ error: "invalid body", issues: body.issues }, 400);
    }
    const limit = body.output.limit ?? BATCH_LIMIT;
    const db = drizzle(c.env.DB);

    // Self-enforced budget - never trust the provider to stop us.
    const key = todayKey();
    const counter = await db
      .select({ value: counters.value })
      .from(counters)
      .where(eq(counters.key, key));
    const used = counter[0]?.value ?? 0;
    if (used >= DAILY_AI_CALL_CAP) {
      return c.json({ skipped: "daily budget reached", callsToday: used });
    }
    const budgetPairs = Math.min(
      limit,
      Math.floor((DAILY_AI_CALL_CAP - used) / SEAT_MODELS.length),
    );
    if (budgetPairs === 0) {
      return c.json({ skipped: "daily budget reached", callsToday: used });
    }

    const now = Date.now();
    const cutoff = now - LEASE_TTL_MS;
    const rows = await db
      .select({
        queryId: pairs.queryId,
        seed: pairs.paletteSeed,
        queryText: queries.text,
        hexStops: palettes.hexStops,
        tags: palettes.tags,
      })
      .from(pairs)
      .innerJoin(queries, eq(pairs.queryId, queries.id))
      .innerJoin(palettes, eq(pairs.paletteSeed, palettes.seed))
      .where(
        and(
          eq(pairs.status, "pending"),
          isNull(pairs.triageVotes),
          sql`${palettes.status} != 'rejected'`,
          or(isNull(pairs.lockedAt), lt(pairs.lockedAt, cutoff)),
        ),
      )
      .orderBy(
        body.output.newestFirst ? desc(pairs.createdAt) : asc(pairs.createdAt),
      )
      .limit(budgetPairs);

    if (rows.length === 0) {
      return c.json({ triaged: 0, rejected: 0, callsToday: used });
    }

    const ai = c.env.AI as unknown as AiRunner;
    let calls = 0;
    let rejected = 0;

    for (const row of rows) {
      const prompt = triagePrompt(row.queryText, row.hexStops, row.tags);
      const votes: PanelVote[] = [];
      for (const model of SEAT_MODELS) {
        try {
          calls++;
          const result = await ai.run(model, {
            messages: [
              { role: "system", content: prompt.system },
              {
                role: "user",
                content:
                  model.includes("qwen") ? `${prompt.user} /no_think` : prompt.user,
              },
            ],
            max_tokens: 16,
          });
          votes.push({ model, vote: parseVote(extractText(result)) });
        } catch {
          votes.push({ model, vote: "unparseable" });
        }
      }

      if (decideReject(votes)) {
        // Guard on status=pending so a raced judge submission wins.
        const updated = await db
          .update(pairs)
          .set({
            status: "rejected",
            verdict: "bad-match",
            score: 2,
            judgeNotes: "triage: unanimous bad from free-model panel",
            triageVotes: votes,
            triagedAt: now,
            judgedAt: now,
          })
          .where(
            and(
              eq(pairs.queryId, row.queryId),
              eq(pairs.paletteSeed, row.seed),
              eq(pairs.status, "pending"),
            ),
          )
          .returning({ queryId: pairs.queryId });
        rejected += updated.length;
      } else {
        await db
          .update(pairs)
          .set({ triageVotes: votes, triagedAt: now })
          .where(
            and(eq(pairs.queryId, row.queryId), eq(pairs.paletteSeed, row.seed)),
          );
      }
    }

    await db
      .insert(counters)
      .values({ key, value: calls })
      .onConflictDoUpdate({
        target: counters.key,
        set: { value: sql`${counters.value} + ${calls}` },
      });

    return c.json({
      triaged: rows.length,
      rejected,
      hinted: rows.length - rejected,
      callsToday: used + calls,
      cap: DAILY_AI_CALL_CAP,
    });
  },
);
