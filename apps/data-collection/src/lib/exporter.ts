import { drizzle } from "drizzle-orm/d1";
import { and, eq, gte, sql } from "drizzle-orm";
import { pairs, queries, palettes, exports as exportsTable } from "@/db/schema";

export const MIN_SFT_SCORE = 7;
export const MIN_DPO_GAP = 3;

/** Deterministic split by query id so every pair of a query lands in the same
 * split and re-exports are stable: 90/5/5 train/val/test. */
export function splitFor(queryId: string): "train" | "val" | "test" {
  let hash = 5381;
  for (let i = 0; i < queryId.length; i++) {
    hash = ((hash << 5) + hash + queryId.charCodeAt(i)) | 0;
  }
  const bucket = ((hash % 100) + 100) % 100;
  if (bucket < 90) return "train";
  if (bucket < 95) return "val";
  return "test";
}

interface ScoredPair {
  queryId: string;
  queryText: string;
  category: string;
  styleHint: string | null;
  seed: string;
  coeffs: number[];
  tags: string[];
  source: string;
  score: number;
  ambiguity: string | null;
  style: string | null;
  steps: number | null;
  angle: number | null;
}

/** Per-coefficient mean/std/min/max over the exported rows, stored in the
 * export manifest for training-time normalization. */
function coeffStats(rows: Array<{ coeffs: number[] }>) {
  if (rows.length === 0) return null;
  const dims = 12;
  const stats = Array.from({ length: dims }, () => ({
    mean: 0,
    std: 0,
    min: Infinity,
    max: -Infinity,
  }));
  for (const row of rows) {
    for (let i = 0; i < dims; i++) {
      const value = row.coeffs[i] ?? 0;
      stats[i]!.mean += value;
      stats[i]!.min = Math.min(stats[i]!.min, value);
      stats[i]!.max = Math.max(stats[i]!.max, value);
    }
  }
  for (const s of stats) s.mean /= rows.length;
  for (const row of rows) {
    for (let i = 0; i < dims; i++) {
      stats[i]!.std += ((row.coeffs[i] ?? 0) - stats[i]!.mean) ** 2;
    }
  }
  for (const s of stats) {
    s.std = Math.sqrt(s.std / rows.length);
    s.mean = Number(s.mean.toFixed(4));
    s.std = Number(s.std.toFixed(4));
  }
  return stats;
}

async function loadScoredPairs(env: Env, minScore: number): Promise<ScoredPair[]> {
  const db = drizzle(env.DB);
  const rows: Array<Omit<ScoredPair, "score"> & { score: number | null }> = await db
    .select({
      queryId: pairs.queryId,
      queryText: queries.text,
      category: queries.category,
      styleHint: queries.styleHint,
      seed: pairs.paletteSeed,
      coeffs: palettes.coeffs,
      tags: palettes.tags,
      source: pairs.source,
      score: pairs.score,
      ambiguity: pairs.ambiguity,
      style: sql<string | null>`coalesce(${pairs.styleOverride}, ${palettes.style})`,
      steps: sql<number | null>`coalesce(${pairs.stepsOverride}, ${palettes.steps})`,
      angle: sql<number | null>`coalesce(${pairs.angleOverride}, ${palettes.angle})`,
    })
    .from(pairs)
    .innerJoin(queries, eq(pairs.queryId, queries.id))
    .innerJoin(palettes, eq(pairs.paletteSeed, palettes.seed))
    .where(
      and(
        eq(pairs.status, "scored"),
        gte(pairs.score, minScore),
        eq(pairs.verdict, "ok"),
        sql`${palettes.status} != 'rejected'`,
        eq(queries.status, "active"),
      ),
    );
  return rows.filter((r): r is ScoredPair => r.score !== null);
}

export async function exportSft(
  env: Env,
  minScore = MIN_SFT_SCORE,
): Promise<{ r2Key: string; count: number }> {
  const rows = await loadScoredPairs(env, minScore);
  const lines = rows.map((r) =>
    JSON.stringify({
      query: r.queryText,
      coeffs: r.coeffs,
      seed: r.seed,
      style: r.style,
      steps: r.steps,
      angle: r.angle,
      score: r.score,
      tags: r.tags,
      category: r.category,
      styleHint: r.styleHint,
      ambiguity: r.ambiguity,
      source: r.source,
      split: splitFor(r.queryId),
    }),
  );
  return writeExport(env, "sft", lines, { minScore, coeffStats: coeffStats(rows) });
}

