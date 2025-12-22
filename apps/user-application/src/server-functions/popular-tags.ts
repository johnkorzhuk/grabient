import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { generateDailyTags, type DailyTag } from "@/lib/tags";

export const getPopularTagsFn = createServerFn({ method: "GET" }).handler(
    async (): Promise<DailyTag[]> => {
        // Use current timestamp as seed for random tags on each request
        const seed = Math.floor(Math.random() * 1000000);
        return generateDailyTags(seed, 24);
    },
);

export const popularTagsQueryOptions = () =>
    queryOptions({
        queryKey: ["popularTags"],
        queryFn: () => getPopularTagsFn(),
        staleTime: Infinity,
        gcTime: Infinity,
    });
