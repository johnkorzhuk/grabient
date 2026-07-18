import { Hono } from "hono";
import * as v from "valibot";
import { drizzle } from "drizzle-orm/d1";
import { desc, eq, sql } from "drizzle-orm";
import { buildCoverageReport } from "@/lib/coverage";
import { exportSft, exportDpo } from "@/lib/exporter";
import { palettes, pairs, queries, runs } from "@/db/schema";

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
  .post("/export", async (c) => {
    const format = c.req.query("format") ?? "sft";
    if (format !== "sft" && format !== "dpo") {
      return c.json({ error: "format must be sft or dpo" }, 400);
    }
    const result =
      format === "sft" ? await exportSft(c.env) : await exportDpo(c.env);
    return c.json(result);
  });
