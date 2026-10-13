import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { McpServerPage } from "../features/connect/McpServer.tsx";
import { readOrigin } from "../features/connect/queries.ts";
import { PAGE } from "../lib/cache.ts";

export const Route = createFileRoute("/mcp-server")({
  headers: () => PAGE,
  loader: () => readOrigin(),
  head: () => ({
    meta: [
      // a name, the same in every language
      { title: "MCP" },
      {
        name: "description",
        content: t(
          "Connect an AI app like Claude, ChatGPT or Cursor to your Grabient account. It can search, make and save palettes and collections for you."
        )
      }
    ]
  }),
  component: McpServer
});

function McpServer() {
  const origin = Route.useLoaderData();
  return <McpServerPage origin={origin()} />;
}
