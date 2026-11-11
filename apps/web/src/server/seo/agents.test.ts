import { readFileSync } from "node:fs";
import { EFFECT_WORDS, EFFECTS, hasEmbedScript } from "@grabient/engine/effect.ts";
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

/* file snapshots: where the texts change on purpose (a new effect's words among them), `pnpm vitest run
   apps/web/src/server/seo/agents.test.ts -u` writes them anew, and the diff shows what changed */
test("the guide and the whole reference are grabient.com's, byte for byte", async () => {
  expect(MCP.tools).toHaveLength(13);
  await expect(llmsText(ORIGIN, MCP)).toMatchFileSnapshot("fixtures/llms.txt");
  await expect(llmsText(`${ORIGIN}/`, MCP, true)).toMatchFileSnapshot("fixtures/llms-full.txt");
});

/* The MCP's skill (skills/grabient/SKILL.md, which server/mcp/skill.ts serves) is written by hand, where llms.txt writes
   its lists from the effects: a new effect it leaves out fails here (kit/README.md step 5). The two tags play an
   effect that has a script (engine/effect.ts hasEmbedScript); one with none yet (the aurora) is not said to play
   behind a page by them. */
test("the MCP's skill names every effect: in the tags that play one behind a page where it has a script, by its style, and on a list", () => {
  const skill = readFileSync(
    new URL("../../../../../skills/grabient/SKILL.md", import.meta.url),
    "utf8"
  );
  const behind =
    /To play a palette behind a whole page as ([^:]+?), put two tags/.exec(skill)?.[1] ?? "";
  const list = /`style=glass`[^.]*? plays the effect on every card/.exec(skill)?.[0] ?? "";
  for (const kind of EFFECTS) {
    if (hasEmbedScript(kind)) expect(behind, kind).toContain(EFFECT_WORDS[kind]);
    else expect(behind, kind).not.toContain(EFFECT_WORDS[kind]);
    expect(skill, kind).toContain(`\`style=${kind}\``);
    expect(list, kind).toMatch(new RegExp(`\`(style=)?${kind}\``));
  }
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
