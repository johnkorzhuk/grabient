import { expect, test } from "vitest";
import golden from "./fixtures/mcp-apps.json" with { type: "json" };
import { MCP_LINKS, MCP_SETUPS, otherSetup } from "./mcp-apps.ts";

/* Every link and setup the MCP page shows, for grabient.com's address, as grabient4 shows them. */
const ADDRESS = "https://grabient.com/mcp";

test("each app's one-click link and setup are its maker's form, with the address filled in", () => {
  expect(
    MCP_LINKS.map(way => ({ label: way.label, web: !!way.web, link: way.link(ADDRESS) }))
  ).toEqual(golden.links);
  expect(
    MCP_SETUPS.map(setup => ({
      label: setup.label,
      terminal: !!setup.terminal,
      where: setup.where ?? null,
      guide: setup.guide,
      code: setup.code(ADDRESS)
    }))
  ).toEqual(golden.setups);
  expect(otherSetup(ADDRESS)).toBe(golden.other);
});
