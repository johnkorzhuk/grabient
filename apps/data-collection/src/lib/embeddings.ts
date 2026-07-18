export const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
export const QUERY_DUPLICATE_SIMILARITY = 0.92;

export function normalizeQueryText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
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
