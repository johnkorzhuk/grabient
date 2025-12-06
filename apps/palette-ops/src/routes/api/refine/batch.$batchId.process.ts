import { createFileRoute } from "@tanstack/react-router";
import { processBatchResults } from "@/lib/tagging";

export const Route = createFileRoute("/api/refine/batch/$batchId/process")({
  server: {
    handlers: {
      POST: async ({ request, params, context }) => {
        try {
          const body = await request.json().catch(() => ({ seedMapping: {} }));
          const seedMapping = (body as { seedMapping: Record<string, string> })
            .seedMapping;

          if (!seedMapping || Object.keys(seedMapping).length === 0) {
            return new Response(
              JSON.stringify({
                error:
                  "seedMapping required. Pass the seedMapping from the batch submission response.",
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          const result = await processBatchResults(
            context.env,
            params.batchId,
            seedMapping
          );

          if ("error" in result) {
            return new Response(JSON.stringify(result), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

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
