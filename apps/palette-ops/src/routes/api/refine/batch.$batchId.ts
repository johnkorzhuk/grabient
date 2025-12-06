import { createFileRoute } from "@tanstack/react-router";
import { checkBatchStatus } from "@/lib/tagging";

export const Route = createFileRoute("/api/refine/batch/$batchId")({
  server: {
    handlers: {
      GET: async ({ params, context }) => {
        try {
          const result = await checkBatchStatus(
            context.env.ANTHROPIC_API_KEY,
            params.batchId
          );

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
