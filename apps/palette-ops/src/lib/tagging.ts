import { nanoid } from "nanoid";
import { generateColorDataFromSeed, type ColorData } from "./color-data";
import {
  callAllProviders,
  PROVIDERS,
  CURRENT_PROMPT_VERSION,
  type TagResponse,
} from "./providers";
import {
  type TagSummary,
  createBatchRequests,
  submitBatch,
  getBatchStatus,
  getBatchResults,
  refineTagsSingle,
  REFINEMENT_PROMPT_VERSION,
} from "./refinement";

// Target user ID for tagging (configurable)
// Local: UeN8nNYDTSvHrOljnwYkg8Ff1r7SEISN
// Remote: l11RD3QM6e7OtAikX3fMFNW8coHCEcBd
export const TARGET_USER_ID = "UeN8nNYDTSvHrOljnwYkg8Ff1r7SEISN";

export interface TaggingEnv {
  DB: D1Database;
  AI: Ai;
  OPENAI_API_KEY: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  GROQ_API_KEY: string;
}

// Re-export for convenience
export {
  CURRENT_PROMPT_VERSION,
  PROVIDERS,
  REFINEMENT_PROMPT_VERSION,
  generateColorDataFromSeed,
};

/**
 * Get tagging status
 */
export async function getTaggingStatus(db: D1Database) {
  // Get all liked seeds for target user
  const likesResult = await db
    .prepare("SELECT palette_id FROM likes WHERE user_id = ?")
    .bind(TARGET_USER_ID)
    .all<{ palette_id: string }>();

  const totalSeeds = likesResult.results.length;

  // Get current run number
  const maxRunResult = await db
    .prepare(
      "SELECT COALESCE(MAX(run_number), 0) as max_run FROM palette_tags"
    )
    .first<{ max_run: number }>();
  const currentRun = maxRunResult?.max_run || 0;

  // Count seeds fully tagged in current run with current prompt version
  const taggedResult = await db
    .prepare(
      `
      SELECT seed, COUNT(DISTINCT provider) as cnt
      FROM palette_tags
      WHERE run_number = ? AND prompt_version = ?
      GROUP BY seed
      HAVING COUNT(DISTINCT provider) = ?
    `
    )
    .bind(currentRun, CURRENT_PROMPT_VERSION, PROVIDERS.length)
    .all<{ seed: string; cnt: number }>();

  const completedThisRun = taggedResult.results.length;
  const pendingThisRun = totalSeeds - completedThisRun;

  // Total tags
  const totalTagsResult = await db
    .prepare("SELECT COUNT(*) as count FROM palette_tags")
    .first<{ count: number }>();
  const totalTags = totalTagsResult?.count || 0;

  return {
    currentRun,
    promptVersion: CURRENT_PROMPT_VERSION,
    totalSeeds,
    completedThisRun,
    pendingThisRun,
    totalTags,
    providersPerSeed: PROVIDERS.length,
  };
}

/**
 * Get results for a specific seed
 */
export async function getSeedResults(db: D1Database, seed: string) {
  const results = await db
    .prepare(
      `
      SELECT * FROM palette_tags
      WHERE seed = ?
      ORDER BY run_number, provider
    `
    )
    .bind(seed)
    .all<{
      id: string;
      seed: string;
      provider: string;
      model: string;
      run_number: number;
      tags: string | null;
      error: string | null;
      created_at: number;
    }>();

  if (results.results.length === 0) {
    return null;
  }

  // Parse tags JSON
  const parsedResults = results.results.map((r: { tags: string | null } & Record<string, unknown>) => ({
    ...r,
    tags: r.tags ? JSON.parse(r.tags) : null,
  }));

  return {
    seed,
    totalResults: results.results.length,
    results: parsedResults,
  };
}

/**
 * Generate tags for all pending palettes
 */
