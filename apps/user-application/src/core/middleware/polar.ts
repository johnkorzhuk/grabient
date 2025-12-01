import { Polar } from "@polar-sh/sdk";
import { createMiddleware } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

export const polarMiddleware = createMiddleware({
    type: "function",
}).server(async ({ next }) => {
    const polar = new Polar({
        accessToken: env.POLAR_SECRET,
        server: "sandbox",
    });
    return next({
        context: {
            polar,
        },
    });
});
