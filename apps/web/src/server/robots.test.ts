import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { robots } from "./robots.ts";

const golden = (name: string) =>
  readFileSync(new URL(`fixtures/robots.${name}.txt`, import.meta.url), "utf8");

test("production's robots.txt, byte for byte", () => {
  expect(robots(true, "https://grabient.com")).toBe(golden("production"));
});

test("every other deploy refuses every crawler", () => {
  expect(robots(false, "https://staging.grabient.com")).toBe(golden("staging"));
});