export async function generateTags(env: TaggingEnv) {
  const db = env.DB;

  // Get all liked seeds for target user
  const likesResult = await db
    .prepare("SELECT palette_id FROM likes WHERE user_id = ?")
    .bind(TARGET_USER_ID)
    .all<{ palette_id: string }>();

  const allSeeds = likesResult.results.map((l: { palette_id: string }) => l.palette_id);

  if (allSeeds.length === 0) {
    return { error: "No liked palettes found" };
  }

  // Get current run number for this prompt version
  const maxRunForPromptResult = await db
    .prepare(
      "SELECT COALESCE(MAX(run_number), 0) as max_run FROM palette_tags WHERE prompt_version = ?"
    )
    .bind(CURRENT_PROMPT_VERSION)
    .first<{ max_run: number }>();

  const maxRunOverallResult = await db
    .prepare(
      "SELECT COALESCE(MAX(run_number), 0) as max_run FROM palette_tags"
    )
    .first<{ max_run: number }>();

  let currentRun: number;

  if (maxRunForPromptResult?.max_run === 0) {
    currentRun = (maxRunOverallResult?.max_run || 0) + 1;
    console.log(`New prompt version detected, starting run ${currentRun}`);
  } else {
    currentRun = maxRunForPromptResult?.max_run || 1;
  }

  // Find seeds with all CURRENT providers completed in this run
  const fullyTaggedResult = await db
    .prepare(
      `
      SELECT seed FROM palette_tags
      WHERE run_number = ? AND prompt_version = ?
      GROUP BY seed
      HAVING COUNT(DISTINCT provider) >= ?
    `
    )
    .bind(currentRun, CURRENT_PROMPT_VERSION, PROVIDERS.length)
    .all<{ seed: string }>();

  const fullyTaggedSet = new Set(fullyTaggedResult.results.map((r: { seed: string }) => r.seed));

  // Find pending seeds
  let pendingSeeds = allSeeds.filter((seed: string) => !fullyTaggedSet.has(seed));

  // If all seeds are complete, start new run
  if (pendingSeeds.length === 0) {
    currentRun += 1;
    pendingSeeds = allSeeds;
    console.log(
      `All seeds complete for run ${currentRun - 1}, starting new run: ${currentRun}`
    );
  }

  console.log(`Run ${currentRun}: Processing ${pendingSeeds.length} seeds`);

  const results: {
    seed: string;
    success: boolean;
    providersCompleted: number;
    errors: string[];
  }[] = [];

  // Process each seed
  for (let i = 0; i < pendingSeeds.length; i++) {
    const seed = pendingSeeds[i]!;
    console.log(
      `Processing seed ${i + 1}/${pendingSeeds.length}: ${seed.slice(0, 20)}...`
    );

    try {
      const colorData = generateColorDataFromSeed(seed);

      // Find which providers are already done
      const existingResult = await db
        .prepare(
          "SELECT provider FROM palette_tags WHERE seed = ? AND run_number = ? AND prompt_version = ?"
        )
        .bind(seed, currentRun, CURRENT_PROMPT_VERSION)
        .all<{ provider: string }>();

      const completedProviders = new Set(
        existingResult.results.map((t: { provider: string }) => t.provider)
      );
      const pendingProviders = PROVIDERS.filter(
        (p) => !completedProviders.has(p.name)
      );

      if (pendingProviders.length === 0) {
        console.log(`Seed already complete, skipping`);
        continue;
      }

      console.log(
        `${pendingProviders.length} of ${PROVIDERS.length} providers remaining`
      );

      // Call only pending providers in parallel
      const newResults = await callAllProviders(env, colorData, pendingProviders);

      // Store results
      const errors: string[] = [];
      for (const result of newResults) {
        const tagId = nanoid();
        const now = Date.now();

        await db
          .prepare(
            `
            INSERT INTO palette_tags (id, seed, provider, model, run_number, prompt_version, tags, error, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
          .bind(
            tagId,
            seed,
            result.provider,
            result.model,
            currentRun,
            CURRENT_PROMPT_VERSION,
            result.tags ? JSON.stringify(result.tags) : null,
            result.error || null,
            now
          )
          .run();

        if (result.error) {
          errors.push(`${result.provider}: ${result.error}`);
        }
      }

      results.push({
        seed,
        success: errors.length === 0,
        providersCompleted: newResults.length,
        errors,
      });

      // Short delay between palettes
      if (i < pendingSeeds.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Failed to process seed ${seed}: ${errorMessage}`);
      results.push({
        seed,
        success: false,
        providersCompleted: 0,
        errors: [errorMessage],
      });
    }
  }

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    runNumber: currentRun,
    processed: results.length,
    successful,
    failed,
    results,
  };
}

