import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { RESOURCE_METADATA_PATH } from "../../server/oauth/clients.ts";

/* What an app reads to find the MCP server and its authorization server, and the proofs two directories ask for. Any
   other well-known address is the authorization server's to refuse, in JSON and never with a page. */
export const Route = createFileRoute("/.well-known/$")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const path = new URL(request.url).pathname;
        if (path === RESOURCE_METADATA_PATH) {
          const { serveMcp } = await import("../../server/mcp/server.ts");
          return serveMcp(request, env, { waitUntil });
        }
        const { directoryPath, directoryProof } = await import("../../server/mcp/directories.ts");
        if (directoryPath(path)) return directoryProof(request, env);
        const { handleOAuth } = await import("../../server/oauth/routes.ts");
        return handleOAuth(request, env, { waitUntil });
      }
    }
  }
});
