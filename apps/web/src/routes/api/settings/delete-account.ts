import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/api/settings/delete-account")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { confirmDeletion } = await import("../../../server/account/deletion.ts");
        return confirmDeletion(request, env);
      }
    }
  }
});