/**
 * Helper to aggregate tag data from raw results
 */
export function aggregateTagsForSeed(
  tags: Array<{ tags: string | null; model: string }>,
  seed: string,
  colorData: ColorData,
  sourcePromptVersion: string
): TagSummary {
  const validTags = tags
    .filter((t) => t.tags)
    .map((t) => JSON.parse(t.tags!) as TagResponse);
  const total = validTags.length;

  const categorical = {
    temperature: {} as Record<string, number>,
    contrast: {} as Record<string, number>,
    brightness: {} as Record<string, number>,
    saturation: {} as Record<string, number>,
  };

  const tagArrays = {
    mood: {} as Record<string, number>,
    style: {} as Record<string, number>,
    dominant_colors: {} as Record<string, number>,
    seasonal: {} as Record<string, number>,
    associations: {} as Record<string, number>,
  };

  for (const tag of validTags) {
    categorical.temperature[tag.temperature] =
      (categorical.temperature[tag.temperature] || 0) + 1;
    categorical.contrast[tag.contrast] =
      (categorical.contrast[tag.contrast] || 0) + 1;
    categorical.brightness[tag.brightness] =
      (categorical.brightness[tag.brightness] || 0) + 1;
    categorical.saturation[tag.saturation] =
      (categorical.saturation[tag.saturation] || 0) + 1;

    for (const m of tag.mood)
      tagArrays.mood[m] = (tagArrays.mood[m] || 0) + 1;
    for (const s of tag.style)
      tagArrays.style[s] = (tagArrays.style[s] || 0) + 1;
    const colors = tag.dominant_colors ?? [];
    for (const c of colors)
      tagArrays.dominant_colors[c] = (tagArrays.dominant_colors[c] || 0) + 1;
    for (const s of tag.seasonal)
      tagArrays.seasonal[s] = (tagArrays.seasonal[s] || 0) + 1;
    for (const a of tag.associations)
      tagArrays.associations[a] = (tagArrays.associations[a] || 0) + 1;
  }

  return {
    seed,
    colorData,
    totalModels: total,
    sourcePromptVersion,
    categorical,
    tags: tagArrays,
  };
}

/**
 * Get refinement status
 */
export async function getRefinementStatus(db: D1Database) {
  // Count total seeds with tags
  const totalTaggedResult = await db
    .prepare(
      `SELECT COUNT(DISTINCT seed) as count FROM palette_tags WHERE tags IS NOT NULL AND prompt_version = ?`
    )
    .bind(CURRENT_PROMPT_VERSION)
    .first<{ count: number }>();
  const totalTagged = totalTaggedResult?.count || 0;

  // Count seeds with refinements
  const refinedResult = await db
    .prepare(
      `SELECT COUNT(DISTINCT seed) as count FROM palette_tag_refinements WHERE source_prompt_version = ?`
    )
    .bind(CURRENT_PROMPT_VERSION)
    .first<{ count: number }>();
  const refined = refinedResult?.count || 0;

  // Count errors
  const errorsResult = await db
    .prepare(
      `SELECT COUNT(*) as count FROM palette_tag_refinements WHERE error IS NOT NULL AND source_prompt_version = ?`
    )
    .bind(CURRENT_PROMPT_VERSION)
    .first<{ count: number }>();
  const errors = errorsResult?.count || 0;

  return {
    sourcePromptVersion: CURRENT_PROMPT_VERSION,
    refinementPromptVersion: REFINEMENT_PROMPT_VERSION,
    totalTagged,
    refined,
    pending: totalTagged - refined,
    errors,
  };
}

/**
 * Refine a single seed
 */
