import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@repo/data-ops/database/setup";
import { refineSessions } from "@repo/data-ops/drizzle/app-schema";
import { optionalAuthFunctionMiddleware } from "@/core/middleware/auth";
import * as v from "valibot";
import { eq, and, desc } from "drizzle-orm";

const saveFeedbackSchema = v.object({
    sessionId: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
    seed: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
    feedback: v.picklist(["good", "bad"]),
});

export const saveGenerateSessionFeedback = createServerFn({ method: "POST" })
    .middleware([optionalAuthFunctionMiddleware])
    .inputValidator((input) => v.parse(saveFeedbackSchema, input))
    .handler(async (ctx) => {
        const { sessionId, seed, feedback } = ctx.data;
        const userId = ctx.context.userId;

        const db = getDb();

        // Find the session
        const results = await db
            .select()
            .from(refineSessions)
            .where(eq(refineSessions.id, sessionId))
            .limit(1);

        const session = results[0];
        if (!session) {
            throw new Error("Session not found");
        }

        // Verify session belongs to user if user is logged in
        if (userId && session.userId && session.userId !== userId) {
            throw new Error("Unauthorized");
        }

        // Get the current version's feedback
        const currentVersion = String(session.version);
        const existingFeedback = session.feedback ?? {};
        const versionFeedback = existingFeedback[currentVersion] ?? {};

        // Update feedback for this seed
        const updatedFeedback = {
            ...existingFeedback,
            [currentVersion]: {
                ...versionFeedback,
                [seed]: feedback,
            },
        };

        // If feedback is "bad", remove the palette from generatedSeeds
        let updatedSeeds = session.generatedSeeds;
        if (feedback === "bad") {
            const existingSeeds = session.generatedSeeds ?? {};
            const versionPalettes = existingSeeds[currentVersion] ?? [];
            // Handle both old format (string[]) and new format (object[])
            const filteredPalettes = versionPalettes.filter((p: unknown) => {
                if (typeof p === 'string') return p !== seed;
                if (typeof p === 'object' && p !== null && 'seed' in p) {
                    return (p as { seed: string }).seed !== seed;
                }
                return true;
            });
            updatedSeeds = {
                ...existingSeeds,
                [currentVersion]: filteredPalettes,
            } as typeof session.generatedSeeds;
        }

        // Save updated feedback and seeds
        await db
            .update(refineSessions)
            .set({
                feedback: updatedFeedback,
                generatedSeeds: updatedSeeds,
                updatedAt: new Date(),
            })
            .where(eq(refineSessions.id, sessionId));

        return { success: true };
    });

const deleteFeedbackSchema = v.object({
    sessionId: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
    seed: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
});

export const deleteGenerateSessionFeedback = createServerFn({ method: "POST" })
    .middleware([optionalAuthFunctionMiddleware])
    .inputValidator((input) => v.parse(deleteFeedbackSchema, input))
    .handler(async (ctx) => {
        const { sessionId, seed } = ctx.data;
        const userId = ctx.context.userId;

        const db = getDb();

        // Find the session
        const results = await db
            .select()
            .from(refineSessions)
            .where(eq(refineSessions.id, sessionId))
            .limit(1);

        const session = results[0];
        if (!session) {
            throw new Error("Session not found");
        }

        // Verify session belongs to user if user is logged in
        if (userId && session.userId && session.userId !== userId) {
            throw new Error("Unauthorized");
        }

        // Get the current version's feedback
        const currentVersion = String(session.version);
        const existingFeedback = session.feedback ?? {};
        const versionFeedback = { ...(existingFeedback[currentVersion] ?? {}) };

        // Remove feedback for this seed
        delete versionFeedback[seed];

        const updatedFeedback = {
            ...existingFeedback,
            [currentVersion]: versionFeedback,
        };

        // Save updated feedback
        await db
            .update(refineSessions)
            .set({
                feedback: updatedFeedback,
                updatedAt: new Date(),
            })
            .where(eq(refineSessions.id, sessionId));

        return { success: true };
    });

const getSessionFeedbackSchema = v.object({
    sessionId: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
});

