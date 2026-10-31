import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { DEFAULT_FRAME, type RisingFrame } from "../lib/orders.ts";
import { framesOffered } from "../server/gallery/home.ts";
import { publicOrigin } from "../server/seo/site.ts";
import { AGENT_DATA, textResponse } from "../server/seo/text.ts";

export const Route = createFileRoute("/llms-full.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ llmsText }, { mcpFacts }] = await Promise.all([
          import("../server/seo/agents.ts"),
          import("../server/seo/mcp.ts")
        ]);
        /* a flag's read is the isolate's own, kept a few seconds: the week's alone where it fails */
        const frames = await framesOffered(env).catch((): RisingFrame[] => [DEFAULT_FRAME]);
        return textResponse(
          llmsText(publicOrigin(env, request), mcpFacts(), true, frames),
          "text/plain",
          AGENT_DATA
        );
      }
    }
  }
});
