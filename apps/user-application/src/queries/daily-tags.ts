import { queryOptions } from "@tanstack/react-query";
import { getDailyTags } from "@/server-functions/daily-tags";

export const dailyTagsQueryOptions = (seed?: number) =>
    queryOptions({
        queryKey: ["daily-tags", seed],
        queryFn: () => getDailyTags({ data: seed ? { seed } : undefined }),
        staleTime: 1000 * 60 * 60, // 1 hour - client will refetch after this
        gcTime: 1000 * 60 * 60 * 24, // 24 hours - keep in cache
    });
