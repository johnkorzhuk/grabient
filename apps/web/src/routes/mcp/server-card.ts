import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { BUILD } from "../../lib/build.ts";
import { publicOrigin } from "../../server/seo/site.ts";
import { AGENT_DATA, textResponse } from "../../server/seo/text.ts";

/* The MCP server's card is public, though its address is under the server's: no token is asked of it. It changes with
   a deploy alone, so the build is its ETag. */
export const Route = createFileRoute("/mcp/server-card")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const etag = `"${BUILD}"`;
        const headers = { ...AGENT_DATA, ETag: etag, "Access-Control-Expose-Headers": "ETag" };
        if (request.headers.get("If-None-Match") === etag) {
          return new Response(null, { status: 304, headers });
        }
        const [{ serverCard }, { mcpFacts }] = await Promise.all([
          import("../../server/seo/agents.ts"),
          import("../../server/seo/mcp.ts")
        ]);
        return textResponse(
          JSON.stringify(serverCard(publicOrigin(env, request), mcpFacts())),
          "application/mcp-server-card+json",
          headers
        );
      }
    }
  }
});
