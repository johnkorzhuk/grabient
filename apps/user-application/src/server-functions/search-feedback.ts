import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@repo/data-ops/database/setup";
import { searchFeedback } from "@repo/data-ops/drizzle/app-schema";
import { protectedFunctionMiddleware } from "@/core/middleware/auth";
import { rateLimitFunctionMiddleware } from "@/core/middleware/rate-limit-function";
import * as v from "valibot";
import { and, eq } from "drizzle-orm";

const saveFeedbackSchema = v.object({
    query: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
    seed: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
    feedback: v.picklist(["good", "bad"]),
});

export const saveSearchFeedback = createServerFn({ method: "POST" })
    .middleware([protectedFunctionMiddleware, rateLimitFunctionMiddleware("searchFeedback")])
    .inputValidator((input) => v.parse(saveFeedbackSchema, input))
    .handler(async (ctx) => {
        const { query, seed, feedback } = ctx.data;
        const userId = ctx.context.userId;

        if (!userId) {
            throw new Error("Unauthorized");
        }

        const db = getDb();

        // Upsert the feedback (INSERT OR REPLACE since we have a composite primary key)
        await db
            .insert(searchFeedback)
            .values({
                userId,
                query,
                seed,
                feedback,
                createdAt: new Date(),
            })
            .onConflictDoUpdate({
                target: [searchFeedback.userId, searchFeedback.query, searchFeedback.seed],
                set: {
                    feedback,
                    createdAt: new Date(),
                },
            });

        return { success: true };
    });

const getFeedbackSchema = v.object({
    query: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
});

export const getSearchFeedbackForQuery = createServerFn({ method: "GET" })
    .middleware([protectedFunctionMiddleware])
    .inputValidator((input) => v.parse(getFeedbackSchema, input))
    .handler(async (ctx) => {
        const { query } = ctx.data;
        const userId = ctx.context.userId;

        if (!userId) {
            return { feedback: {} };
        }

        const db = getDb();

        const results = await db
            .select({
                seed: searchFeedback.seed,
                feedback: searchFeedback.feedback,
            })
            .from(searchFeedback)
            .where(
                and(
                    eq(searchFeedback.userId, userId),
                    eq(searchFeedback.query, query)
                )
            );

        const feedbackMap: Record<string, "good" | "bad"> = {};
        for (const row of results) {
            feedbackMap[row.seed] = row.feedback as "good" | "bad";
        }

        return { feedback: feedbackMap };
    });

export const getBadSeedsForQuery = createServerFn({ method: "GET" })
    .middleware([protectedFunctionMiddleware])
    .inputValidator((input) => v.parse(getFeedbackSchema, input))
    .handler(async (ctx) => {
        const { query } = ctx.data;
        const userId = ctx.context.userId;

        if (!userId) {
            return { badSeeds: [] };
        }

        const db = getDb();

        const results = await db
            .select({ seed: searchFeedback.seed })
            .from(searchFeedback)
            .where(
                and(
                    eq(searchFeedback.userId, userId),
                    eq(searchFeedback.query, query),
                    eq(searchFeedback.feedback, "bad")
                )
            );

        return { badSeeds: results.map((r) => r.seed) };
    });

const deleteFeedbackSchema = v.object({
    query: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
    seed: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
});

export const deleteSearchFeedback = createServerFn({ method: "POST" })
    .middleware([protectedFunctionMiddleware, rateLimitFunctionMiddleware("searchFeedback")])
    .inputValidator((input) => v.parse(deleteFeedbackSchema, input))
    .handler(async (ctx) => {
        const { query, seed } = ctx.data;
        const userId = ctx.context.userId;

        if (!userId) {
            throw new Error("Unauthorized");
        }

        const db = getDb();

        await db
            .delete(searchFeedback)
            .where(
                and(
                    eq(searchFeedback.userId, userId),
                    eq(searchFeedback.query, query),
                    eq(searchFeedback.seed, seed)
                )
            );

        return { success: true };
    });
