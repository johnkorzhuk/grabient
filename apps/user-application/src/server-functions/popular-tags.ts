import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { getRandomPopularTags } from "@/lib/popular-tags";

export const getPopularTagsFn = createServerFn({ method: "GET" }).handler(
    async () => {
        return getRandomPopularTags(24);
    },
);

export const popularTagsQueryOptions = () =>
    queryOptions({
        queryKey: ["popularTags"],
        queryFn: () => getPopularTagsFn(),
        staleTime: Infinity,
        gcTime: Infinity,
    });
