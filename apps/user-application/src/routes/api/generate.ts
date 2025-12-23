import { createFileRoute } from "@tanstack/react-router";
import { generatePalettesSSE, type GenerateRequest } from "@/server-functions/generate-v6";
import { getAuth } from "@repo/data-ops/auth/server";

export const Route = createFileRoute("/api/generate")({
    server: {
        handlers: {
            POST: async ({ request }: { request: Request }) => {
                // Require authentication
                const auth = getAuth();
                const session = await auth.api.getSession({
                    headers: request.headers,
                    query: { disableCookieCache: true },
                });

                if (!session?.user) {
                    return new Response(
                        JSON.stringify({ error: "Unauthorized" }),
                        { status: 401, headers: { "Content-Type": "application/json" } }
                    );
                }

                const body = await request.json() as GenerateRequest;

                return generatePalettesSSE(body, session.user.id);
            },
        },
    },
});
