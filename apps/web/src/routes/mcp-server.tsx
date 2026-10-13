import { localHref } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { homeLink, Languages } from "../app/Frames.tsx";
import { footerLinks, navLinks, siteFacts } from "../app/site.ts";
import { McpServerPage } from "../features/connect/McpServer.tsx";
import { readOrigin } from "../features/connect/queries.ts";
import { PAGE } from "../lib/cache.ts";
import { pageHead } from "../lib/page-meta.ts";

export const Route = createFileRoute("/mcp-server")({
  staticData: { frame: "brand", still: true, translated: true },
  headers: () => PAGE,
  loader: () => readOrigin(),
  head: () => pageHead({ kind: "mcp" }),
  component: McpServer
});

function McpServer() {
  const origin = Route.useLoaderData();
  const site = siteFacts();
  return (
    <McpServerPage
      origin={origin()}
      nav={navLinks("mcp", site().stars, localHref)}
      all={homeLink()}
      footer={footerLinks("mcp", site().stars, localHref)}
      languages={<Languages />}
    />
  );
}
