import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import * as v from "valibot";
import { rateLimitFunctionMiddleware } from "@/core/middleware/rate-limit-function";
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
import { palettes, likes } from "@repo/data-ops/drizzle/app-schema";
import { sql, inArray, eq } from "drizzle-orm";

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

async function fetchFreshLikeCounts(seeds: string[]): Promise<Map<string, number>> {
    if (seeds.length === 0) return new Map();

    try {
        const db = getDb();
        const likesCountSql = sql<number>`COUNT(DISTINCT ${likes.userId})`;

        const results = await db
            .select({
                seed: palettes.id,
                likesCount: likesCountSql,
            })
            .from(palettes)
            .leftJoin(likes, eq(palettes.id, likes.paletteId))
            .where(inArray(palettes.id, seeds))
            .groupBy(palettes.id);

        return new Map(results.map((r) => [r.seed, r.likesCount]));
    } catch (e) {
        console.warn("Failed to fetch fresh like counts:", e);
        return new Map();
    }
}

const baseSearchFunction = createServerFn({ method: "GET" }).middleware([
    rateLimitFunctionMiddleware("paletteRead"),
]);

export const searchPalettes = baseSearchFunction
    .inputValidator((input) => v.parse(searchInputSchema, input))
    .handler(async (ctx) => {
        const { query, limit = DEFAULT_PAGE_LIMIT } = ctx.data;

        // Vectorize and AI bindings require remote: true in wrangler config
        if (!env.AI || !env.VECTORIZE) {
            console.warn(
                "Search unavailable: AI/Vectorize bindings not available",
            );
            return { results: [] as SearchResult[] };
        }

        // Replace hex codes with color names before processing
        const normalizedQuery = replaceHexWithColorNames(query);

        const cacheKey = getCacheKey(normalizedQuery, limit);

        if (env.SEARCH_CACHE) {
            try {
                const cached = await env.SEARCH_CACHE.get<SearchResult[]>(
                    cacheKey,
                    "json",
                );
                if (cached) {
                    // Fetch fresh like counts from D1 even for cached results
                    const seeds = cached.map((r) => r.seed);
                    const freshLikes = await fetchFreshLikeCounts(seeds);
                    const resultsWithFreshLikes = cached.map((r) => ({
                        ...r,
                        likesCount: freshLikes.get(r.seed) ?? r.likesCount,
                    }));
                    return { results: resultsWithFreshLikes };
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
            topK: limit,
            returnMetadata: "all",
        });

        const results = matches.matches
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

        // Fetch fresh like counts from D1
        const seeds = results.map((r) => r.seed);
        const freshLikes = await fetchFreshLikeCounts(seeds);
        const resultsWithFreshLikes = results.map((r) => ({
            ...r,
            likesCount: freshLikes.get(r.seed) ?? r.likesCount,
        }));

        if (env.SEARCH_CACHE && results.length > 0) {
            try {
                // Cache the original results (with vector metadata likes) for vector search caching
                await env.SEARCH_CACHE.put(cacheKey, JSON.stringify(results), {
                    expirationTtl: CACHE_TTL_SECONDS,
                });
            } catch (e) {
                console.warn("KV cache write error:", e);
            }
        }

        return { results: resultsWithFreshLikes };
    });
