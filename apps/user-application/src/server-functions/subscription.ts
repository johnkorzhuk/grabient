import { createServerFn, createMiddleware } from "@tanstack/react-start";
import {
    optionalAuthFunctionMiddleware,
    protectedFunctionMiddleware,
} from "@/core/middleware/auth";
import { polarMiddleware } from "@/core/middleware/polar";
import { isProEnabled } from "@/lib/feature-flags";
import { setResponseStatus } from "@tanstack/react-start/server";
import { Polar } from "@polar-sh/sdk";

const proEnabledMiddleware = createMiddleware({
    type: "function",
}).server(async ({ next }) => {
    if (!isProEnabled()) {
        setResponseStatus(503);
        throw new Error("Pro features are not available");
    }
    return next();
});

export const checkSubscriptionStatus = createServerFn({ method: "GET" })
    .middleware([optionalAuthFunctionMiddleware])
    .handler(
        async (
            ctx,
        ): Promise<{
            hasSubscription: boolean;
            hasCredits: boolean;
            creditsRemaining: number;
        }> => {
            // When Pro is disabled, always return no subscription
            if (!isProEnabled()) {
                return {
                    hasSubscription: false,
                    hasCredits: false,
                    creditsRemaining: 0,
                };
            }

            if (!ctx.context.userId) {
                return {
                    hasSubscription: false,
                    hasCredits: false,
                    creditsRemaining: 0,
                };
            }

            try {
                const { env } = await import("cloudflare:workers");
                const polar = new Polar({
                    accessToken: env.POLAR_ACCESS_TOKEN,
                    server: (env.POLAR_SERVER as "sandbox" | "production") || "sandbox",
                });

                const customerState =
                    await polar.customers.getStateExternal({
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
    .middleware([proEnabledMiddleware, protectedFunctionMiddleware, polarMiddleware])
    .handler(async (ctx): Promise<{ success: boolean }> => {
        try {
            const { env } = await import("cloudflare:workers");
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
