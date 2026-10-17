import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { REGISTRY_NAME } from "../mcp/info.ts";
import { aiCatalog, llmsText, type Mcp, serverCard } from "./agents.ts";

const golden = (name: string) => readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8");
const ORIGIN = "https://grabient.com";

/** The MCP server as grabient.com's files describe it: its tools as llms-full.txt lists them, its versions and its
    words as its card says them. */
const card = JSON.parse(golden("mcp-server-card.json"));
const MCP: Mcp = {
  path: "/mcp",
  versions: card.remotes[0].supportedProtocolVersions,
  skill: "skill://grabient/SKILL.md",
  tools: [...golden("llms-full.txt").matchAll(/^- `([a-z_]+)`: (.+)$/gm)].map(
    ([, name, description]) => ({
      name,
      description
    })
  ),
  info: origin => ({
    name: "Grabient",
    title: card.title,
    version: card.version,
    description: card.description,
    websiteUrl: origin,
    icons: card.icons.map((icon: { src: string }) => ({
      ...icon,
      src: icon.src.replace(ORIGIN, origin)
    }))
  }),
  registryName: REGISTRY_NAME
};

test("the guide and the whole reference are grabient.com's, byte for byte", () => {
  expect(MCP.tools).toHaveLength(13);
  expect(llmsText(ORIGIN, MCP)).toBe(golden("llms.txt"));
  expect(llmsText(`${ORIGIN}/`, MCP, true)).toBe(golden("llms-full.txt"));
});

test("the server's card and the catalog that leads to it", () => {
  expect(JSON.stringify(serverCard(ORIGIN, MCP), null, 1)).toBe(golden("mcp-server-card.json"));
  expect(JSON.stringify(aiCatalog(ORIGIN, MCP), null, 1)).toBe(golden("ai-catalog.json"));
});

test("every address names the deploy's own origin", () => {
  const origin = "https://staging.grabient.com";
  const text = llmsText(origin, MCP, true);
  expect(text).not.toContain("https://grabient.com");
  expect(aiCatalog(origin, MCP).entries[0].url).toBe(`${origin}/mcp/server-card`);
  expect(serverCard(origin, MCP).remotes[0].url).toBe(`${origin}/mcp`);
});

test("the whole reference names the lists' Rising frames an admin has left on, and no other", () => {
  expect(llmsText(ORIGIN, MCP, true)).toContain(
    "Rising is the week's, and `/3m` or `/1y` after it its other frames |"
  );
  expect(llmsText(ORIGIN, MCP, true, ["1w", "3m"])).toContain(
    "Rising is the week's, and `/3m` after it its other frame |"
  );
  const week = llmsText(ORIGIN, MCP, true, ["1w"]);
  expect(week).toContain("Rising is the week's |");
  expect(week).not.toMatch(/`\/(?:3m|1y)`/);
});
