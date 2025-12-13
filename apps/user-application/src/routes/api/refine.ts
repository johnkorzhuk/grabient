import { createFileRoute } from "@tanstack/react-router";
import { refinePalettesStream, type PaletteFeedback } from "@/server-functions/refine-v2";

export const Route = createFileRoute("/api/refine")({
    server: {
        handlers: {
            POST: async ({ request }: { request: Request }) => {
                const body = await request.json() as {
                    query: string;
                    limit?: number;
                    examples?: string[][];
                    feedback?: PaletteFeedback;
                };

                return refinePalettesStream(
                    body.query,
                    body.limit ?? 24,
                    body.examples,
                    body.feedback
                );
            },
        },
    },
});
