import { createFileRoute } from "@tanstack/react-router";
import { protectedRequestMiddleware } from "@/core/middleware/auth";
import { Polar } from "@polar-sh/sdk";
import { env } from "cloudflare:workers";
import { isProEnabled } from "@/lib/feature-flags";

export const Route = createFileRoute("/app/polar/portal")({
    server: {
        middleware: [protectedRequestMiddleware],
        handlers: {
            GET: async (ctx) => {
                if (!isProEnabled()) {
                    return new Response("Pro features are not available", {
                        status: 503,
                    });
                }
                const polar = new Polar({
                    accessToken: env.POLAR_ACCESS_TOKEN,
                    server: (env.POLAR_SERVER as "sandbox" | "production") || "sandbox",
                });
                const customerSession = await polar.customerSessions.create({
                    externalCustomerId: ctx.context.userId,
                });
                return new Response(null, {
                    status: 302,
                    headers: {
                        Location: customerSession.customerPortalUrl,
                    },
                });
            },
        },
    },
});
