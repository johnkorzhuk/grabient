import { expect, test } from "vitest";
import { paletteJson } from "./document.ts";
import { paletteMarkdown } from "./markdown.ts";
import { colorNamesText, preciseNamer } from "./precise-names.ts";

/* The precise names swatch files give colors, from the list as the build writes it. */

const LIST = [
  { name: "Pure White", hex: "#FFFFFF" },
  { name: "Lights Out", hex: "#000000" },
  { name: "Red Alert", hex: "#ff0000" },
  { name: "Ice Cold Stare", hex: "#bacefa" }
];

test("the list is its colors' hex digits on one line, sorted, then the names in the colors' order", () => {
  expect(colorNamesText(LIST)).toBe(
    "000000bacefaff0000ffffff\nLights Out\nIce Cold Stare\nRed Alert\nPure White"
  );
  expect(() => colorNamesText([{ name: "Two\nlines", hex: "#123456" }])).toThrow();
  expect(() => colorNamesText([{ name: "Short", hex: "#123" }])).toThrow();
});

test("a color takes the name of the listed color nearest it", () => {
  const name = preciseNamer(colorNamesText(LIST));
  expect(name("#ff0000")).toBe("Red Alert");
  expect(name("#e8170f")).toBe("Red Alert");
  expect(name("#0a0a0c")).toBe("Lights Out");
  expect(name("#f4f6ff")).toBe("Pure White");
  expect(name("#b1c6f7")).toBe("Ice Cold Stare");
  expect(() => preciseNamer("000000\nOne\nTwo")).toThrow();
});

test("a palette's JSON and Markdown name each color precisely where the names are read", () => {
  const name = preciseNamer(colorNamesText(LIST));
  const seed = "kS7CQ31Do6asvY-";
  const json = paletteJson(seed, "https://grabient.com", {}, name);
  expect(json?.names).toEqual(json?.colors.map(hex => name(hex)));
  const broad = paletteJson(seed, "https://grabient.com");
  expect(broad?.names).not.toEqual(json?.names);
  const text = paletteMarkdown(seed, "https://grabient.com", {}, null, [], name) ?? "";
  for (const hex of json?.colors ?? []) expect(text).toContain(`| ${name(hex)} |`);
});
