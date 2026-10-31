import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { publicOrigin } from "../../server/seo/site.ts";
import { AGENT_DATA, textResponse } from "../../server/seo/text.ts";

/** The AI Catalog, which leads an agent to the MCP server's card. */
export async function catalogResponse(request: Request) {
  const [{ aiCatalog }, { mcpFacts }] = await Promise.all([
    import("../../server/seo/agents.ts"),
    import("../../server/seo/mcp.ts")
  ]);
  return textResponse(
    JSON.stringify(aiCatalog(publicOrigin(env, request), mcpFacts())),
    "application/ai-catalog+json",
    AGENT_DATA
  );
}

export const Route = createFileRoute("/.well-known/ai-catalog.json")({
  server: { handlers: { GET: ({ request }) => catalogResponse(request) } }
});
