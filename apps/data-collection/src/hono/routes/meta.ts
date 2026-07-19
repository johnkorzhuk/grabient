import { Hono } from "hono";
import * as v from "valibot";
import { drizzle } from "drizzle-orm/d1";
import { desc, eq, sql } from "drizzle-orm";
import { buildCoverageReport } from "@/lib/coverage";
import { exportSft, exportDpo, exportEval } from "@/lib/exporter";
import { palettes, pairs, queries, runs } from "@/db/schema";
import { recomputeTags } from "@/lib/features";
import { embedQuery } from "@/lib/embeddings";
import { gt, asc } from "drizzle-orm";

const embedBodySchema = v.object({
  texts: v.pipe(
    v.array(v.pipe(v.string(), v.minLength(2), v.maxLength(200))),
    v.minLength(1),
    v.maxLength(32),
  ),
});

const runBodySchema = v.object({
  id: v.string(),
  mode: v.string(),
  target: v.optional(v.record(v.string(), v.unknown())),
});

const runPatchSchema = v.object({
  status: v.picklist(["done", "failed"]),
  stats: v.optional(v.record(v.string(), v.number())),
});

async function countBy<T extends string>(
  db: ReturnType<typeof drizzle>,
  table: typeof palettes | typeof pairs,
  column: "status",
): Promise<Record<T, number>> {
  const rows = await db
    .select({ key: table[column], count: sql<number>`count(*)` })
    .from(table)
    .groupBy(table[column]);
  return Object.fromEntries(rows.map((r) => [r.key, r.count])) as Record<T, number>;
}

export const metaRoutes = new Hono<{ Bindings: Env }>()
  .get("/stats", async (c) => {
    const db = drizzle(c.env.DB);
    const [paletteCounts, pairCounts, queryCount, avgScore, lastRun] =
      await Promise.all([
        countBy(db, palettes, "status"),
        countBy(db, pairs, "status"),
        db.select({ count: sql<number>`count(*)` }).from(queries),
        db
          .select({ avg: sql<number>`avg(${pairs.score})` })
          .from(pairs)
          .where(eq(pairs.status, "scored")),
        db.select().from(runs).orderBy(desc(runs.startedAt)).limit(1),
      ]);
    return c.json({
      palettes: paletteCounts,
      pairs: pairCounts,
      queries: queryCount[0]?.count ?? 0,
      avgScore: avgScore[0]?.avg ?? null,
      lastRun: lastRun[0] ?? null,
    });
  })
  .get("/coverage", async (c) => {
    return c.json(await buildCoverageReport(c.env));
  })
  .post("/runs", async (c) => {
    const body = v.safeParse(runBodySchema, await c.req.json());
    if (!body.success) {
      return c.json({ error: "invalid body", issues: body.issues }, 400);
    }
    const db = drizzle(c.env.DB);
    await db
      .insert(runs)
      .values({
        id: body.output.id,
        mode: body.output.mode,
        target: body.output.target ?? null,
        startedAt: Date.now(),
      })
      .onConflictDoNothing();
    return c.json({ id: body.output.id });
  })
  .patch("/runs/:id", async (c) => {
    const body = v.safeParse(runPatchSchema, await c.req.json());
    if (!body.success) {
      return c.json({ error: "invalid body", issues: body.issues }, 400);
    }
    const db = drizzle(c.env.DB);
    await db
      .update(runs)
      .set({
        status: body.output.status,
        stats: body.output.stats ?? null,
        finishedAt: Date.now(),
      })
      .where(eq(runs.id, c.req.param("id")));
    return c.json({ ok: true });
  })
  // One-off, idempotent, cursor-paged: rewrites every palette's tags from
  // stored coeffs/hexStops so pre-harmony rows gain harmony tags. Rows with
  // no detectable harmony are legitimately rewritten to the same tag set.
  .post("/backfill/harmony", async (c) => {
    const limit = Math.min(
      500,
      Math.max(1, parseInt(c.req.query("limit") ?? "300", 10) || 300),
    );
    const cursor = c.req.query("cursor") ?? "";
    const db = drizzle(c.env.DB);
    const rows = await db
      .select({
        seed: palettes.seed,
        coeffs: palettes.coeffs,
        hexStops: palettes.hexStops,
      })
      .from(palettes)
      .where(gt(palettes.seed, cursor))
      .orderBy(asc(palettes.seed))
      .limit(limit);
    if (rows.length === 0) {
      return c.json({ updated: 0, remaining: 0, cursor: null });
    }
    const statements = rows.map((row) =>
      db
        .update(palettes)
        .set({ tags: recomputeTags(row.coeffs, row.hexStops) })
        .where(eq(palettes.seed, row.seed)),
    );
    await db.batch(
      statements as [(typeof statements)[number], ...typeof statements],
    );
    const next = rows[rows.length - 1]!.seed;
    const remaining = await db
      .select({ count: sql<number>`count(*)` })
      .from(palettes)
      .where(gt(palettes.seed, next));
    return c.json({
      updated: rows.length,
      remaining: remaining[0]?.count ?? 0,
      cursor: next,
    });
  })
  // Embedding probe for dedup validation (harness/dedup-probe.ts). Authed
  // like everything else; capped small — this is a diagnostic, not an API.
  .post("/debug/embed", async (c) => {
    const body = v.safeParse(embedBodySchema, await c.req.json());
    if (!body.success) {
      return c.json({ error: "invalid body", issues: body.issues }, 400);
    }
    const vectors: number[][] = [];
    for (const text of body.output.texts) {
      vectors.push(await embedQuery(c.env, text));
    }
    return c.json({ vectors });
  })
  .post("/export", async (c) => {
    const format = c.req.query("format") ?? "sft";
    if (format !== "sft" && format !== "dpo" && format !== "eval") {
      return c.json({ error: "format must be sft, dpo, or eval" }, 400);
    }
    const result =
      format === "sft"
        ? await exportSft(c.env)
        : format === "dpo"
          ? await exportDpo(c.env)
          : await exportEval(c.env);
    return c.json(result);
  });
