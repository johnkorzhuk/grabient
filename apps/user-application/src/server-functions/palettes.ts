import { createServerFn } from "@tanstack/react-start";
import {
    getPopularPalettesPaginated,
    getUserLikesWithCounts,
} from "@repo/data-ops/queries/palettes";
import { getDb } from "@repo/data-ops/database/setup";
import * as v from "valibot";
import { desc, asc, sql, eq } from "drizzle-orm";
import { palettes, likes, paletteTags } from "@repo/data-ops/drizzle/app-schema";
import { auth_user } from "@repo/data-ops/drizzle/auth-schema";
import {
    optionalAuthFunctionMiddleware,
    protectedFunctionMiddleware,
} from "@/core/middleware/auth";
import { rateLimitFunctionMiddleware } from "@/core/middleware/rate-limit-function";
import {
    paletteStyleValidator,
    stepsValidator,
    angleValidator,
    seedValidator,
} from "@repo/data-ops/valibot-schema/grabient";

const palettesSchema = v.object({
    page: v.pipe(v.number(), v.minValue(1)),
    limit: v.pipe(v.number(), v.minValue(1), v.maxValue(100)),
    orderBy: v.optional(v.picklist(["popular", "newest", "oldest"]), "popular"),
});

const basePalettesFunction = createServerFn({ method: "GET" }).middleware([
    optionalAuthFunctionMiddleware,
    rateLimitFunctionMiddleware("paletteRead"),
]);

export const getPalettesPaginated = basePalettesFunction
    .inputValidator((input) => v.parse(palettesSchema, input))
    .handler(async (ctx) => {
        const { page, limit, orderBy = "popular" } = ctx.data;
        const db = getDb();
        const offset = (page - 1) * limit;

        if (orderBy === "popular") {
            const { palettes: popularPalettes, total } =
                await getPopularPalettesPaginated(page, limit, db);

            return {
                palettes: popularPalettes.map((p) => ({
                    seed: p.id,
                    style: p.style,
                    steps: p.steps,
                    angle: p.angle,
                    createdAt: p.createdAt,
                    likesCount: p.likesCount,
                })),
                total,
                totalPages: Math.ceil(total / limit),
            };
        }

        const orderFn = orderBy === "newest" ? desc : asc;

        const likesCountSql = sql<number>`COUNT(DISTINCT ${likes.userId})`;

        const [palettesResult, countResult] = await Promise.all([
            db
                .select({
                    id: palettes.id,
                    style: palettes.style,
                    steps: palettes.steps,
                    angle: palettes.angle,
                    createdAt: palettes.createdAt,
                    likesCount: likesCountSql,
                })
                .from(palettes)
                .leftJoin(likes, eq(palettes.id, likes.paletteId))
                .groupBy(palettes.id)
                .orderBy(orderFn(palettes.createdAt))
                .limit(limit)
                .offset(offset),
            db.select({ count: sql<number>`count(*)` }).from(palettes),
        ]);

        return {
            palettes: palettesResult.map((p) => ({
                seed: p.id,
                style: p.style,
                steps: p.steps,
                angle: p.angle,
                createdAt: p.createdAt,
                likesCount: p.likesCount,
            })),
            total: countResult[0]?.count || 0,
            totalPages: Math.ceil((countResult[0]?.count || 0) / limit),
        };
    });

const userLikesSchema = v.object({
    page: v.pipe(v.number(), v.minValue(1)),
    limit: v.pipe(v.number(), v.minValue(1), v.maxValue(100)),
});

const baseProtectedFunction = createServerFn({ method: "GET" }).middleware([
    protectedFunctionMiddleware,
    rateLimitFunctionMiddleware("userPalettes"),
]);

export const getUserLikedPalettes = baseProtectedFunction
    .inputValidator((input) => v.parse(userLikesSchema, input))
    .handler(async (ctx) => {
        const { page, limit } = ctx.data;
        const userId = ctx.context.userId;
        const db = getDb();

        if (!userId) {
            throw new Error("User ID is required");
        }

        const offset = (page - 1) * limit;

        const userLikes = await getUserLikesWithCounts(userId, 1000, db);
        const total = userLikes.length;
        const paginatedLikes = userLikes.slice(offset, offset + limit);

        return {
            palettes: paginatedLikes.map((like) => ({
                seed: like.paletteId,
                style: like.style as typeof like.style,
                steps: like.steps as number,
                angle: like.angle as number,
                likesCount: like.likesCount as number,
                createdAt: like.createdAt as Date,
                isLiked: true as const,
            })),
            total,
            totalPages: Math.ceil(total / limit),
        };
    });

