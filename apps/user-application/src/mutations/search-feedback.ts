import { useMutation } from "@tanstack/react-query";
import { setFeedback, getFeedback, type FeedbackType } from "@/stores/search-feedback";
import { analytics } from "@/integrations/tracking/events";
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

            return { success: true };
        },
    });
}
