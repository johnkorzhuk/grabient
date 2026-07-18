import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import {
  checkQueryDuplicate,
  normalizeQueryText,
  upsertQueryVector,
} from "./embeddings";
import {
  queries,
  type QUERY_CATEGORIES,
  type QUERY_SOURCES,
  type STYLE_HINTS,
} from "@/db/schema";

export interface QueryInput {
  text: string;
  category: (typeof QUERY_CATEGORIES)[number];
  styleHint?: (typeof STYLE_HINTS)[number];
}

export type QueryIngestOutcome =
  | { status: "inserted"; id: string }
  | { status: "duplicate"; id: string; existingText: string }
  | { status: "rejected"; detail: string };

export async function ingestQuery(
  env: Env,
  input: QueryInput,
  source: (typeof QUERY_SOURCES)[number],
  runId: string | null,
): Promise<QueryIngestOutcome> {
  const db = drizzle(env.DB);
  const text = input.text.trim();
  if (text.length < 2 || text.length > 200) {
    return { status: "rejected", detail: "query must be 2-200 characters" };
  }
  const normalized = normalizeQueryText(text);

  const existing = await db
    .select({ id: queries.id, text: queries.text })
    .from(queries)
    .where(eq(queries.normalizedText, normalized))
    .limit(1);
  if (existing[0]) {
    return { status: "duplicate", id: existing[0].id, existingText: existing[0].text };
  }

  const dedup = await checkQueryDuplicate(env, text);
  if (dedup.isDuplicate && dedup.nearest) {
    const near = await db
      .select({ id: queries.id, text: queries.text })
      .from(queries)
      .where(eq(queries.id, dedup.nearest.id))
      .limit(1);
    if (near[0]) {
      return { status: "duplicate", id: near[0].id, existingText: near[0].text };
    }
  }

  const id = crypto.randomUUID();
  await db.insert(queries).values({
    id,
    text,
    normalizedText: normalized,
    category: input.category,
    styleHint: input.styleHint ?? null,
    source,
    runId,
    createdAt: Date.now(),
  });
  await upsertQueryVector(env, id, dedup.vector, { category: input.category });
  return { status: "inserted", id };
}
