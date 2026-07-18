export const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
export const QUERY_DUPLICATE_SIMILARITY = 0.92;

export function normalizeQueryText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Emoji-only (no letters or digits in any script). Text embeddings cannot
 * distinguish emoji sequences — bge-base scores them all as near-duplicates
 * of each other, which collapsed every emoji query into one and mis-linked
 * dozens of unrelated palettes. Emoji sequences are precise strings; the
 * normalized-text unique index is the right dedup for them. */
export function isEmojiOnly(text: string): boolean {
  const stripped = text.replace(/\s/g, "");
  return stripped.length > 0 && !/[\p{L}\p{N}]/u.test(stripped);
}

export async function embedQuery(env: Env, text: string): Promise<number[]> {
  const result = (await env.AI.run(EMBEDDING_MODEL, {
    text: [normalizeQueryText(text)],
  })) as { data: number[][] };
  const vector = result.data[0];
  if (!vector) throw new Error("embedding model returned no vector");
  return vector;
}

export interface QueryDedupResult {
  isDuplicate: boolean;
  nearest: { id: string; similarity: number } | null;
  vector: number[];
}

/** Cosine-similarity dedup against the query index. Fails open when Vectorize
 * is unavailable locally — the unique index on normalized_text still catches
 * exact repeats. */
export async function checkQueryDuplicate(
  env: Env,
  text: string,
): Promise<QueryDedupResult> {
  const vector = await embedQuery(env, text);
  // Embedding similarity is meaningless between emoji-only strings (see
  // isEmojiOnly) — skip the kNN verdict; exact-text dedup still applies.
  if (isEmojiOnly(text)) {
    return { isDuplicate: false, nearest: null, vector };
  }
  try {
    const res = await env.QUERY_INDEX.query(vector, { topK: 1 });
    const top = res.matches[0];
    if (!top) return { isDuplicate: false, nearest: null, vector };
    return {
      isDuplicate: top.score > QUERY_DUPLICATE_SIMILARITY,
      nearest: { id: top.id, similarity: top.score },
      vector,
    };
  } catch {
    return { isDuplicate: false, nearest: null, vector };
  }
}

export async function upsertQueryVector(
  env: Env,
  id: string,
  vector: number[],
  metadata: Record<string, string>,
): Promise<void> {
  try {
    await env.QUERY_INDEX.upsert([{ id, values: vector, metadata }]);
  } catch (err) {
    console.error(`query vector upsert failed for ${id}`, err);
  }
}
