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

export const paletteTags = sqliteTable(
  "palette_tags",
  {
    id: text("id").primaryKey(),
    seed: text("seed").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    runNumber: integer("run_number").notNull().default(1),
    promptVersion: text("prompt_version"),
    tags: text("tags"), // JSON blob of TagResponse
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    seedProviderRunIdx: index("palette_tags_seed_provider_run_idx").on(
      table.seed,
      table.provider,
      table.runNumber
    ),
    seedIdx: index("palette_tags_seed_idx").on(table.seed),
    runIdx: index("palette_tags_run_idx").on(table.runNumber),
    promptVersionIdx: index("palette_tags_prompt_version_idx").on(table.promptVersion),
  })
);

// Smart model refinement results (Opus 4.5)
export const paletteTagRefinements = sqliteTable(
  "palette_tag_refinements",
  {
    id: text("id").primaryKey(),
    seed: text("seed").notNull(),
    model: text("model").notNull(), // e.g., "claude-opus-4-5-20250514"
    promptVersion: text("prompt_version"), // Version of the refinement prompt
    sourcePromptVersion: text("source_prompt_version"), // Version of dumb model tags used as input

    // Input summary (what was sent to the smart model)
    inputSummary: text("input_summary"), // JSON: the aggregated data from dumb models

    // Refined output
    refinedTags: text("refined_tags"), // JSON: final curated tag list

    // Analysis metadata
    analysis: text("analysis"), // JSON: reasoning about promotions/demotions/additions

    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    seedIdx: index("palette_tag_refinements_seed_idx").on(table.seed),
    promptVersionIdx: index("palette_tag_refinements_prompt_version_idx").on(table.promptVersion),
    sourcePromptVersionIdx: index("palette_tag_refinements_source_prompt_version_idx").on(table.sourcePromptVersion),
  })
);

// Type exports
export type Palette = typeof palettes.$inferSelect;
export type NewPalette = typeof palettes.$inferInsert;
export type Like = typeof likes.$inferSelect;
export type NewLike = typeof likes.$inferInsert;
export type PaletteTag = typeof paletteTags.$inferSelect;
export type NewPaletteTag = typeof paletteTags.$inferInsert;
export type PaletteTagRefinement = typeof paletteTagRefinements.$inferSelect;
export type NewPaletteTagRefinement = typeof paletteTagRefinements.$inferInsert;

