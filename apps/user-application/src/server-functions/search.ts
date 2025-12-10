import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import * as v from "valibot";
import { rateLimitFunctionMiddleware } from "@/core/middleware/rate-limit-function";
import { DEFAULT_PAGE_LIMIT } from "@/lib/constants";
import { searchInputSchema } from "@/lib/validators/search";
import {
    seedValidator,
    paletteStyleValidator,
    stepsValidator,
    angleValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import { hexToColorName } from "@/lib/color-utils";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 3; // 3 days

// Matches hex codes: #RGB, #RRGGBB (works in arrays, quotes, or standalone)
const HEX_CODE_REGEX = /#([0-9a-fA-F]{3}(?![0-9a-fA-F])|[0-9a-fA-F]{6}(?![0-9a-fA-F]))/g;

function replaceHexWithColorNames(query: string): string {
    return query.replace(HEX_CODE_REGEX, (match) => hexToColorName(match));
}

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

        // Check KV cache first
        if (env.SEARCH_CACHE) {
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

        // Store in KV cache
        if (env.SEARCH_CACHE && results.length > 0) {
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
