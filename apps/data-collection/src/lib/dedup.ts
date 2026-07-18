import { drizzle } from "drizzle-orm/d1";
import { eq, inArray } from "drizzle-orm";
import {
  createSimilarityKey,
  computeLabSamples,
  comparePalettes,
} from "@repo/data-ops/similarity";
import { FEATURE_SAMPLE_POINTS, featureVector, reversedFeatureVector } from "./features";
import type { CanonicalPalette } from "./features";
import { palettes } from "@/db/schema";

/**
 * Average deltaE below which two palettes count as duplicates. similarity.ts
 * documents <5 as "nearly identical" and 5-10 as "similar"; we sit at the top
 * of the similar band because for training data we'd rather drop a borderline
 * variant than teach the model two names for one gradient.
 */
export const DUPLICATE_AVG_DELTA_E = 8;

/**
 * Vectorize euclidean distance = sqrt(sum(deltaE_i^2)) over the sample points,
 * which is sqrt(N) * RMS deltaE. RMS >= mean, so a generous cutoff around
 * sqrt(N) * threshold * 1.5 keeps every plausible duplicate in the candidate
 * set for exact rescoring.
 */
export const VECTORIZE_CANDIDATE_DISTANCE =
  Math.sqrt(FEATURE_SAMPLE_POINTS) * DUPLICATE_AVG_DELTA_E * 1.5;

export interface Neighbor {
  seed: string;
  distance: number; // exact avg deltaE (post-rescore)
  reversed: boolean;
  status: string;
}

export interface DedupResult {
  isDuplicate: boolean;
  exactMatch: string | null;
  neighbors: Neighbor[];
}

interface StoredPalette {
  seed: string;
  hexStops: string[];
  status: string;
}

function rescore(candidateStops: string[], stored: StoredPalette[]): Neighbor[] {
  const labA = computeLabSamples(candidateStops, FEATURE_SAMPLE_POINTS);
  return stored
    .map((p) => {
      const labB = computeLabSamples(p.hexStops, FEATURE_SAMPLE_POINTS);
      const { distance, reversed } = comparePalettes(labA, labB, [...labB].reverse());
      return { seed: p.seed, distance, reversed, status: p.status };
    })
    .sort((a, b) => a.distance - b.distance);
}

/**
 * Three-tier duplicate check:
 *  1. exact seed / coarse similarity-key hit in D1
 *  2. Vectorize kNN retrieval, queried in both orientations (the index stores
 *     one forward vector per palette; reversal invariance comes from querying
 *     with the reversed vector too)
 *  3. exact avg-deltaE rescore of retrieved candidates against D1 rows
 * Falls back to a brute-force D1 scan when Vectorize is unavailable (local dev).
 */
export async function findSimilarPalettes(
  env: Env,
  candidate: CanonicalPalette,
  topK = 5,
): Promise<DedupResult> {
  const db = drizzle(env.DB);

  const exact = await db
    .select({ seed: palettes.seed })
    .from(palettes)
    .where(eq(palettes.seed, candidate.seed))
    .limit(1);
  if (exact.length > 0) {
    return {
      isDuplicate: true,
      exactMatch: candidate.seed,
      neighbors: [],
    };
  }

  const simKey = createSimilarityKey(candidate.coeffs);
  const coarse = await db
    .select({ seed: palettes.seed, hexStops: palettes.hexStops, status: palettes.status })
    .from(palettes)
    .where(eq(palettes.similarityKey, simKey))
    .limit(20);

  let candidateRows: StoredPalette[] = coarse;

  try {
    const [fwd, rev] = await Promise.all([
      env.PALETTE_INDEX.query(featureVector(candidate.hexStops), { topK }),
      env.PALETTE_INDEX.query(reversedFeatureVector(candidate.hexStops), { topK }),
    ]);
    const ids = [...fwd.matches, ...rev.matches]
      .filter((m) => m.score <= VECTORIZE_CANDIDATE_DISTANCE)
      .map((m) => m.id)
      .filter((id) => !candidateRows.some((r) => r.seed === id));
    if (ids.length > 0) {
      const rows = await db
        .select({ seed: palettes.seed, hexStops: palettes.hexStops, status: palettes.status })
        .from(palettes)
        .where(inArray(palettes.seed, ids));
      candidateRows = [...candidateRows, ...rows];
    }
  } catch {
    // Vectorize unavailable (wrangler dev --local): brute-force scan. Fine for
    // dev-sized data; the deployed Worker always has the index.
    const all = await db
      .select({ seed: palettes.seed, hexStops: palettes.hexStops, status: palettes.status })
      .from(palettes);
    candidateRows = all;
  }

  const neighbors = rescore(candidate.hexStops, candidateRows).slice(0, topK);
  const isDuplicate = neighbors.some((n) => n.distance < DUPLICATE_AVG_DELTA_E);
  return { isDuplicate, exactMatch: null, neighbors };
}

export async function upsertPaletteVector(
  env: Env,
  seed: string,
  hexStops: string[],
  metadata: Record<string, string>,
): Promise<void> {
  try {
    await env.PALETTE_INDEX.upsert([
      { id: seed, values: featureVector(hexStops), metadata },
    ]);
  } catch (err) {
    // Non-fatal: the palette is persisted either way; without its vector,
    // dedup for this row falls back to the simkey/brute-force tiers.
    console.error(`vector upsert failed for ${seed}`, err);
  }
}
