import { getAuth } from "@repo/data-ops/auth/server";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";

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
