import { drizzle } from "drizzle-orm/d1";
import { createSimilarityKey } from "@repo/data-ops/similarity";
import { fitCosinePalette, validateFit } from "@repo/data-ops/gradient-gen";
import { canonicalize, toFlat12, type CanonicalPalette } from "./features";
import { findSimilarPalettes, upsertPaletteVector, type Neighbor } from "./dedup";
import { palettes, type PALETTE_SOURCES } from "@/db/schema";

/** Max fit error accepted when converting an authored hex list to coeffs.
 * fitCosinePalette sums per-channel MSE over 64 dense samples; above this the
 * fitted gradient no longer resembles the colors the generator intended. */
export const MAX_FIT_ERROR = 0.75;

export type PaletteInput =
  | { coeffs: number[]; hexColors?: never }
  | { hexColors: string[]; coeffs?: never };

export type RejectReason =
  | "invalid-input"
  | "bad-fit"
  | "invalid-range"
  | "duplicate";

export interface AcceptedPalette {
  index: number;
  seed: string;
  coeffs: number[];
  hexStops: string[];
  tags: string[];
}

export interface RejectedPalette {
  index: number;
  reason: RejectReason;
  detail?: string;
  nearestSeed?: string;
  distance?: number;
}

export interface IngestResult {
  accepted: AcceptedPalette[];
  rejected: RejectedPalette[];
}

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

/**
 * Keep the training target in one consistent parameter regime. The cosine
 * formula can express the same gradient with wildly scaled offset/amplitude
 * (hex fits sometimes land there); a model trained on mixed regimes has to
 * learn several encodings for one visual concept.
 */
export const MAX_OFFSET_AMPLITUDE = 2;
export const MAX_FREQUENCY = 2;

function coeffsOutOfRange(flat12: number[]): string | null {
  const offsets = flat12.slice(0, 3);
  const amplitudes = flat12.slice(3, 6);
  const frequencies = flat12.slice(6, 9);
  if (offsets.some((n) => Math.abs(n) > MAX_OFFSET_AMPLITUDE)) {
    return `offset outside +/-${MAX_OFFSET_AMPLITUDE}; re-author with a in ~[0.2, 0.8]`;
  }
  if (amplitudes.some((n) => Math.abs(n) > MAX_OFFSET_AMPLITUDE)) {
    return `amplitude outside +/-${MAX_OFFSET_AMPLITUDE}; re-author with |b| <= ~0.6`;
  }
  if (frequencies.some((n) => Math.abs(n) > MAX_FREQUENCY)) {
    return `frequency outside +/-${MAX_FREQUENCY}; keep c in ~[0.25, 1.25]`;
  }
  return null;
}

function resolveInput(
  input: PaletteInput,
): { canonical: CanonicalPalette } | { reason: RejectReason; detail: string } {
  try {
    if (input.coeffs) {
      if (input.coeffs.length !== 12 || input.coeffs.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
        return { reason: "invalid-input", detail: "coeffs must be 12 finite numbers" };
      }
      return { canonical: canonicalize(input.coeffs) };
    }
    const hexColors = input.hexColors;
    if (!Array.isArray(hexColors) || hexColors.length < 3 || hexColors.length > 8) {
      return { reason: "invalid-input", detail: "hexColors must contain 3-8 colors" };
    }
    if (!hexColors.every((h) => typeof h === "string" && HEX_RE.test(h))) {
      return { reason: "invalid-input", detail: "hexColors must be 6-digit hex codes" };
    }
    const normalized = hexColors.map((h) => (h.startsWith("#") ? h : `#${h}`));
    const fit = fitCosinePalette(normalized);
    if (fit.error > MAX_FIT_ERROR) {
      return {
        reason: "bad-fit",
        detail: `fit error ${fit.error.toFixed(3)} > ${MAX_FIT_ERROR}; use fewer/smoother colors`,
      };
    }
    validateFit(normalized, fit);
    return { canonical: canonicalize(toFlat12(fit.coeffs)) };
  } catch (err) {
    return { reason: "invalid-input", detail: err instanceof Error ? err.message : "unparseable input" };
  }
}

/**
 * Shared validate -> fit -> normalize -> dedup -> insert pipeline used by every
 * submit route. Also dedups within the batch itself (Vectorize upserts are not
 * immediately queryable, so intra-batch comparisons must happen in-process).
 */
export async function ingestPalettes(
  env: Env,
  inputs: PaletteInput[],
  source: (typeof PALETTE_SOURCES)[number],
  runId: string | null,
): Promise<IngestResult> {
  const db = drizzle(env.DB);
  const accepted: AcceptedPalette[] = [];
  const rejected: RejectedPalette[] = [];
  const batchAccepted: CanonicalPalette[] = [];

  for (let index = 0; index < inputs.length; index++) {
    const input = inputs[index];
    if (!input) continue;
    const resolved = resolveInput(input);
    if ("reason" in resolved) {
      rejected.push({ index, reason: resolved.reason, detail: resolved.detail });
      continue;
    }
    const canonical = resolved.canonical;
    if (!canonical.valid) {
      rejected.push({
        index,
        reason: "invalid-range",
        detail: "palette is degenerate (near-black or flat); adjust offset/amplitude",
      });
      continue;
    }
    const extreme = coeffsOutOfRange(canonical.flat12);
    if (extreme) {
      rejected.push({ index, reason: "invalid-range", detail: extreme });
      continue;
    }

    const inBatch = findInBatchDuplicate(canonical, batchAccepted);
    if (inBatch) {
      rejected.push({ index, reason: "duplicate", nearestSeed: inBatch.seed, distance: inBatch.distance });
      continue;
    }

    const dedup = await findSimilarPalettes(env, canonical);
    if (dedup.isDuplicate) {
      const nearest = dedup.exactMatch
        ? { seed: dedup.exactMatch, distance: 0 }
        : { seed: dedup.neighbors[0]!.seed, distance: dedup.neighbors[0]!.distance };
      rejected.push({ index, reason: "duplicate", nearestSeed: nearest.seed, distance: nearest.distance });
      continue;
    }

    const now = Date.now();
    await db
      .insert(palettes)
      .values({
        seed: canonical.seed,
        coeffs: canonical.flat12,
        similarityKey: createSimilarityKey(canonical.coeffs),
        hexStops: canonical.hexStops,
        tags: canonical.tags,
        brightness: canonical.brightness,
        contrast: canonical.contrast,
        source,
        runId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
    await upsertPaletteVector(env, canonical.seed, canonical.hexStops, {
      status: "draft",
      source,
    });

    batchAccepted.push(canonical);
    accepted.push({
      index,
      seed: canonical.seed,
      coeffs: canonical.flat12,
      hexStops: canonical.hexStops,
      tags: canonical.tags,
    });
  }

  return { accepted, rejected };
}

function findInBatchDuplicate(
  candidate: CanonicalPalette,
  batch: CanonicalPalette[],
): { seed: string; distance: number } | null {
  for (const prev of batch) {
    if (prev.seed === candidate.seed) return { seed: prev.seed, distance: 0 };
  }
  // Cheap exact-key comparison only; cross-batch perceptual dupes are rare and
  // get swept by the audit mode.
  const key = createSimilarityKey(candidate.coeffs);
  for (const prev of batch) {
    if (createSimilarityKey(prev.coeffs) === key) {
      return { seed: prev.seed, distance: -1 };
    }
  }
  return null;
}
