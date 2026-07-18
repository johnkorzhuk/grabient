import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const PALETTE_STATUSES = ["draft", "approved", "rejected"] as const;
export const PALETTE_SOURCES = [
  "forward",
  "fit-hex",
  "sampled",
  "perturbed",
] as const;
export const QUERY_SOURCES = ["forward", "caption"] as const;
export const QUERY_CATEGORIES = [
  "scene",
  "mood",
  "aesthetic",
  "color-explicit",
  "object",
  "nature",
  "abstract",
  "season-weather-time",
] as const;
export const STYLE_HINTS = ["short", "verbose", "typo", "casual"] as const;
export const PAIR_STATUSES = ["pending", "scored", "rejected"] as const;
export const VERDICTS = ["ok", "bad-match", "bad-palette"] as const;

// Candidate palette pool. seed (from serializeCoeffs) is the canonical id;
// coeffs are stored globals-normalized so the 12 floats are the full training
// target. Rejected rows are kept (and stay in Vectorize) so known-bad regions
// still block re-generation.
export const palettes = sqliteTable(
  "palettes",
  {
    seed: text("seed").primaryKey(),
    coeffs: text("coeffs", { mode: "json" }).$type<number[]>().notNull(),
    similarityKey: text("similarity_key").notNull(),
    hexStops: text("hex_stops", { mode: "json" }).$type<string[]>().notNull(),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull(),
    brightness: real("brightness").notNull(),
    contrast: real("contrast").notNull(),
    source: text("source").$type<(typeof PALETTE_SOURCES)[number]>().notNull(),
    status: text("status")
      .$type<(typeof PALETTE_STATUSES)[number]>()
      .notNull()
      .default("draft"),
    rejectReason: text("reject_reason"),
    captionLockedAt: integer("caption_locked_at"),
    runId: text("run_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("palettes_status_idx").on(t.status),
    index("palettes_similarity_key_idx").on(t.similarityKey),
    index("palettes_source_idx").on(t.source),
  ],
);

export const queries = sqliteTable(
  "queries",
  {
    id: text("id").primaryKey(),
    text: text("text").notNull(),
    normalizedText: text("normalized_text").notNull(),
    category: text("category")
      .$type<(typeof QUERY_CATEGORIES)[number]>()
      .notNull(),
    styleHint: text("style_hint").$type<(typeof STYLE_HINTS)[number]>(),
    source: text("source").$type<(typeof QUERY_SOURCES)[number]>().notNull(),
    status: text("status").notNull().default("active"),
    runId: text("run_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("queries_normalized_text_idx").on(t.normalizedText),
    index("queries_category_idx").on(t.category),
  ],
);

export const pairs = sqliteTable(
  "pairs",
  {
    queryId: text("query_id").notNull(),
    paletteSeed: text("palette_seed").notNull(),
    source: text("source").$type<(typeof QUERY_SOURCES)[number]>().notNull(),
    status: text("status")
      .$type<(typeof PAIR_STATUSES)[number]>()
      .notNull()
      .default("pending"),
    score: real("score"),
    verdict: text("verdict").$type<(typeof VERDICTS)[number]>(),
    judgeNotes: text("judge_notes"),
    lockedAt: integer("locked_at"),
    lockedBy: text("locked_by"),
    runId: text("run_id"),
    createdAt: integer("created_at").notNull(),
    judgedAt: integer("judged_at"),
  },
  (t) => [
    primaryKey({ columns: [t.queryId, t.paletteSeed] }),
    index("pairs_palette_seed_idx").on(t.paletteSeed),
    index("pairs_status_idx").on(t.status),
    index("pairs_status_locked_idx").on(t.status, t.lockedAt),
  ],
);

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  mode: text("mode").notNull(),
  target: text("target", { mode: "json" }).$type<Record<string, unknown>>(),
  stats: text("stats", { mode: "json" }).$type<Record<string, number>>(),
  status: text("status").notNull().default("running"),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
});

export const exports = sqliteTable("exports", {
  id: text("id").primaryKey(),
  r2Key: text("r2_key").notNull(),
  kind: text("kind").$type<"sft" | "dpo">().notNull(),
  count: integer("count").notNull(),
  filters: text("filters", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at").notNull(),
});

export type PaletteRow = typeof palettes.$inferSelect;
export type QueryRow = typeof queries.$inferSelect;
export type PairRow = typeof pairs.$inferSelect;
