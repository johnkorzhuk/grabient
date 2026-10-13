import { describe, expect, it } from "vitest";
import type { Grant, Schema } from "./tool.ts";
import { accountTools } from "./tools/account.ts";
import { adminTools } from "./tools/admin.ts";

/* What the directories of MCP servers read before they list one: each tool's title, its four hints, and descriptions
   that say what the tool and its arguments do. Claude's directory refuses a description that tells the model how to
   behave, and OpenAI's one that steers the model; the order of work is the instructions' (info.ts). */

const tools = [...accountTools, ...adminTools];
const names = tools.map(tool => tool.name);
const ADMIN: Grant = { userId: "", role: "admin", scopes: [], clientId: "", clientName: "" };

/** The verbs a clause gives an order with. A tool description's first clause is the tool's own action. */
const COMMANDS = new Set([
  "always",
  "ask",
  "avoid",
  "call",
  "check",
  "choose",
  "do",
  "don't",
  "ensure",
  "give",
  "include",
  "leave",
  "make",
  "never",
  "pass",
  "pick",
  "prefer",
  "read",
  "remember",
  "run",
  "see",
  "send",
  "set",
  "spread",
  "tell",
  "try",
  "use"
]);
/** Words that oblige or steer wherever they stand, and a tool named as the one to use. */
const STEERS = new RegExp(
  `\\b(you|your|must|should|always|please|prefer|make sure|be sure|do not|don't|give (the|each|a)|(use|call|see|try|run) (${names.join("|")}))\\b`,
  "i"
);

/** The orders a description gives: each clause that opens with a command, and the first steering word. */
function orders(description: string, action = false): string[] {
  const clauses = description.split(/(?<=[.:;!?])\s+/);
  return [
    ...clauses.filter(
      (clause, i) => !(action && i === 0) && COMMANDS.has(clause.split(" ")[0]!.toLowerCase())
    ),
    ...(STEERS.exec(description)?.slice(0, 1) ?? [])
  ];
}

/** Every argument's description in a schema, by its path. */
function argumentWords(schema: Schema, path = ""): [string, string][] {
  const own: [string, string][] =
    path && typeof schema.description === "string" && schema.description
      ? [[path, schema.description]]
      : [];
  const properties = Object.entries((schema.properties ?? {}) as Record<string, Schema>);
  return [
    ...own,
    ...properties.flatMap(([key, inner]) => argumentWords(inner, path ? `${path}.${key}` : key)),
    ...(schema.items ? argumentWords(schema.items as Schema, `${path}[]`) : [])
  ];
}

/** What grabient4's descriptions told the model, each of which these checks catch. */
const TOLD = [
  "Read this before judging or making palettes.",
  "Use it to choose what to make, extend or replace.",
  "Make the new seed with compose_palette.",
  "Give the reasons: they teach what to leave out.",
  "To have palettes arrive over time, use schedule.",
  "Without a slug it makes a collection: give a title and 1 to 100 palettes.",
  "It makes the collection if no one has that slug (then give a title).",
  "The palette must be in the gallery or in a public collection by then.",
  "Spread items over days and hours as people would arrive.",
  "Check it before scheduling more.",
  "Words: a theme, a use or a brand. Leave out to list.",
  "like: the persona's handle (see personas)."
];

describe("every tool", () => {
  it("has a name of its own, a title and all four hints", () => {
    expect(new Set(names).size).toBe(names.length);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z][a-z_]{2,63}$/);
      expect(tool.title.trim(), tool.name).not.toBe("");
      const { readOnly, destructive, idempotent, openWorld } = tool.hints;
      // an app reads a hint left out at its worst; one that depends on the account is stated for each
      for (const grant of [null, ADMIN]) {
        const open = typeof openWorld === "function" ? openWorld(grant) : openWorld;
        expect(
          [readOnly, destructive, idempotent, open].map(hint => typeof hint),
          tool.name
        ).toEqual(["boolean", "boolean", "boolean", "boolean"]);
      }
      // a tool that only reads destroys nothing and answers a second call as the first
      if (readOnly) expect([destructive, idempotent], tool.name).toEqual([false, true]);
    }
  });

  it("says what it and each argument do, and tells the model nothing to do", () => {
    for (const tool of tools) {
      expect(orders(tool.description, true), tool.name).toEqual([]);
      for (const [path, words] of argumentWords(tool.inputSchema))
        expect(orders(words), `${tool.name} ${path}`).toEqual([]);
    }
    for (const told of TOLD) expect(orders(told), told).not.toEqual([]);
  });

  it("of an account names no other tool: the instructions alone give the order of work", () => {
    for (const tool of accountTools) {
      const words = [tool.description, ...argumentWords(tool.inputSchema).map(([, w]) => w)];
      const named = names.filter(name => name !== tool.name && words.some(w => w.includes(name)));
      expect(named, tool.name).toEqual([]);
    }
  });
});
