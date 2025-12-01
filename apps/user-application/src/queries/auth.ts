import { queryOptions } from "@tanstack/react-query";
import { getServerSession } from "@/server-functions/auth";

export const sessionQueryOptions = () =>
    queryOptions({
        queryKey: ["session"],
        queryFn: async () => {
            return await getServerSession();
        },
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 10,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
    });
