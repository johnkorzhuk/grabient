import { createFileRoute } from "@tanstack/react-router";
import { generatePalettesStream, type GenerateRequest } from "@/server-functions/generate";
import { getAuth } from "@repo/data-ops/auth/server";

export const Route = createFileRoute("/api/generate")({
    server: {
        handlers: {
            POST: async ({ request }: { request: Request }) => {
                const body = await request.json() as GenerateRequest;

                // Get userId from auth session if available (optional auth)
                let userId: string | null = null;
                try {
                    const auth = getAuth();
                    const session = await auth.api.getSession({
                        headers: request.headers,
                        query: { disableCookieCache: true },
                    });
                    userId = session?.user.id ?? null;
                } catch {
                    // Auth not available, proceed without userId
                }

                return generatePalettesStream(body, userId);
            },
        },
    },
});
