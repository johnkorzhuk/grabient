import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export function useCredits() {
    return useQuery({
        queryKey: ["credits"],
        queryFn: async () => {
            const { data: meters } = await authClient.usage.meters.list({
                query: { page: 1, limit: 10 },
            });

            const aiMeter = meters?.items?.[0];

            if (!aiMeter) {
                return { remaining: 0, total: 0, consumed: 0, hasCredits: false };
            }

            // Balance: negative = credits remaining, positive = overage
            const remaining = aiMeter.balance <= 0 ? Math.abs(aiMeter.balance) : 0;

            return {
                remaining,
                total: aiMeter.credited || 0,
                consumed: aiMeter.consumed || 0,
                hasCredits: remaining > 0,
            };
        },
        staleTime: 30000,
    });
}

export function useIngestUsage() {
    const queryClient = useQueryClient();

    const ingest = async () => {
        await authClient.usage.ingest({
            event: "ai_generation",
            metadata: {},
        });
        // Invalidate credits query to refresh the balance
        queryClient.invalidateQueries({ queryKey: ["credits"] });
    };

    return { ingest };
}