export const getGenerateSessionFeedback = createServerFn({ method: "GET" })
    .middleware([optionalAuthFunctionMiddleware])
    .inputValidator((input) => v.parse(getSessionFeedbackSchema, input))
    .handler(async (ctx) => {
        const { sessionId } = ctx.data;

        const db = getDb();

        const results = await db
            .select({
                feedback: refineSessions.feedback,
                version: refineSessions.version,
            })
            .from(refineSessions)
            .where(eq(refineSessions.id, sessionId))
            .limit(1);

        const session = results[0];
        if (!session) {
            return { feedback: {}, version: 1 };
        }

        // Return feedback for the current version
        const currentVersion = String(session.version);
        const versionFeedback = session.feedback?.[currentVersion] ?? {};

        return {
            feedback: versionFeedback as Record<string, "good" | "bad">,
            version: session.version,
        };
    });

// Normalize query for consistent lookup (same as in generate.ts)
function normalizeQuery(query: string): string {
    return query.toLowerCase().trim();
}

const getSessionByQuerySchema = v.object({
    query: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
});

export const getGenerateSessionByQuery = createServerFn({ method: "GET" })
    .middleware([optionalAuthFunctionMiddleware])
    .inputValidator((input) => v.parse(getSessionByQuerySchema, input))
    .handler(async (ctx) => {
        const { query } = ctx.data;
        const userId = ctx.context.userId;
        const normalizedQuery = normalizeQuery(query);

        const db = getDb();

        // Find session by query, prioritizing user's session if authenticated
        let results;
        if (userId) {
            // For authenticated users, find their session for this query
            results = await db
                .select()
                .from(refineSessions)
                .where(
                    and(
                        eq(refineSessions.query, normalizedQuery),
                        eq(refineSessions.userId, userId),
                    ),
                )
                .orderBy(desc(refineSessions.updatedAt))
                .limit(1);
        } else {
            // For anonymous users, find any session for this query without a userId
            results = await db
                .select()
                .from(refineSessions)
                .where(eq(refineSessions.query, normalizedQuery))
                .orderBy(desc(refineSessions.updatedAt))
                .limit(1);
        }

        const session = results[0];
        if (!session) {
            return null;
        }

        return {
            sessionId: session.id,
            version: session.version,
            generatedSeeds: session.generatedSeeds,
            feedback: session.feedback,
        };
    });

// Palette metadata shape for generated palettes
const paletteMetadataSchema = v.object({
    seed: v.string(),
    style: v.picklist(["angularGradient", "angularSwatches", "linearGradient", "linearSwatches"]),
    steps: v.number(),
    angle: v.number(),
    keyword: v.string(),
});

const saveGeneratedSeedsSchema = v.object({
    sessionId: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
    version: v.number(),
    palettes: v.array(paletteMetadataSchema),
});

export const saveGenerateSessionSeeds = createServerFn({ method: "POST" })
    .middleware([optionalAuthFunctionMiddleware])
    .inputValidator((input) => v.parse(saveGeneratedSeedsSchema, input))
    .handler(async (ctx) => {
        const { sessionId, version, palettes } = ctx.data;
        const userId = ctx.context.userId;

        const db = getDb();

        // Find the session
        const results = await db
            .select()
            .from(refineSessions)
            .where(eq(refineSessions.id, sessionId))
            .limit(1);

        const session = results[0];
        if (!session) {
            throw new Error("Session not found");
        }

        // Verify session belongs to user if user is logged in
        if (userId && session.userId && session.userId !== userId) {
            throw new Error("Unauthorized");
        }

        // Update generated palettes for this version
        const existingSeeds = session.generatedSeeds ?? {};
        const versionKey = String(version);
        const existingVersionPalettes = existingSeeds[versionKey] ?? [];

        // Append new palettes (deduped by seed)
        const existingPaletteSeeds = new Set(existingVersionPalettes.map(p => p.seed));
        const newPalettes = palettes.filter(p => !existingPaletteSeeds.has(p.seed));
        const allPalettes = [...existingVersionPalettes, ...newPalettes];

        const updatedSeeds = {
            ...existingSeeds,
            [versionKey]: allPalettes,
        };

        await db
            .update(refineSessions)
            .set({
                generatedSeeds: updatedSeeds,
                updatedAt: new Date(),
            })
            .where(eq(refineSessions.id, sessionId));

        return { success: true };
    });
