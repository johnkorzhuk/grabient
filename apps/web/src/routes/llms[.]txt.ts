import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { publicOrigin } from "../server/seo/site.ts";
import { AGENT_DATA, textResponse } from "../server/seo/text.ts";

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ llmsText }, { mcpFacts }] = await Promise.all([
          import("../server/seo/agents.ts"),
          import("../server/seo/mcp.ts")
        ]);
        return textResponse(
          llmsText(publicOrigin(env, request), mcpFacts()),
          "text/plain",
          AGENT_DATA
        );
      }
    }
  }
});
