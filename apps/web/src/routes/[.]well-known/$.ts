import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { directoryPath, directoryProof } from "../../server/mcp/directories.ts";
import { serveMcp } from "../../server/mcp/server.ts";
import { RESOURCE_METADATA_PATH } from "../../server/oauth/clients.ts";
import { handleOAuth } from "../../server/oauth/routes.ts";

/* What an app reads to find the MCP server and its authorization server, and the proofs two directories ask for. Any
   other well-known address is the authorization server's to refuse, in JSON and never with a page. */
export const Route = createFileRoute("/.well-known/$")({
  server: {
    handlers: {
      ANY: ({ request }) => {
        const path = new URL(request.url).pathname;
        if (path === RESOURCE_METADATA_PATH) return serveMcp(request, env, { waitUntil });
        return directoryPath(path)
          ? directoryProof(request, env)
          : handleOAuth(request, env, { waitUntil });
      }
    }
  }
});
