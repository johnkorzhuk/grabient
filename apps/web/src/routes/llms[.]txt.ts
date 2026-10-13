import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { AGENT_FILE, llmsText } from "../server/seo/agents.ts";
import { mcpFacts } from "../server/seo/mcp.ts";
import { publicOrigin } from "../server/seo/site.ts";
import { textResponse } from "../server/seo/text.ts";

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: ({ request }) =>
        textResponse(llmsText(publicOrigin(env, request), mcpFacts()), "text/plain", AGENT_FILE)
    }
  }
});
