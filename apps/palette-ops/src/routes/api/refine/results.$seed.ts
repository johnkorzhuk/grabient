import { createFileRoute } from "@tanstack/react-router";
import { getRefinementResult } from "@/lib/tagging";

export const Route = createFileRoute("/api/refine/results/$seed")({
  server: {
    handlers: {
      GET: async ({ params, context }) => {
        try {
          // Use raw D1 database from env, not Drizzle instance
          const result = await getRefinementResult(context.env.DB, params.seed);

          if (!result) {
            return new Response(
              JSON.stringify({ error: "No refinement found" }),
              {
                status: 404,
                headers: { "Content-Type": "application/json" },
              }
            );
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
