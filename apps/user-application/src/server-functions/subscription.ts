import { createServerFn } from "@tanstack/react-start";
import {
    optionalAuthFunctionMiddleware,
    protectedFunctionMiddleware,
} from "@/core/middleware/auth";
import { polarMiddleware } from "@/core/middleware/polar";
import { env } from "cloudflare:workers";

export const checkSubscriptionStatus = createServerFn({ method: "GET" })
    .middleware([optionalAuthFunctionMiddleware, polarMiddleware])
    .handler(
        async (
            ctx,
        ): Promise<{
            hasSubscription: boolean;
            hasCredits: boolean;
            creditsRemaining: number;
        }> => {
            if (!ctx.context.userId) {
                return {
                    hasSubscription: false,
                    hasCredits: false,
                    creditsRemaining: 0,
                };
            }

            try {
                const customerState =
                    await ctx.context.polar.customers.getStateExternal({
                        externalId: ctx.context.userId!,
                    });

                const hasSubscription =
                    (customerState.activeSubscriptions?.length ?? 0) > 0;
                // Find the meter with credits, fallback to first meter
                const meter = customerState.activeMeters?.find(m => m.creditedUnits > 0) ?? customerState.activeMeters?.[0];
                const creditsRemaining = meter?.balance ?? 0;
                const hasCredits = creditsRemaining > 0;

                return { hasSubscription, hasCredits, creditsRemaining };
            } catch (error) {
                console.error("[checkSubscriptionStatus] Error:", error);
                return {
                    hasSubscription: false,
                    hasCredits: false,
                    creditsRemaining: 0,
                };
            }
        },
    );

export const trackAIGeneration = createServerFn({ method: "POST" })
    .middleware([protectedFunctionMiddleware, polarMiddleware])
    .handler(async (ctx): Promise<{ success: boolean }> => {
        try {
            await ctx.context.polar.events.ingest({
                events: [
                    {
                        name: env.POLAR_METER_AI_GENERATIONS,
                        externalCustomerId: ctx.context.userId!,
                    },
                ],
            });

            return { success: true };
        } catch (error) {
            console.error("[trackAIGeneration] Error:", error);
            throw new Error("Failed to track usage");
        }
    });
