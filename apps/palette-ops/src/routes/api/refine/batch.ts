import { createFileRoute } from "@tanstack/react-router";
import { startBatchRefinement } from "@/lib/tagging";

export const Route = createFileRoute("/api/refine/batch")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const limit = (body as { limit?: number }).limit || 100;

          const result = await startBatchRefinement(context.env, limit);

          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
