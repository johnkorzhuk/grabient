import { namedColors } from "@grabient/engine/named-colors.ts";
import { colornames } from "color-name-list";
import { expect, test } from "vitest";

/* the engine can't read the precise list, which only the app's build depends on, so its values are checked here */
test("each name CSS has no word for stands at the precise list's value", () => {
  const precise = new Map<string, string>();
  for (const c of colornames) {
    const name = c.name.toLowerCase();
    if (!precise.has(name)) precise.set(name, c.hex.toLowerCase());
  }
  const others = namedColors().slice(148);
  expect(others.length).toBeGreaterThan(30);
  for (const c of others) expect([c.name, precise.get(c.name)]).toEqual([c.name, c.hex]);
});
