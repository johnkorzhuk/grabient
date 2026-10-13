import { describe, expect, it } from "vitest";
import entry from "../../../../../server.json" with { type: "json" };
import { MCP_PATH } from "../oauth/clients.ts";
import { REGISTRY_NAME, serverInfo } from "./info.ts";

/* server.json is what the MCP Registry lists: `mcp-publisher publish` reads it from the repository's root, and
   `mcp-publisher validate` checks it against the registry's schema. It says what the server at grabient.com says of
   itself, so the two never drift. */

const SITE = "https://grabient.com";

describe("the MCP Registry's entry", () => {
  it("is the server at grabient.com as it describes itself, under the name its card carries", () => {
    const { $schema, ...rest } = entry;
    const { name: _, ...info } = serverInfo(SITE);
    expect($schema).toMatch(
      /^https:\/\/static\.modelcontextprotocol\.io\/schemas\/\d{4}-\d{2}-\d{2}\/server\.schema\.json$/
    );
    expect(rest).toEqual({
      name: REGISTRY_NAME,
      ...info,
      remotes: [{ type: "streamable-http", url: SITE + MCP_PATH }]
    });
  });

  it("keeps to the registry's rules for a name, a description and a version", () => {
    expect(entry.name).toMatch(
      /^[a-z0-9][a-z0-9.-]*[a-z0-9]\/[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$/
    );
    // the namespace is the reverse of the domain the proof is served from
    expect(entry.name.split("/")[0]!.split(".").reverse().join(".")).toBe(new URL(SITE).hostname);
    expect(entry.description.length).toBeGreaterThan(0);
    expect(entry.description.length).toBeLessThanOrEqual(100);
    expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
