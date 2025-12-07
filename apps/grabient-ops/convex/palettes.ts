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

    // Get ALL refined tags (multiple models can refine same palette)
    const allRefinedTags = await ctx.db
      .query("palette_tag_refined")
      .withIndex("by_seed", (q) => q.eq("seed", args.seed))
      .collect();

    // Get unique prompt versions, sorted by most recent first
    const versionMap = new Map<string, number>();
    for (const tag of rawTags) {
      if (tag.promptVersion) {
        const existing = versionMap.get(tag.promptVersion) ?? 0;
        versionMap.set(tag.promptVersion, Math.max(existing, tag._creationTime));
      }
    }
    const availableVersions = Array.from(versionMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([version]) => version);

    // Get unique refinement models, sorted by most recent first
    const availableRefinementModels = [...new Set(allRefinedTags.map(r => r.model))]
      .sort((a, b) => {
        const aTime = allRefinedTags.find(r => r.model === a)?._creationTime ?? 0;
        const bTime = allRefinedTags.find(r => r.model === b)?._creationTime ?? 0;
        return bTime - aTime;
      });

    return {
      ...palette,
      rawTags,
      allRefinedTags,
      // Keep for backward compatibility - first refinement (latest)
      refinedTags: allRefinedTags.length > 0 ? allRefinedTags.sort((a, b) => b._creationTime - a._creationTime)[0] : null,
      availableVersions,
      availableRefinementModels,
    };
  },
});

/**
 * Get palettes with tag counts (paginated, efficient)
 * Uses take() for efficient pagination - only reads what's needed
 */
export const listPalettesWithStatus = query({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const offset = args.offset ?? 0;

    // Get total count from cache
    const cached = await ctx.db
      .query("stats_cache")
      .withIndex("by_key", (q) => q.eq("key", "refinement_status"))
      .first();
    const total = cached?.data?.totalPalettes ?? 0;

    // For first page, use efficient take()
    // For later pages, we need to skip - this is less efficient but rare
    let pageData;
    if (offset === 0) {
      pageData = await ctx.db
        .query("palettes")
        .order("desc")
        .take(limit);
    } else {
      // For offset > 0, we need to skip items
      // This is less efficient but pagination beyond page 1 is less common
      const allUpToLimit = await ctx.db
        .query("palettes")
        .order("desc")
        .take(offset + limit);
      pageData = allUpToLimit.slice(offset);
    }

    if (pageData.length === 0) {
      return {
        palettes: [],
        total,
        hasMore: false,
      };
    }

    // Only look up status for the palettes on this page
    const palettesWithStatus = await Promise.all(
      pageData.map(async (p) => {
        // Count tags for this seed using index
        const tags = await ctx.db
          .query("palette_tags")
          .withIndex("by_seed_provider", (q) => q.eq("seed", p.seed))
          .collect();

        // Check if refined
        const refined = await ctx.db
          .query("palette_tag_refined")
          .withIndex("by_seed", (q) => q.eq("seed", p.seed))
          .first();

        return {
          ...p,
          tagCount: tags.length,
          isRefined: !!refined,
        };
      })
    );

    return {
      palettes: palettesWithStatus,
      total,
      hasMore: offset + limit < total,
    };
  },
});
