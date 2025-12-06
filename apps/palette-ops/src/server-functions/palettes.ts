import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@repo/data-ops/database/setup";
import { desc, asc, eq, sql, inArray } from "drizzle-orm";
import { paletteTags, likes, palettes } from "@repo/data-ops/drizzle/app-schema";
import { auth_user } from "@repo/data-ops/drizzle/auth-schema";
import * as v from "valibot";

const paletteTagsSchema = v.object({
  seed: v.string(),
  promptVersion: v.optional(v.string()),
});

/**
 * Get palette tags for a seed - no auth check since entire app is admin-only
 */
export const getPaletteTagsForSeed = createServerFn({ method: "GET" })
  .inputValidator((input) => v.parse(paletteTagsSchema, input))
  .handler(async ({ data: { seed, promptVersion } }) => {
    const db = getDb();

    // Build query with optional prompt version filter
    const { and } = await import("drizzle-orm");
    const whereConditions = promptVersion
      ? and(eq(paletteTags.seed, seed), eq(paletteTags.promptVersion, promptVersion))
      : eq(paletteTags.seed, seed);

    // Fetch all tags for this seed
    const tags = await db
      .select()
      .from(paletteTags)
      .where(whereConditions)
      .orderBy(desc(paletteTags.runNumber), asc(paletteTags.provider));

    // Get unique prompt versions for filter dropdown
    const versionsResult = await db
      .select({
        promptVersion: paletteTags.promptVersion,
        maxCreatedAt: sql<number>`MAX(${paletteTags.createdAt})`.as("max_created_at"),
      })
      .from(paletteTags)
      .where(eq(paletteTags.seed, seed))
      .groupBy(paletteTags.promptVersion)
      .orderBy(desc(sql`max_created_at`));

    const availableVersions = versionsResult
      .map((v) => v.promptVersion)
      .filter((v): v is string => v !== null);

    return {
      tags: tags.map((t) => ({
        id: t.id,
        seed: t.seed,
        provider: t.provider,
        model: t.model,
        runNumber: t.runNumber,
        promptVersion: t.promptVersion,
        tags: t.tags ? JSON.parse(t.tags) : null,
        error: t.error,
        createdAt: t.createdAt,
      })),
      availableVersions,
    };
  });

const adminLikedPalettesSchema = v.object({
  page: v.pipe(v.number(), v.minValue(1)),
  limit: v.pipe(v.number(), v.minValue(1), v.maxValue(100)),
});

/**
 * Get palettes liked by admin users with pagination
 * Queries users with role='admin' and returns their liked palettes
 */
export const getAdminLikedPalettes = createServerFn({ method: "GET" })
  .inputValidator((input) => v.parse(adminLikedPalettesSchema, input))
  .handler(async ({ data: { page, limit } }) => {
    const db = getDb();
    const offset = (page - 1) * limit;

    // First, get all admin user IDs
    const adminUsers = await db
      .select({ id: auth_user.id })
      .from(auth_user)
      .where(eq(auth_user.role, "admin"));

    const adminIds = adminUsers.map((u) => u.id);

    if (adminIds.length === 0) {
      return { palettes: [], total: 0, totalPages: 0 };
    }

    // Get unique palette IDs liked by admins with the most recent like date
    // Using a subquery to get distinct palettes with their latest like time
    const likedPalettesQuery = db
      .select({
        paletteId: likes.paletteId,
        latestLike: sql<number>`MAX(${likes.createdAt})`.as("latest_like"),
      })
      .from(likes)
      .where(inArray(likes.userId, adminIds))
      .groupBy(likes.paletteId)
      .orderBy(desc(sql`latest_like`))
      .as("liked_palettes");

    // Count total
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(likedPalettesQuery);
    const total = countResult[0]?.count ?? 0;

    // Get paginated palette IDs
    const likedPaletteIds = await db
      .select({
        paletteId: likedPalettesQuery.paletteId,
      })
      .from(likedPalettesQuery)
      .limit(limit)
      .offset(offset);

    if (likedPaletteIds.length === 0) {
      return { palettes: [], total, totalPages: Math.ceil(total / limit) };
    }

    const paletteIds = likedPaletteIds.map((p) => p.paletteId);

    // Get full palette data
    const paletteData = await db
      .select({
        id: palettes.id,
        style: palettes.style,
        steps: palettes.steps,
        angle: palettes.angle,
        createdAt: palettes.createdAt,
      })
      .from(palettes)
      .where(inArray(palettes.id, paletteIds));

    // Sort by the order from likedPaletteIds
    const paletteMap = new Map(paletteData.map((p) => [p.id, p]));
    const sortedPalettes = paletteIds
      .map((id) => paletteMap.get(id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    return {
      palettes: sortedPalettes.map((p) => ({
        seed: p.id,
        style: p.style,
        steps: p.steps,
        angle: p.angle,
        createdAt: p.createdAt,
      })),
      total,
      totalPages: Math.ceil(total / limit),
    };
  });

/**
 * Get all liked seeds for admin users (simple list for backwards compat)
 */
export const getAdminLikedSeeds = createServerFn({ method: "GET" })
  .handler(async () => {
    const db = getDb();

    // Get all admin user IDs
    const adminUsers = await db
      .select({ id: auth_user.id })
      .from(auth_user)
      .where(eq(auth_user.role, "admin"));

    const adminIds = adminUsers.map((u) => u.id);

    if (adminIds.length === 0) {
      return { seeds: [] };
    }

    // Get unique palette IDs liked by admins
    const result = await db
      .select({
        paletteId: likes.paletteId,
        latestLike: sql<number>`MAX(${likes.createdAt})`.as("latest_like"),
      })
      .from(likes)
      .where(inArray(likes.userId, adminIds))
      .groupBy(likes.paletteId)
      .orderBy(desc(sql`latest_like`));

    return {
      seeds: result.map((r) => r.paletteId),
    };
  });
