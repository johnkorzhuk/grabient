import { createFileRoute } from "@tanstack/react-router";
import { refinePalettesStream, type PaletteFeedback, type PromptMode } from "@/server-functions/refine";

export const Route = createFileRoute("/api/refine")({
    server: {
        handlers: {
            POST: async ({ request }: { request: Request }) => {
                const body = await request.json() as {
                    query: string;
                    limit?: number;
                    mode?: PromptMode;
                    examples?: string[][];
                    feedback?: PaletteFeedback;
                };

                return refinePalettesStream(
                    body.query,
                    body.limit ?? 24,
                    body.mode ?? "unbiased",
                    body.examples,
                    body.feedback
                );
            },
        },
    },
});
