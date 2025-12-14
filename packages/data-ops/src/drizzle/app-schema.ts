import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";
import { PALETTE_STYLES } from "../valibot-schema/grabient";

export const palettes = sqliteTable(
  "palettes",
  {
    id: text("id").primaryKey(),
    style: text("style").notNull().$type<typeof PALETTE_STYLES[number]>(),
    steps: integer("steps").notNull(),
    angle: integer("angle").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    idIdx: index("palettes_id_idx").on(table.id),
  })
);

export const likes = sqliteTable(
  "likes",
  {
    userId: text("user_id").notNull(),
    paletteId: text("palette_id").notNull(),
    steps: integer("steps").notNull(),
    style: text("style").notNull().$type<typeof PALETTE_STYLES[number]>(),
    angle: integer("angle").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.paletteId] }),
    paletteIdIdx: index("likes_palette_id_idx").on(table.paletteId),
    userIdIdx: index("likes_user_id_idx").on(table.userId),
  })
);

export const searchFeedback = sqliteTable(
  "search_feedback",
  {
    userId: text("user_id").notNull(),
    query: text("query").notNull(),
    seed: text("seed").notNull(),
    feedback: text("feedback").notNull().$type<"good" | "bad">(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.query, table.seed] }),
    userQueryIdx: index("search_feedback_user_query_idx").on(table.userId, table.query),
    seedIdx: index("search_feedback_seed_idx").on(table.seed),
  })
);

// Refine sessions - stores AI refinement history and feedback
export const refineSessions = sqliteTable(
  "refine_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    query: text("query").notNull(),
    version: integer("version").notNull().default(1),
    // Seeds generated per version: { "1": ["seed1", "seed2"], "2": ["seed3"] }
    generatedSeeds: text("generated_seeds", { mode: "json" })
      .$type<Record<string, string[]>>()
      .notNull()
      .default({}),
    // User feedback per version: { "1": { "seed1": "good", "seed2": "bad" }, "2": {...} }
    feedback: text("feedback", { mode: "json" })
      .$type<Record<string, Record<string, "good" | "bad">>>()
      .notNull()
      .default({}),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    userQueryIdx: index("refine_sessions_user_query_idx").on(
      table.userId,
      table.query,
    ),
  })
);

// Type exports
export type Palette = typeof palettes.$inferSelect;
export type NewPalette = typeof palettes.$inferInsert;
export type Like = typeof likes.$inferSelect;
export type NewLike = typeof likes.$inferInsert;
export type SearchFeedback = typeof searchFeedback.$inferSelect;
export type NewSearchFeedback = typeof searchFeedback.$inferInsert;
export type RefineSession = typeof refineSessions.$inferSelect;
export type NewRefineSession = typeof refineSessions.$inferInsert;

