import { Hono } from "hono";
import * as v from "valibot";
import { drizzle } from "drizzle-orm/d1";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { AMBIGUITY_LEVELS, palettes, pairs, queries, VERDICTS } from "@/db/schema";
import { LEASE_TTL_MS } from "./caption";

export const APPROVE_SCORE = 7;

const leaseBodySchema = v.object({
  runId: v.nullish(v.string()),
  limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(50))),
});

const submitBodySchema = v.object({
  runId: v.nullish(v.string()),
  results: v.pipe(
    v.array(
      v.object({
        queryId: v.string(),
        seed: v.string(),
        score: v.pipe(v.number(), v.minValue(0), v.maxValue(10)),
        verdict: v.picklist(VERDICTS),
        ambiguity: v.optional(v.picklist(AMBIGUITY_LEVELS)),
        notes: v.optional(v.string()),
      }),
    ),
    v.minLength(1),
    v.maxLength(50),
  ),
});

export const judgeRoutes = new Hono<{ Bindings: Env }>()
  .post("/lease", async (c) => {
    const body = v.safeParse(leaseBodySchema, await c.req.json());
    if (!body.success) {
      return c.json({ error: "invalid body", issues: body.issues }, 400);
    }
    const limit = body.output.limit ?? 20;
    const runId = body.output.runId ?? "unknown";
    const db = drizzle(c.env.DB);
    const cutoff = Date.now() - LEASE_TTL_MS;

    const rows = await db
      .select({
        queryId: pairs.queryId,
        seed: pairs.paletteSeed,
        queryText: queries.text,
        coeffs: palettes.coeffs,
        hexStops: palettes.hexStops,
        tags: palettes.tags,
      })
      .from(pairs)
      .innerJoin(queries, eq(pairs.queryId, queries.id))
      .innerJoin(palettes, eq(pairs.paletteSeed, palettes.seed))
      .where(
        and(
          eq(pairs.status, "pending"),
          sql`${palettes.status} != 'rejected'`,
          or(isNull(pairs.lockedAt), lt(pairs.lockedAt, cutoff)),
        ),
      )
      .limit(limit);

    const now = Date.now();
    for (const row of rows) {
      await db
        .update(pairs)
        .set({ lockedAt: now, lockedBy: runId })
        .where(and(eq(pairs.queryId, row.queryId), eq(pairs.paletteSeed, row.seed)));
    }
    return c.json({ pairs: rows });
  })
  .post("/submit", async (c) => {
    const body = v.safeParse(submitBodySchema, await c.req.json());
    if (!body.success) {
      return c.json({ error: "invalid body", issues: body.issues }, 400);
    }
    const db = drizzle(c.env.DB);
    const now = Date.now();
    let scored = 0;
    let approvedPalettes = 0;
    let rejectedPalettes = 0;

    for (const result of body.output.results) {
      await db
        .update(pairs)
        .set({
          status: "scored",
          score: result.score,
          verdict: result.verdict,
          ambiguity: result.ambiguity ?? null,
          judgeNotes: result.notes ?? null,
          judgedAt: now,
          lockedAt: null,
          lockedBy: null,
        })
        .where(
          and(eq(pairs.queryId, result.queryId), eq(pairs.paletteSeed, result.seed)),
        );
      scored++;

      if (result.verdict === "bad-palette") {
        // The palette itself is broken: reject it and every other pending pair
        // that references it.
        await db
          .update(palettes)
          .set({
            status: "rejected",
            rejectReason: result.notes ?? "judge: bad-palette",
            updatedAt: now,
          })
          .where(eq(palettes.seed, result.seed));
        await db
          .update(pairs)
          .set({ status: "rejected", judgedAt: now })
          .where(
            and(eq(pairs.paletteSeed, result.seed), eq(pairs.status, "pending")),
          );
        rejectedPalettes++;
      } else if (result.verdict === "ok" && result.score >= APPROVE_SCORE) {
        const updated = await db
          .update(palettes)
          .set({ status: "approved", updatedAt: now })
          .where(and(eq(palettes.seed, result.seed), eq(palettes.status, "draft")))
          .returning({ seed: palettes.seed });
        approvedPalettes += updated.length;
      }
    }

    return c.json({ scored, approvedPalettes, rejectedPalettes });
  })
  // Audit promotion: flag independently re-confirmed pairs as golden eval-set
  // members. Only scored, verdict-ok pairs are eligible.
  .post("/golden", async (c) => {
    const schema = v.object({
      runId: v.nullish(v.string()),
      pairs: v.pipe(
        v.array(v.object({ queryId: v.string(), seed: v.string() })),
        v.minLength(1),
        v.maxLength(50),
      ),
    });
    const body = v.safeParse(schema, await c.req.json());
    if (!body.success) {
      return c.json({ error: "invalid body", issues: body.issues }, 400);
    }
    const db = drizzle(c.env.DB);
    let promoted = 0;
    for (const p of body.output.pairs) {
      const updated = await db
        .update(pairs)
        .set({ golden: true })
        .where(
          and(
            eq(pairs.queryId, p.queryId),
            eq(pairs.paletteSeed, p.seed),
            eq(pairs.status, "scored"),
            eq(pairs.verdict, "ok"),
          ),
        )
        .returning({ queryId: pairs.queryId });
      promoted += updated.length;
    }
    return c.json({ promoted, submitted: body.output.pairs.length });
  })
  // Random already-scored sample for the audit skill to re-judge blind.
  .get("/audit/sample", async (c) => {
    const n = Math.min(50, Number(c.req.query("n") ?? 20));
    const db = drizzle(c.env.DB);
    const rows = await db
      .select({
        queryId: pairs.queryId,
        seed: pairs.paletteSeed,
        queryText: queries.text,
        coeffs: palettes.coeffs,
        hexStops: palettes.hexStops,
        tags: palettes.tags,
        storedScore: pairs.score,
        storedVerdict: pairs.verdict,
      })
      .from(pairs)
      .innerJoin(queries, eq(pairs.queryId, queries.id))
      .innerJoin(palettes, eq(pairs.paletteSeed, palettes.seed))
      .where(eq(pairs.status, "scored"))
      .orderBy(sql`random()`)
      .limit(n);
    return c.json({ pairs: rows });
  });