export async function refineSingleSeed(
  env: TaggingEnv,
  seed: string,
  sourceVersion?: string
) {
  const db = env.DB;

  // If no source version specified, find the most recent
  if (!sourceVersion) {
    const versionResult = await db
      .prepare(
        `SELECT prompt_version FROM palette_tags WHERE seed = ? AND tags IS NOT NULL ORDER BY created_at DESC LIMIT 1`
      )
      .bind(seed)
      .first<{ prompt_version: string }>();
    sourceVersion = versionResult?.prompt_version;
  }

  if (!sourceVersion) {
    return { error: "No tags found for this seed" };
  }

  // Get all tags for this seed
  const tagsResult = await db
    .prepare(
      `SELECT tags, model FROM palette_tags WHERE seed = ? AND prompt_version = ? AND tags IS NOT NULL`
    )
    .bind(seed, sourceVersion)
    .all<{ tags: string | null; model: string }>();

  if (tagsResult.results.length === 0) {
    return { error: "No tags found for this seed with version " + sourceVersion };
  }

  // Check if already refined
  const existingResult = await db
    .prepare(
      `SELECT id FROM palette_tag_refinements WHERE seed = ? AND source_prompt_version = ?`
    )
    .bind(seed, sourceVersion)
    .first<{ id: string }>();

  if (existingResult) {
    return { error: "Seed already refined", id: existingResult.id };
  }

  // Generate color data and aggregate tags
  const colorData = generateColorDataFromSeed(seed);
  const summary = aggregateTagsForSeed(
    tagsResult.results,
    seed,
    colorData,
    sourceVersion
  );

  const storedSummary = {
    colorData: summary.colorData,
    categorical: summary.categorical,
    tags: summary.tags,
  };

  try {
    const result = await refineTagsSingle(env.ANTHROPIC_API_KEY, summary);

    const id = nanoid();
    const now = Date.now();

    await db
      .prepare(
        `
        INSERT INTO palette_tag_refinements
        (id, seed, model, prompt_version, source_prompt_version, input_summary, refined_tags, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .bind(
        id,
        seed,
        "claude-opus-4-5-20251101",
        REFINEMENT_PROMPT_VERSION,
        sourceVersion,
        JSON.stringify(storedSummary),
        JSON.stringify(result),
        now
      )
      .run();

    return {
      id,
      seed,
      sourceVersion,
      ...result,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    const id = nanoid();
    const now = Date.now();

    await db
      .prepare(
        `
        INSERT INTO palette_tag_refinements
        (id, seed, model, prompt_version, source_prompt_version, input_summary, error, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .bind(
        id,
        seed,
        "claude-opus-4-5-20251101",
        REFINEMENT_PROMPT_VERSION,
        sourceVersion,
        JSON.stringify(storedSummary),
        errorMessage,
        now
      )
      .run();

    return { error: errorMessage };
  }
}

/**
 * Start a batch refinement job
 */
export async function startBatchRefinement(env: TaggingEnv, limit = 100) {
  const db = env.DB;

  // Get seeds that need refinement
  const pendingResult = await db
    .prepare(
      `
      SELECT DISTINCT pt.seed
      FROM palette_tags pt
      LEFT JOIN palette_tag_refinements ptr
          ON pt.seed = ptr.seed AND ptr.source_prompt_version = ?
      WHERE pt.tags IS NOT NULL
          AND pt.prompt_version = ?
          AND ptr.id IS NULL
      LIMIT ?
    `
    )
    .bind(CURRENT_PROMPT_VERSION, CURRENT_PROMPT_VERSION, limit)
    .all<{ seed: string }>();

  const pendingSeeds = pendingResult.results.map((r: { seed: string }) => r.seed);

  if (pendingSeeds.length === 0) {
    return { message: "No pending seeds to refine" };
  }

  // Build summaries for each seed
  const summaries: TagSummary[] = [];

  for (const seed of pendingSeeds) {
    const tagsResult = await db
      .prepare(
        `SELECT tags, model FROM palette_tags WHERE seed = ? AND prompt_version = ? AND tags IS NOT NULL`
      )
      .bind(seed, CURRENT_PROMPT_VERSION)
      .all<{ tags: string | null; model: string }>();

    if (tagsResult.results.length > 0) {
      const colorData = generateColorDataFromSeed(seed);
      summaries.push(
        aggregateTagsForSeed(
          tagsResult.results,
          seed,
          colorData,
          CURRENT_PROMPT_VERSION
        )
      );
    }
  }

  // Create and submit batch
  const { requests, idToSeed } = createBatchRequests(summaries);
  const batchId = await submitBatch(env.ANTHROPIC_API_KEY, requests);

  const seedMapping = Object.fromEntries(idToSeed);

  return {
    batchId,
    seedCount: summaries.length,
    seedMapping,
    message: `Batch submitted. Poll /api/refine/batch/${batchId} for status, then POST to /api/refine/batch/${batchId}/process with seedMapping.`,
  };
}

/**
 * Check batch status
 */
export async function checkBatchStatus(apiKey: string, batchId: string) {
  const status = await getBatchStatus(apiKey, batchId);

  return {
    batchId,
    status: status.processing_status,
    requestCounts: status.request_counts,
    createdAt: status.created_at,
    endedAt: status.ended_at,
  };
}

/**
 * Process completed batch results
 */
export async function processBatchResults(
  env: TaggingEnv,
  batchId: string,
  seedMapping: Record<string, string>
) {
  const db = env.DB;

  // Check status first
  const status = await getBatchStatus(env.ANTHROPIC_API_KEY, batchId);
  if (status.processing_status !== "ended") {
    return {
      error: "Batch not complete",
      status: status.processing_status,
    };
  }

  // Get results
  const results = await getBatchResults(env.ANTHROPIC_API_KEY, batchId);
  const now = Date.now();

  let stored = 0;
  let errors = 0;
  let skipped = 0;

  for (const [customId, result] of results) {
    const seed = seedMapping[customId];
    if (!seed) {
      console.error(`No seed mapping for custom_id: ${customId}`);
      skipped++;
      continue;
    }

    const id = nanoid();

    // Get the original summary for this seed
    const tagsResult = await db
      .prepare(
        `SELECT tags, model FROM palette_tags WHERE seed = ? AND prompt_version = ? AND tags IS NOT NULL`
      )
      .bind(seed, CURRENT_PROMPT_VERSION)
      .all<{ tags: string | null; model: string }>();

    const colorData = generateColorDataFromSeed(seed);
    const summary = aggregateTagsForSeed(
      tagsResult.results,
      seed,
      colorData,
      CURRENT_PROMPT_VERSION
    );

    const storedSummary = {
      colorData: summary.colorData,
      categorical: summary.categorical,
      tags: summary.tags,
    };

    if ("error" in result) {
      await db
        .prepare(
          `
          INSERT INTO palette_tag_refinements
          (id, seed, model, prompt_version, source_prompt_version, input_summary, error, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .bind(
          id,
          seed,
          "claude-opus-4-5-20251101",
          REFINEMENT_PROMPT_VERSION,
          CURRENT_PROMPT_VERSION,
          JSON.stringify(storedSummary),
          result.error,
          now
        )
        .run();
      errors++;
    } else {
      await db
        .prepare(
          `
          INSERT INTO palette_tag_refinements
          (id, seed, model, prompt_version, source_prompt_version, input_summary, refined_tags, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .bind(
          id,
          seed,
          "claude-opus-4-5-20251101",
          REFINEMENT_PROMPT_VERSION,
          CURRENT_PROMPT_VERSION,
          JSON.stringify(storedSummary),
          JSON.stringify(result),
          now
        )
        .run();
      stored++;
    }
  }

  return {
    batchId,
    processed: results.size,
    stored,
    errors,
    skipped,
  };
}

/**
 * Get refinement result for a seed
 */
export async function getRefinementResult(db: D1Database, seed: string) {
  const result = await db
    .prepare(
      `SELECT * FROM palette_tag_refinements WHERE seed = ? ORDER BY created_at DESC LIMIT 1`
    )
    .bind(seed)
    .first<{
      id: string;
      seed: string;
      model: string;
      prompt_version: string;
      source_prompt_version: string;
      input_summary: string | null;
      refined_tags: string | null;
      analysis: string | null;
      error: string | null;
      created_at: number;
    }>();

  if (!result) {
    return null;
  }

  return {
    id: result.id,
    seed: result.seed,
    model: result.model,
    promptVersion: result.prompt_version,
    sourcePromptVersion: result.source_prompt_version,
    refinedTags: result.refined_tags ? JSON.parse(result.refined_tags) : null,
    analysis: result.analysis ? JSON.parse(result.analysis) : null,
    error: result.error,
    createdAt: result.created_at,
  };
}
