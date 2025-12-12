import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveSearchFeedback, deleteSearchFeedback } from "@/server-functions/search-feedback";
import { setFeedback, getFeedback, type FeedbackType } from "@/stores/search-feedback";
import { authClient } from "@/lib/auth-client";
import { analytics } from "@/integrations/tracking/events";
import { DEFAULT_PAGE_LIMIT } from "@repo/data-ops/valibot-schema/grabient";
import type { paletteStyleValidator } from "@repo/data-ops/valibot-schema/grabient";
import type * as v from "valibot";

type PaletteStyle = v.InferOutput<typeof paletteStyleValidator>;

interface SearchFeedbackArgs {
    query: string;
    seed: string;
    feedback: FeedbackType;
    style?: PaletteStyle;
    angle?: number;
    steps?: number;
}

export function useSearchFeedbackMutation() {
    const { data: session } = authClient.useSession();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (args: SearchFeedbackArgs) => {
            // Check if this is a toggle (clicking same feedback again)
            const existingFeedback = getFeedback(args.query, args.seed);
            const isToggleOff = existingFeedback === args.feedback;

            // Update localStorage (handles toggle logic internally)
            setFeedback(args.query, args.seed, args.feedback);

            // Track analytics
            analytics.search.feedback({
                seed: args.seed,
                style: args.style,
                angle: args.angle,
                steps: args.steps,
                query: args.query,
                feedback: isToggleOff ? "clear" : args.feedback,
            });

            // If logged in, persist to server
            if (session?.user) {
                if (isToggleOff) {
                    // Delete the feedback
                    await deleteSearchFeedback({
                        data: {
                            query: args.query,
                            seed: args.seed,
                        },
                    });
                } else {
                    // Save/update the feedback
                    await saveSearchFeedback({
                        data: {
                            query: args.query,
                            seed: args.seed,
                            feedback: args.feedback,
                        },
                    });
                }
            }

            return { success: true, query: args.query, isAuthenticated: !!session?.user };
        },
        onSuccess: (data) => {
            // For authenticated users, invalidate the search query to refetch with filtered results
            if (data.isAuthenticated) {
                queryClient.invalidateQueries({
                    queryKey: ["palettes", "search", data.query, DEFAULT_PAGE_LIMIT],
                });
            }
        },
    });
}
