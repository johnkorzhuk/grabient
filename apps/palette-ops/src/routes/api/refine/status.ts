import { createFileRoute } from "@tanstack/react-router";
import { getRefinementStatus } from "@/lib/tagging";

export const Route = createFileRoute("/api/refine/status")({
  server: {
    handlers: {
      GET: async ({ context }) => {
        try {
          // Use raw D1 database from env, not Drizzle instance
          const status = await getRefinementStatus(context.env.DB);
          return new Response(JSON.stringify(status), {
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
