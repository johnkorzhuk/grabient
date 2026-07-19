import { Hono } from "hono";
import * as v from "valibot";
import { drizzle } from "drizzle-orm/d1";
import { and, asc, desc, eq, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { AMBIGUITY_LEVELS, palettes, pairs, queries, VERDICTS } from "@/db/schema";
import { LEASE_TTL_MS } from "./caption";

export const APPROVE_SCORE = 7;

const leaseBodySchema = v.object({
  runId: v.nullish(v.string()),
  limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(50))),
  // Tiered judging: "easy" = triage panel voted unanimously "good" (sonnet
  // handles these); "hard" = everything else, with easy-eligible pairs
  // ordered last as a fallback so they never starve if the easy loop is
  // down. Omitted = legacy untiered behavior.
  tier: v.optional(v.picklist(["easy", "hard"])),
});

/** Every triage seat voted "good" — no dissent, no unparseable, ≥2 votes. */
const UNANIMOUS_GOOD = sql`(
  ${pairs.triageVotes} is not null
  and json_array_length(${pairs.triageVotes}) >= 2
  and not exists (
    select 1 from json_each(${pairs.triageVotes})
    where json_extract(json_each.value, '$.vote') != 'good'
  )
)`;

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
  judgeModel: v.optional(v.picklist(["opus", "sonnet"])),
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
        style: sql<string | null>`coalesce(${pairs.styleOverride}, ${palettes.style})`,
        steps: sql<number | null>`coalesce(${pairs.stepsOverride}, ${palettes.steps})`,
        angle: sql<number | null>`coalesce(${pairs.angleOverride}, ${palettes.angle})`,
        triageVotes: pairs.triageVotes,
      })
      .from(pairs)
      .innerJoin(queries, eq(pairs.queryId, queries.id))
      .innerJoin(palettes, eq(pairs.paletteSeed, palettes.seed))
      .where(
        and(
          eq(pairs.status, "pending"),
          sql`${palettes.status} != 'rejected'`,
          or(isNull(pairs.lockedAt), lt(pairs.lockedAt, cutoff)),
          ...(body.output.tier === "easy" ? [UNANIMOUS_GOOD] : []),
        ),
      )
      // Owner-requested queries jump the queue so their results land fast.
      // Hard tier pushes easy-eligible pairs to the back instead of
      // excluding them: opus still drains them if the easy loop is down.
      .orderBy(
        desc(sql`${queries.source} = 'human'`),
        ...(body.output.tier === "hard" ? [asc(UNANIMOUS_GOOD)] : []),
        asc(pairs.createdAt),
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
          // Only overwrite attribution when the caller states it (audit
          // corrections omit it and must keep the original).
          ...(body.output.judgeModel ? { judgeModel: body.output.judgeModel } : {}),
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
            // A human veto is standing: audit cannot re-promote it.
            or(
              isNull(pairs.humanLabel),
              notInArray(pairs.humanLabel, ["not-golden", "bad-match"]),
            ),
          ),
        )
        .returning({ queryId: pairs.queryId });
      promoted += updated.length;
    }
    return c.json({ promoted, submitted: body.output.pairs.length });
  })
  // Random already-scored sample for the audit skill to re-judge blind.
  // Oversamples sonnet-judged pairs (up to half the sample) so the easy
  // tier's agreement with the opus rubric is measured continuously.
  .get("/audit/sample", async (c) => {
    const n = Math.min(50, Number(c.req.query("n") ?? 20));
    const db = drizzle(c.env.DB);
    const sampleSelect = {
      queryId: pairs.queryId,
      seed: pairs.paletteSeed,
      queryText: queries.text,
      coeffs: palettes.coeffs,
      hexStops: palettes.hexStops,
      tags: palettes.tags,
      style: sql<string | null>`coalesce(${pairs.styleOverride}, ${palettes.style})`,
      steps: sql<number | null>`coalesce(${pairs.stepsOverride}, ${palettes.steps})`,
      angle: sql<number | null>`coalesce(${pairs.angleOverride}, ${palettes.angle})`,
      storedScore: pairs.score,
      storedVerdict: pairs.verdict,
      storedJudgeModel: pairs.judgeModel,
    };
    const sonnetRows = await db
      .select(sampleSelect)
      .from(pairs)
      .innerJoin(queries, eq(pairs.queryId, queries.id))
      .innerJoin(palettes, eq(pairs.paletteSeed, palettes.seed))
      .where(and(eq(pairs.status, "scored"), eq(pairs.judgeModel, "sonnet")))
      .orderBy(sql`random()`)
      .limit(Math.ceil(n / 2));
    const restRows = await db
      .select(sampleSelect)
      .from(pairs)
      .innerJoin(queries, eq(pairs.queryId, queries.id))
      .innerJoin(palettes, eq(pairs.paletteSeed, palettes.seed))
      .where(
        and(
          eq(pairs.status, "scored"),
          or(isNull(pairs.judgeModel), sql`${pairs.judgeModel} != 'sonnet'`),
        ),
      )
      .orderBy(sql`random()`)
      .limit(n - sonnetRows.length);
    // Interleave-free shuffle so sonnet rows aren't a recognizable block.
    const rows = [...sonnetRows, ...restRows].sort(
      (a, b) => (a.seed < b.seed ? -1 : 1),
    );
    return c.json({ pairs: rows });
  });
