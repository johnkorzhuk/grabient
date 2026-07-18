import { Hono } from "hono";
import * as v from "valibot";
import { drizzle } from "drizzle-orm/d1";
import { and, count, desc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { ingestQuery } from "@/lib/query-ingest";
import {
  HUMAN_LABELS,
  QUERY_CATEGORIES,
  palettes,
  pairs,
  queries,
} from "@/db/schema";

/**
 * Owner feedback from the dashboard. Human weight is heavy but not absolute:
 * negative labels are removals (exclusions), 'good' up-weights training,
 * 'golden' curates the eval set. pairs.human_label is the export-level source
 * of truth; pair status writes here are only a judge-queue optimization (the
 * judge loop holds leases and can overwrite status, never the label).
 */

const pairBodySchema = v.object({
  queryId: v.string(),
  seed: v.string(),
  action: v.picklist([...HUMAN_LABELS, "clear"]),
});

const paletteBodySchema = v.object({
  seed: v.string(),
  action: v.picklist(["reject", "restore"]),
});

const queriesBodySchema = v.object({
  texts: v.pipe(v.array(v.pipe(v.string(), v.trim(), v.minLength(2))), v.minLength(1), v.maxLength(20)),
  category: v.optional(v.picklist(QUERY_CATEGORIES)),
});

export const feedbackRoutes = new Hono<{ Bindings: Env }>()
  .post("/pair", async (c) => {
    const body = v.safeParse(pairBodySchema, await c.req.json());
    if (!body.success) {
      return c.json({ error: "invalid body", issues: body.issues }, 400);
    }
    const { queryId, seed, action } = body.output;
    const db = drizzle(c.env.DB);
    const now = Date.now();
    const where = and(eq(pairs.queryId, queryId), eq(pairs.paletteSeed, seed));

    const patch =
      action === "golden"
        ? { humanLabel: "golden" as const, humanAt: now, golden: true }
        : action === "not-golden"
          ? { humanLabel: "not-golden" as const, humanAt: now, golden: false }
          : action === "clear"
            ? { humanLabel: null, humanAt: null }
            : { humanLabel: action, humanAt: now };

    const updated = await db
      .update(pairs)
      .set(patch)
      .where(where)
      .returning({ humanLabel: pairs.humanLabel, golden: pairs.golden });
    if (updated.length === 0) return c.json({ error: "pair not found" }, 404);

    if (action === "bad-match") {
      // Stop wasting judge tokens on it; the label alone already excludes it
      // from every export even if a leased judge later overwrites status.
      await db
        .update(pairs)
        .set({ status: "rejected", judgedAt: now })
        .where(and(where, eq(pairs.status, "pending")));
    } else if (action === "clear") {
      // Undo a bad-match demotion (collateral discriminator: never judged).
      await db
        .update(pairs)
        .set({ status: "pending", judgedAt: null })
        .where(and(where, eq(pairs.status, "rejected"), isNull(pairs.score)));
    }

    return c.json({
      ok: true,
      humanLabel: updated[0]!.humanLabel,
      golden: updated[0]!.golden,
    });
  })
  .post("/palette", async (c) => {
    const body = v.safeParse(paletteBodySchema, await c.req.json());
    if (!body.success) {
      return c.json({ error: "invalid body", issues: body.issues }, 400);
    }
    const { seed, action } = body.output;
    const db = drizzle(c.env.DB);
    const now = Date.now();

    if (action === "reject") {
      const updated = await db
        .update(palettes)
        .set({ status: "rejected", rejectReason: "human", updatedAt: now })
        .where(eq(palettes.seed, seed))
        .returning({ seed: palettes.seed });
      if (updated.length === 0) return c.json({ error: "unknown seed" }, 404);
      const demoted = await db
        .update(pairs)
        .set({ status: "rejected", judgedAt: now })
        .where(and(eq(pairs.paletteSeed, seed), eq(pairs.status, "pending")))
        .returning({ queryId: pairs.queryId });
      return c.json({ ok: true, status: "rejected", rejectedPairs: demoted.length });
    }

    // restore - the human override; works on judge-rejected palettes too.
    const approved = await db
      .select({ n: count() })
      .from(pairs)
      .where(
        and(
          eq(pairs.paletteSeed, seed),
          eq(pairs.status, "scored"),
          eq(pairs.verdict, "ok"),
          sql`${pairs.score} >= 7`,
        ),
      );
    const status = (approved[0]?.n ?? 0) > 0 ? ("approved" as const) : ("draft" as const);
    const updated = await db
      .update(palettes)
      .set({ status, rejectReason: null, updatedAt: now })
      .where(eq(palettes.seed, seed))
      .returning({ seed: palettes.seed });
    if (updated.length === 0) return c.json({ error: "unknown seed" }, 404);
    // Revive collaterally rejected pairs (never individually judged) unless
    // the human vetoed that specific pair.
    const revived = await db
      .update(pairs)
      .set({ status: "pending", judgedAt: null })
      .where(
        and(
          eq(pairs.paletteSeed, seed),
          eq(pairs.status, "rejected"),
          isNull(pairs.score),
          or(isNull(pairs.humanLabel), sql`${pairs.humanLabel} != 'bad-match'`),
        ),
      )
      .returning({ queryId: pairs.queryId });
    return c.json({ ok: true, status, revivedPairs: revived.length });
  })
  .get("/summary", async (c) => {
    const db = drizzle(c.env.DB);
    const [labelCounts, disagreeRows] = await Promise.all([
      db
        .select({ label: pairs.humanLabel, n: count() })
        .from(pairs)
        .where(isNotNull(pairs.humanLabel))
        .groupBy(pairs.humanLabel),
      db
        .select({
          queryId: pairs.queryId,
          seed: pairs.paletteSeed,
          queryText: queries.text,
          score: pairs.score,
          verdict: pairs.verdict,
          humanLabel: pairs.humanLabel,
          judgeNotes: pairs.judgeNotes,
          humanAt: pairs.humanAt,
        })
        .from(pairs)
        .innerJoin(queries, eq(pairs.queryId, queries.id))
        .where(and(isNotNull(pairs.humanLabel), eq(pairs.status, "scored")))
        .orderBy(desc(pairs.humanAt))
        .limit(100),
    ]);
    const counts = Object.fromEntries(labelCounts.map((r) => [r.label, r.n]));
    const humanBadJudgeHigh = disagreeRows.filter(
      (r) => r.humanLabel === "bad-match" && (r.score ?? 0) >= 7 && r.verdict === "ok",
    ).length;
    const humanGoodJudgeLow = disagreeRows.filter(
      (r) => r.humanLabel === "good" && ((r.score ?? 0) < 7 || r.verdict !== "ok"),
    ).length;
    return c.json({
      counts,
      disagreements: { humanBadJudgeHigh, humanGoodJudgeLow, rows: disagreeRows },
    });
  })
  .post("/queries", async (c) => {
    const body = v.safeParse(queriesBodySchema, await c.req.json());
    if (!body.success) {
      return c.json({ error: "invalid body", issues: body.issues }, 400);
    }
    const category = body.output.category ?? "abstract";
    const results = [];
    for (const text of body.output.texts) {
      const outcome = await ingestQuery(c.env, { text, category }, "human", null);
      results.push({ text, ...outcome });
    }
    return c.json({ results });
  })
  // Human-authored queries the generation loop should service next: fewer
  // than 2 pairs so far, newest first.
  .get("/queries/wanted", async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await db
      .select({
        id: queries.id,
        text: queries.text,
        category: queries.category,
        pairCount: count(pairs.paletteSeed),
      })
      .from(queries)
      .leftJoin(pairs, eq(pairs.queryId, queries.id))
      .where(and(eq(queries.source, "human"), eq(queries.status, "active")))
      .groupBy(queries.id)
      .having(lt(count(pairs.paletteSeed), 2))
      .orderBy(desc(queries.createdAt))
      .limit(10);
    return c.json({ queries: rows });
  });
