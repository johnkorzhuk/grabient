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
  seed: string;
  coeffs: number[];
  tags: string[];
  source: string;
  score: number;
}

async function loadScoredPairs(env: Env, minScore: number): Promise<ScoredPair[]> {
  const db = drizzle(env.DB);
  const rows: Array<Omit<ScoredPair, "score"> & { score: number | null }> = await db
    .select({
      queryId: pairs.queryId,
      queryText: queries.text,
      seed: pairs.paletteSeed,
      coeffs: palettes.coeffs,
      tags: palettes.tags,
      source: pairs.source,
      score: pairs.score,
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
      score: r.score,
      tags: r.tags,
      source: r.source,
      split: splitFor(r.queryId),
    }),
  );
  return writeExport(env, "sft", lines, { minScore });
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

async function writeExport(
  env: Env,
  kind: "sft" | "dpo",
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
