import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { AGENT_FILE, llmsText } from "../server/seo/agents.ts";
import { publicOrigin } from "../server/seo/site.ts";
import { textResponse } from "../server/seo/text.ts";

export const Route = createFileRoute("/llms-full.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { mcpFacts } = await import("../server/seo/mcp.ts");
        return textResponse(
          llmsText(publicOrigin(env, request), mcpFacts(), true),
          "text/plain",
          AGENT_FILE
        );
      }
    }
  }
});