const toggleLikeSchema = v.object({
    seed: seedValidator,
    steps: stepsValidator,
    style: paletteStyleValidator,
    angle: angleValidator,
});

const baseToggleLikeFunction = createServerFn({ method: "GET" }).middleware([
    protectedFunctionMiddleware,
    rateLimitFunctionMiddleware("toggleLike"),
]);

export const toggleLikePalette = baseToggleLikeFunction
    .inputValidator((input) => v.parse(toggleLikeSchema, input))
    .handler(async (ctx) => {
        const { seed, steps, style, angle } = ctx.data;
        const userId = ctx.context.userId;

        if (!userId) {
            throw new Error("User ID is required");
        }

        console.log('[Server toggleLikePalette] Received:', { userId, seed, steps, style, angle });

        const { toggleLikePalette } = await import(
            "@repo/data-ops/queries/palettes"
        );
        const db = getDb();

        console.log('[Server toggleLikePalette] Calling data-ops toggleLikePalette');
        const result = await toggleLikePalette(
            userId,
            seed,
            steps,
            style,
            angle,
            db,
        );

        console.log('[Server toggleLikePalette] Result:', result);
        return result;
    });

export const getUserLikedSeeds = basePalettesFunction.handler(async (ctx) => {
    const userId = ctx.context.userId;

    if (!userId) {
        return { seeds: [] };
    }

    const { getUserLikedSeeds } = await import(
        "@repo/data-ops/queries/palettes"
    );
    const db = getDb();
    const seeds = await getUserLikedSeeds(userId, db);
    return { seeds };
});

const paletteLikeInfoSchema = v.object({
    seed: seedValidator,
});

const basePaletteLikeInfoFunction = createServerFn({ method: "GET" }).middleware([
    optionalAuthFunctionMiddleware,
]);

export const getPaletteLikeInfo = basePaletteLikeInfoFunction
    .inputValidator((input) => v.parse(paletteLikeInfoSchema, input))
    .handler(async (ctx) => {
        const { seed } = ctx.data;
        const userId = ctx.context.userId;
        const db = getDb();

        const likesCountSql = sql<number>`COUNT(DISTINCT ${likes.userId})`;

        const result = await db
            .select({
                likesCount: likesCountSql,
            })
            .from(palettes)
            .leftJoin(likes, eq(palettes.id, likes.paletteId))
            .where(eq(palettes.id, seed))
            .groupBy(palettes.id);

        const likesCount = result[0]?.likesCount ?? 0;

        let isLiked = false;
        if (userId) {
            const { and } = await import("drizzle-orm");
            const userLike = await db
                .select()
                .from(likes)
                .where(and(eq(likes.paletteId, seed), eq(likes.userId, userId)))
                .limit(1);

            isLiked = userLike.length > 0;
        }

        return {
            likesCount,
            isLiked,
        };
    });

const paletteTagsSchema = v.object({
    seed: seedValidator,
    promptVersion: v.optional(v.string()),
});

const baseAdminFunction = createServerFn({ method: "GET" }).middleware([
    protectedFunctionMiddleware,
]);

export const getPaletteTagsForSeed = baseAdminFunction
    .inputValidator((input) => v.parse(paletteTagsSchema, input))
    .handler(async (ctx) => {
        const { seed, promptVersion } = ctx.data;
        const userId = ctx.context.userId;
        const db = getDb();

        if (!userId) {
            throw new Error("Unauthorized");
        }

        // Check if user is admin
        const user = await db
            .select({ role: auth_user.role })
            .from(auth_user)
            .where(eq(auth_user.id, userId))
            .limit(1);

        if (!user[0] || user[0].role !== "admin") {
            throw new Error("Unauthorized: Admin access required");
        }

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

        // Get unique prompt versions for filter dropdown, ordered by most recent first
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