export async function exportDpo(
  env: Env,
  minGap = MIN_DPO_GAP,
): Promise<{ r2Key: string; count: number }> {
  // For DPO we need every scored pair, including low scores — those are the
  // "rejected" halves.
  const db = drizzle(env.DB);
  const rows = await db
    .select({
      queryId: pairs.queryId,
      queryText: queries.text,
      seed: pairs.paletteSeed,
      coeffs: palettes.coeffs,
      score: pairs.score,
    })
    .from(pairs)
    .innerJoin(queries, eq(pairs.queryId, queries.id))
    .innerJoin(palettes, eq(pairs.paletteSeed, palettes.seed))
    .where(and(eq(pairs.status, "scored"), eq(queries.status, "active")));

  const byQuery = new Map<string, typeof rows>();
  for (const row of rows) {
    if (row.score === null) continue;
    const list = byQuery.get(row.queryId) ?? [];
    list.push(row);
    byQuery.set(row.queryId, list);
  }

  const lines: string[] = [];
  for (const [queryId, list] of byQuery) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const best = sorted[0]!;
    const worst = sorted[sorted.length - 1]!;
    const gap = (best.score ?? 0) - (worst.score ?? 0);
    if (gap < minGap) continue;
    lines.push(
      JSON.stringify({
        query: best.queryText,
        chosen: best.coeffs,
        rejected: worst.coeffs,
        chosenSeed: best.seed,
        rejectedSeed: worst.seed,
        scoreGap: gap,
        split: splitFor(queryId),
      }),
    );
  }
  return writeExport(env, "dpo", lines, { minGap });
}

/**
 * Curated eval set: golden pairs grouped per query, each query carrying every
 * confirmed reference palette (multi-reference scoring beats single-reference
 * for a one-to-many task like this). Falls back to top-scored test-split pairs
 * while goldens are still scarce, so an eval file exists from day one.
 */
export const MIN_GOLDEN_QUERIES = 25;

export async function exportEval(
  env: Env,
): Promise<{ r2Key: string; count: number }> {
  const db = drizzle(env.DB);
  const base = {
    queryId: pairs.queryId,
    queryText: queries.text,
    category: queries.category,
    coeffs: palettes.coeffs,
    score: pairs.score,
    style: sql<string | null>`coalesce(${pairs.styleOverride}, ${palettes.style})`,
    steps: sql<number | null>`coalesce(${pairs.stepsOverride}, ${palettes.steps})`,
    angle: sql<number | null>`coalesce(${pairs.angleOverride}, ${palettes.angle})`,
  };
  const goldenRows = await db
    .select(base)
    .from(pairs)
    .innerJoin(queries, eq(pairs.queryId, queries.id))
    .innerJoin(palettes, eq(pairs.paletteSeed, palettes.seed))
    .where(and(eq(pairs.golden, true), eq(queries.status, "active")));

  let rows = goldenRows;
  let source: "golden" | "test-split-fallback" = "golden";
  if (new Set(goldenRows.map((r) => r.queryId)).size < MIN_GOLDEN_QUERIES) {
    source = "test-split-fallback";
    const scored = await db
      .select(base)
      .from(pairs)
      .innerJoin(queries, eq(pairs.queryId, queries.id))
      .innerJoin(palettes, eq(pairs.paletteSeed, palettes.seed))
      .where(
        and(
          eq(pairs.status, "scored"),
          gte(pairs.score, MIN_SFT_SCORE),
          eq(pairs.verdict, "ok"),
          eq(queries.status, "active"),
        ),
      );
    rows = scored.filter((r) => splitFor(r.queryId) === "test");
  }

  const byQuery = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byQuery.get(row.queryId) ?? [];
    list.push(row);
    byQuery.set(row.queryId, list);
  }
  const lines: string[] = [];
  for (const list of byQuery.values()) {
    const first = list[0]!;
    lines.push(
      JSON.stringify({
        query: first.queryText,
        category: first.category,
        references: list.map((r) => ({
          coeffs: r.coeffs,
          style: r.style,
          steps: r.steps,
          angle: r.angle,
          score: r.score,
        })),
      }),
    );
  }
  return writeExport(env, "eval", lines, { source });
}

async function writeExport(
  env: Env,
  kind: "sft" | "dpo" | "eval",
  lines: string[],
  filters: Record<string, unknown>,
): Promise<{ r2Key: string; count: number }> {
  const id = crypto.randomUUID();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const r2Key = `exports/${stamp}-${kind}.jsonl`;
  await env.EXPORTS.put(r2Key, lines.join("\n") + (lines.length ? "\n" : ""));
  const db = drizzle(env.DB);
  await db.insert(exportsTable).values({
    id,
    r2Key,
    kind,
    count: lines.length,
    filters,
    createdAt: Date.now(),
  });
  return { r2Key, count: lines.length };
}
