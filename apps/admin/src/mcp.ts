// The private analytics MCP server — the manifest.
//
// Every tool reads production business data, so this is deliberately NOT the
// same server as the public palette MCP in apps/web. Different Worker,
// different hostname, different auth: that separation is the security
// boundary, and analytics tools must never be registered in the public server
// "just for testing".
//
// AUTH is inherited, not reimplemented. The route mounts behind the Access
// middleware in index.ts, which verifies the Cloudflare Access assertion and
// checks it against ADMIN_EMAILS (people) or ADMIN_SERVICE_TOKENS (headless
// clients). By the time a tool runs the caller is already authorized, and the
// caller's identity arrives here as `actor` — it stamps created_by on writes.
//
// READ-ONLY against production, with a bounded write surface. Tools write to
// ADMIN_DB only — events, campaigns, goals, reports, sweeps — and every write
// is additive or soft-delete. No tool writes to grabient-prod (that boundary
// is the binding itself: DB has no migrations_dir and every query against it
// is a SELECT), no tool hard-deletes, and nothing returns a row identifying a
// person. A leaked service token's blast radius is junk rows in a private,
// re-derivable database — bounded, and worth stating rather than implying.
//
// Registration is modular by data domain (src/mcp/*.ts) because this server
// is the precursor to a larger admin MCP: adding a domain is a new file and
// one line here, not a change to a thousand-line switch.

import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { registerBing } from "./mcp/bing";
import { registerCapabilities } from "./mcp/capabilities";
import { registerCloudflare } from "./mcp/cloudflare";
import { registerGoogle } from "./mcp/google";
import { registerHistory } from "./mcp/history";
import { registerIndexation } from "./mcp/indexation";
import { registerWorkspace } from "./mcp/workspace";

export function createAnalyticsServer(env: Env, actor: string) {
  const server = new McpServer({ name: "grabient-analytics", version: "2.0.0" });
  registerHistory(server, env, actor); // brief + metrics_history first: START HERE tools
  registerGoogle(server, env); // search_console, ga4, referrers
  registerCloudflare(server, env); // traffic, crawlers, cloudflare_graphql
  registerIndexation(server, env); // indexation, corpus
  registerWorkspace(server, env, actor); // events, campaigns, campaign_report, goals, report_write, reports
  registerBing(server, env);
  registerCapabilities(server, env); // capabilities
  return server;
}

/**
 * `allowedHostnames` is mandatory for custom domains: the default allow-list
 * is localhost plus workers.dev, so omitting it passes a local smoke test and
 * then rejects every request on admin.grabient.com.
 */
export function analyticsMcpHandler(env: Env, hostname: string, actor: string) {
  return createMcpHandler(() => createAnalyticsServer(env, actor), {
    route: "/mcp",
    allowedHostnames: [hostname, "admin.grabient.com"],
  });
}
