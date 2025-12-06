import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get palette by ID (internal use for batch processing)
 */
export const getById = internalQuery({
  args: { id: v.id("palettes") },
  returns: v.union(
    v.object({
      _id: v.id("palettes"),
      _creationTime: v.number(),
      seed: v.string(),
      imageUrl: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/**
 * Check if a seed exists in the database
 */
export const seedExists = query({
  args: { seed: v.string() },
  handler: async (ctx, args) => {
    const palette = await ctx.db
      .query("palettes")
      .withIndex("by_seed", (q) => q.eq("seed", args.seed))
      .first();
    return !!palette;
  },
});

/**
 * Get all palettes with their tags
 */
export const listPalettes = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const palettes = await ctx.db
      .query("palettes")
      .order("desc")
      .take(limit);

    return palettes;
  },
});

/**
 * Get a single palette with all its tags
 */
export const getPaletteWithTags = query({
  args: { seed: v.string() },
  handler: async (ctx, args) => {
    const palette = await ctx.db
      .query("palettes")
      .withIndex("by_seed", (q) => q.eq("seed", args.seed))
      .first();

    if (!palette) {
      return null;
    }

    // Get raw tags from all providers
    const rawTags = await ctx.db
      .query("palette_tags")
      .filter((q) => q.eq(q.field("seed"), args.seed))
      .collect();

    // Get refined tags
    const refined = await ctx.db
      .query("palette_tag_refined")
      .withIndex("by_seed", (q) => q.eq("seed", args.seed))
      .first();

    return {
      ...palette,
      rawTags,
      refinedTags: refined,
    };
  },
});

/**
 * Get all palettes with tag counts
 */
export const listPalettesWithStatus = query({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    filter: v.optional(
      v.union(
        v.literal("all"),
        v.literal("needs_tags"),
        v.literal("needs_refinement")
      )
    ),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const offset = args.offset ?? 0;
    const filter = args.filter ?? "all";

    // Get all palettes
    const allPalettes = await ctx.db.query("palettes").order("desc").collect();

    // Get tag counts and refined status
    const allTags = await ctx.db.query("palette_tags").collect();
    const allRefined = await ctx.db.query("palette_tag_refined").collect();

    // Create lookup maps
    const tagCounts = new Map<string, number>();
    for (const tag of allTags) {
      tagCounts.set(tag.seed, (tagCounts.get(tag.seed) ?? 0) + 1);
    }

    const refinedSeeds = new Set(allRefined.map((r) => r.seed));

    // Attach tag info to all palettes first
    const allPalettesWithStatus = allPalettes.map((p) => ({
      ...p,
      tagCount: tagCounts.get(p.seed) ?? 0,
      isRefined: refinedSeeds.has(p.seed),
    }));

    // Apply filter
    let filteredPalettes = allPalettesWithStatus;
    if (filter === "needs_tags") {
      // "Tagged" filter - show palettes that have tags
      filteredPalettes = allPalettesWithStatus.filter((p) => p.tagCount > 0);
    } else if (filter === "needs_refinement") {
      filteredPalettes = allPalettesWithStatus.filter(
        (p) => p.tagCount > 0 && !p.isRefined
      );
    }

    const total = filteredPalettes.length;
    const palettes = filteredPalettes.slice(offset, offset + limit);

    return {
      palettes,
      total,
      hasMore: offset + limit < total,
    };
  },
});
