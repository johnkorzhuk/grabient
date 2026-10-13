import { createFileRoute } from "@tanstack/solid-router";
import { Placeholder } from "../app/Placeholder.tsx";
import { PAGE } from "../lib/cache.ts";

export const Route = createFileRoute("/mcp-server")({
  headers: () => PAGE,
  head: () => ({ meta: [{ title: "MCP" }] }),
  component: () => <Placeholder title={"MCP"} />
});
