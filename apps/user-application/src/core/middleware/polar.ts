import { Polar } from "@polar-sh/sdk";
import { createMiddleware } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

export const polarMiddleware = createMiddleware({
    type: "function",
}).server(async ({ next }) => {
    const polar = new Polar({
        accessToken: env.POLAR_ACCESS_TOKEN,
        server: (env.POLAR_SERVER as "sandbox" | "production") || "sandbox",
    });
    return next({
        context: {
            polar,
        },
    });
});
