import { createFileRoute } from "@tanstack/react-router";
import { refineSingleSeed } from "@/lib/tagging";

export const Route = createFileRoute("/api/refine/single/$seed")({
  server: {
    handlers: {
      POST: async ({ request, params, context }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const sourceVersion = (body as { source_version?: string }).source_version;

          const result = await refineSingleSeed(
            context.env,
            params.seed,
            sourceVersion
          );

          if ("error" in result && !("id" in result)) {
            const status = result.error.includes("No tags found") ? 404 : 400;
            return new Response(JSON.stringify(result), {
              status,
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
