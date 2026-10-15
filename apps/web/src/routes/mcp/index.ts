import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";

/* The MCP server, for an app signed in to an account: every request carries a token, and a browser that opens the
   address is shown how an app connects. */
export const Route = createFileRoute("/mcp/")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { serveMcp } = await import("../../server/mcp/server.ts");
        return serveMcp(request, env, { waitUntil });
      }
    }
  }
});
