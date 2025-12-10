import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import { generateDailyTags, getDaysSinceEpoch, type DailyTag } from "@/lib/daily-tags";

const inputSchema = v.optional(
    v.object({
        seed: v.optional(v.number()),
    }),
);

// In-memory cache for generated tags (deterministic, so safe to cache)
const tagsCache = new Map<number, DailyTag[]>();
const MAX_CACHE_SIZE = 50;

function getCachedTags(seed: number): DailyTag[] {
    const cached = tagsCache.get(seed);
    if (cached) return cached;

    const tags = generateDailyTags(seed, 24);

    // Evict oldest entries if cache is full
    if (tagsCache.size >= MAX_CACHE_SIZE) {
        const firstKey = tagsCache.keys().next().value;
        if (firstKey !== undefined) tagsCache.delete(firstKey);
    }

    tagsCache.set(seed, tags);
    return tags;
}

export const getDailyTags = createServerFn({ method: "GET" })
    .inputValidator((input) => v.parse(inputSchema, input))
    .handler((ctx: { data: { seed?: number } | undefined }) => {
        const seed = ctx.data?.seed ?? getDaysSinceEpoch();
        const tags = getCachedTags(seed);
        return { tags, seed };
    });
