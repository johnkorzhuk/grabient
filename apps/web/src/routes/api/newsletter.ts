import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";

/* GET ?before=&lang=: the newsletter's published issues, for anyone, a page at a time. */
export const Route = createFileRoute("/api/newsletter")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { issuesResponse } = await import("../../server/newsletter/routes.ts");
        return issuesResponse(request, env);
      }
    }
  }
});
