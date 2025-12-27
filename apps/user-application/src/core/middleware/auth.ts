import { getAuth } from "@repo/data-ops/auth/server";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { Polar } from "@polar-sh/sdk";
import { env } from "cloudflare:workers";

export const protectedFunctionMiddleware = createMiddleware({
    type: "function",
}).server(async ({ next }) => {
    const auth = getAuth();
    const session = await auth.api.getSession({
        headers: getRequest().headers,
        query: {
            disableCookieCache: true,
        },
    });

    if (!session) {
        setResponseStatus(401);
        throw new Error("Unauthorized");
    }

    return next({
        context: {
            auth: auth,
            userId: session.user.id,
            email: session.user.email,
        },
    });
});

export const protectedRequestMiddleware = createMiddleware({
    type: "request",
}).server(async ({ next }) => {
    const auth = getAuth();
    const session = await auth.api.getSession({
        headers: getRequest().headers,
        query: {
            disableCookieCache: true,
        },
    });

    if (!session) {
        setResponseStatus(401);
        throw new Error("Unauthorized");
    }

    return next({
        context: {
            auth: auth,
            userId: session.user.id,
            email: session.user.email,
        },
    });
});

export const optionalAuthFunctionMiddleware = createMiddleware({
    type: "function",
}).server(async ({ next }) => {
    const auth = getAuth();
    const session = await auth.api.getSession({
        headers: getRequest().headers,
        query: {
            disableCookieCache: true,
        },
    });

    const userId: string | null = session?.user.id ?? null;
    const email: string | null = session?.user.email ?? null;

    return next({
        context: {
            auth: auth,
            userId,
            email,
        },
    });
});

export const adminFunctionMiddleware = createMiddleware({
    type: "function",
}).server(async ({ next }) => {
    const isDev = process.env.NODE_ENV === "development";
    const auth = getAuth();
    const session = await auth.api.getSession({
        headers: getRequest().headers,
        query: {
            disableCookieCache: true,
        },
    });

    if (!session) {
        setResponseStatus(401);
        throw new Error("Unauthorized");
    }

    const role = (session.user as { role?: string }).role;

    // Allow access in dev mode, require admin in production
    if (!isDev && role !== "admin") {
        setResponseStatus(403);
        throw new Error("Forbidden: Admin access required");
    }

    return next({
        context: {
            auth: auth,
            userId: session.user.id,
            email: session.user.email,
            role: role ?? "user",
        },
    });
});

export const creditsRequiredMiddleware = createMiddleware({
    type: "function",
}).server(async ({ next }) => {
    const auth = getAuth();
    const session = await auth.api.getSession({
        headers: getRequest().headers,
        query: {
            disableCookieCache: true,
        },
    });

    if (!session) {
        setResponseStatus(401);
        throw new Error("Unauthorized");
    }

    const polar = new Polar({
        accessToken: env.POLAR_ACCESS_TOKEN,
        server: (env.POLAR_SERVER as "sandbox" | "production") || "sandbox",
    });

    const customerState = await polar.customers.getStateExternal({
        externalId: session.user.id,
    });

    // Find the meter with credits, fallback to first meter
    const meter = customerState.activeMeters?.find(m => m.creditedUnits > 0) ?? customerState.activeMeters?.[0];
    const creditsRemaining = meter?.balance ?? 0;

    console.log("[creditsRequiredMiddleware] meter:", JSON.stringify(meter, null, 2));
    console.log("[creditsRequiredMiddleware] creditsRemaining:", creditsRemaining);

    if (creditsRemaining <= 0) {
        console.log("[creditsRequiredMiddleware] BLOCKING - insufficient credits");
        setResponseStatus(402);
        throw new Error("Insufficient credits");
    }

    return next({
        context: {
            auth: auth,
            userId: session.user.id,
            email: session.user.email,
            polar,
        },
    });
});
