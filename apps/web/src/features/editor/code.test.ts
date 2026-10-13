import { decodePalette } from "@grabient/engine";
import { flush } from "solid-js";
import { afterEach, expect, test } from "vitest";
import { setColorFormat } from "../../lib/color-format.ts";
import { codeSources } from "./code.ts";
import { createRest } from "./rest.ts";

/* The palette as text, in the sheet's code pane. */

const SEED = "kS7CQ31Do6asvY-";
const sources = () =>
  codeSources(
    decodePalette(SEED)!,
    { style: "linearGradient", steps: 7, angle: 90 },
    SEED,
    () => ({ facts: null, opened: false }),
    createRest()
  );
const source = (id: string) => sources().find(s => s.id === id)!;

afterEach(() => {
  setColorFormat("oklch");
  flush();
});

test("CSS and Colors open in the spelling the reader chose in Settings", () => {
  expect(source("css").initial).toBe("oklch");
  expect(source("css").text(source("css").initial)).toContain("oklch(");
  setColorFormat("hex");
  flush();
  expect(source("css").initial).toBe("hex");
  expect(source("colors").initial).toBe("hex");
  expect(source("css").text(source("css").initial)).toMatch(/#[0-9a-f]{6}/);
  expect(source("css").text(source("css").initial)).not.toContain("oklch(");
});

test("the seed is the whole palette, and the Markdown is written here for a palette an edit made", () => {
  expect(source("seed").text()).toBe(SEED);
  expect(source("md").text()).toContain(SEED);
});
