import { createFileRoute } from "@tanstack/react-router";
import { generateTags } from "@/lib/tagging";

export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      POST: async ({ context }) => {
        try {
          const result = await generateTags(context.env);

          if ("error" in result) {
            return new Response(JSON.stringify(result), {
              status: 404,
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
