import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@repo/data-ops/auth/server";

export const Route = createFileRoute("/api/auth/$")({
    server: {
        handlers: {
            GET: ({ request }) => {
                const auth = getAuth();
                return auth.handler(request);
            },
            POST: ({ request }) => {
                const auth = getAuth();
                return auth.handler(request);
            },
        },
    },
});
