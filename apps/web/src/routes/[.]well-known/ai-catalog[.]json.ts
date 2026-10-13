import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { AGENT_DATA, aiCatalog } from "../../server/seo/agents.ts";
import { mcpFacts } from "../../server/seo/mcp.ts";
import { publicOrigin } from "../../server/seo/site.ts";
import { textResponse } from "../../server/seo/text.ts";

/** The AI Catalog, which leads an agent to the MCP server's card. */
export const catalogResponse = (request: Request) =>
  textResponse(
    JSON.stringify(aiCatalog(publicOrigin(env, request), mcpFacts())),
    "application/ai-catalog+json",
    AGENT_DATA
  );

export const Route = createFileRoute("/.well-known/ai-catalog.json")({
  server: { handlers: { GET: ({ request }) => catalogResponse(request) } }
});
