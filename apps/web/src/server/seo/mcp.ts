import { REGISTRY_NAME } from "../mcp/info.ts";
import { accountToolList, SUPPORTED, serverInfo } from "../mcp/server.ts";
import { SKILL_URI } from "../mcp/skill.ts";
import { MCP_PATH } from "../oauth/clients.ts";
import type { Mcp } from "./agents.ts";

/** The MCP server as the agent files describe it, from the server's own list of tools and versions. */
export const mcpFacts = (): Mcp => ({
  path: MCP_PATH,
  versions: SUPPORTED,
  skill: SKILL_URI,
  tools: accountToolList(),
  info: serverInfo,
  registryName: REGISTRY_NAME
});
