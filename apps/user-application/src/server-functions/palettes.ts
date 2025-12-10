import { createServerFn } from "@tanstack/react-start";
import {
    getPopularPalettesPaginated,
    getUserLikesWithCounts,
} from "@repo/data-ops/queries/palettes";
import { getDb } from "@repo/data-ops/database/setup";
import * as v from "valibot";
import { desc, asc, sql, eq } from "drizzle-orm";
import { palettes, likes } from "@repo/data-ops/drizzle/app-schema";
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
    pageLimitValidator,
} from "@repo/data-ops/valibot-schema/grabient";

const palettesSchema = v.object({
    page: v.pipe(v.number(), v.minValue(1)),
    limit: pageLimitValidator,
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
    limit: pageLimitValidator,
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

