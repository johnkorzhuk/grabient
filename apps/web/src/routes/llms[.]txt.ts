import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { AGENT_DATA, llmsText } from "../server/seo/agents.ts";
import { publicOrigin } from "../server/seo/site.ts";
import { textResponse } from "../server/seo/text.ts";

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { mcpFacts } = await import("../server/seo/mcp.ts");
        return textResponse(
          llmsText(publicOrigin(env, request), mcpFacts()),
          "text/plain",
          AGENT_DATA
        );
      }
    }
  }
});
