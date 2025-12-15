import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import * as v from "valibot";
import { rateLimitFunctionMiddleware } from "@/core/middleware/rate-limit-function";
import { optionalAuthFunctionMiddleware } from "@/core/middleware/auth";
import { DEFAULT_PAGE_LIMIT } from "@repo/data-ops/valibot-schema/grabient";
import { searchInputSchema } from "@/lib/validators/search";
import {
    seedValidator,
    paletteStyleValidator,
    stepsValidator,
    angleValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import { replaceHexWithColorNames } from "@repo/data-ops/color-utils";
import { getDb } from "@repo/data-ops/database/setup";
import { searchFeedback } from "@repo/data-ops/drizzle/app-schema";
import { eq, and } from "drizzle-orm";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 3; // 3 days

const vectorMetadataSchema = v.object({
    seed: seedValidator,
    tags: v.array(v.string()),
    style: paletteStyleValidator,
    steps: stepsValidator,
    angle: angleValidator,
    likesCount: v.number(),
    createdAt: v.number(),
});

const searchResultSchema = v.object({
    ...vectorMetadataSchema.entries,
    score: v.number(),
});

export type SearchResult = v.InferOutput<typeof searchResultSchema>;

function getCacheKey(query: string, limit: number): string {
    return `search:${query.toLowerCase().trim()}:${limit}`;
}

// Max extra palettes to fetch for filtering (prevents abuse)
// Combined with MAX_PAGE_LIMIT (96), max fetch is 196
const MAX_EXTRA_PALETTES = 100;

const baseSearchFunction = createServerFn({ method: "GET" }).middleware([
    optionalAuthFunctionMiddleware,
    rateLimitFunctionMiddleware("paletteRead"),
]);

export const searchPalettes = baseSearchFunction
    .inputValidator((input) => v.parse(searchInputSchema, input))
    .handler(async (ctx) => {
        const { query, limit = DEFAULT_PAGE_LIMIT } = ctx.data;
        const userId = ctx.context.userId;

        // Vectorize and AI bindings require remote: true in wrangler config
        if (!env.AI || !env.VECTORIZE) {
            console.warn(
                "Search unavailable: AI/Vectorize bindings not available",
            );
            return { results: [] as SearchResult[] };
        }

        // Replace hex codes with color names before processing
        const normalizedQuery = replaceHexWithColorNames(query);

        // For authenticated users, get their bad seeds to filter out
        let badSeeds = new Set<string>();
        if (userId) {
            try {
                const db = getDb();
                const feedbackRows = await db
                    .select({ seed: searchFeedback.seed })
                    .from(searchFeedback)
                    .where(
                        and(
                            eq(searchFeedback.userId, userId),
                            eq(searchFeedback.query, query),
                            eq(searchFeedback.feedback, "bad")
                        )
                    );
                badSeeds = new Set(feedbackRows.map((r) => r.seed));
            } catch (e) {
                console.warn("Failed to fetch user feedback:", e);
            }
        }

        // Calculate how many extra results to fetch (capped for abuse prevention)
        const extraToFetch = Math.min(badSeeds.size, MAX_EXTRA_PALETTES);
        const totalToFetch = limit + extraToFetch;

        // For anonymous users, use KV cache
        // For authenticated users with bad seeds, skip cache (personalized results)
        const cacheKey = getCacheKey(normalizedQuery, limit);
        const useCache = !userId || badSeeds.size === 0;

        if (useCache && env.SEARCH_CACHE) {
            try {
                const cached = await env.SEARCH_CACHE.get<SearchResult[]>(
                    cacheKey,
                    "json",
                );
                if (cached) {
                    return { results: cached };
                }
            } catch (e) {
                console.warn("KV cache read error:", e);
            }
        }

        const embeddingResponse = await env.AI.run(
            "@cf/google/embeddinggemma-300m",
            {
                text: [normalizedQuery],
            },
        );

        // Response can be AsyncResponse (has request_id) or actual embedding (has data)
        if (!("data" in embeddingResponse) || !embeddingResponse.data) {
            return { results: [] as SearchResult[] };
        }

        const queryVector = embeddingResponse.data[0];
        if (!queryVector) {
            return { results: [] as SearchResult[] };
        }

        const matches = await env.VECTORIZE.query(queryVector, {
            topK: totalToFetch,
            returnMetadata: "all",
        });

        let results = matches.matches
            .map((match) => {
                const parsed = v.safeParse(vectorMetadataSchema, match.metadata);
                if (!parsed.success) {
                    return null;
                }
                return {
                    ...parsed.output,
                    score: match.score,
                };
            })
            .filter((r) => r !== null);

        // Filter out bad seeds for authenticated users
        if (badSeeds.size > 0) {
            results = results.filter((r) => !badSeeds.has(r.seed));
        }

        // Trim to requested limit
        results = results.slice(0, limit);

        // Only cache for anonymous users (shared cache)
        if (useCache && env.SEARCH_CACHE && results.length > 0) {
            try {
                await env.SEARCH_CACHE.put(cacheKey, JSON.stringify(results), {
                    expirationTtl: CACHE_TTL_SECONDS,
                });
            } catch (e) {
                console.warn("KV cache write error:", e);
            }
        }

        return { results };
    });
