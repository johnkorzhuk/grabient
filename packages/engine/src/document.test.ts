import { expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { decodePalette } from "./codec.ts";
import { paletteClasses, paletteDocument, paletteJson } from "./document.ts";
import { MARKDOWN_LEAD, type PaletteWords, paletteMarkdown, plain } from "./markdown.ts";
import type { Palette } from "./palette.ts";
import type { View } from "./view.ts";

const ORIGIN = "https://grabient.com";
const markdown = golden<{
  entries: { id: string; seed: string; view: View; markdown: string; json: unknown }[];
  extra: {
    seed: string;
    view: Partial<View>;
    written: PaletteWords | null;
    heldBy: { slug: string; title: string }[];
    markdown: string | null;
  }[];
  jsonExtra: { seed: string; input: Partial<View>; json: unknown; document: unknown }[];
}>("markdown");
const names = golden<{ entries: { id: string; seed: string; paletteClasses: string[] }[] }>(
  "names"
);

test("the palette's JSON and Markdown are as before, key order included", () => {
  for (const e of markdown.entries) {
    expect(JSON.stringify(paletteJson(e.seed, ORIGIN, e.view)), e.id).toBe(JSON.stringify(e.json));
    expect(paletteMarkdown(e.seed, ORIGIN, e.view, null, []), e.id).toBe(e.markdown);
  }
});

test("written words, the collections that hold a palette, and a seed that is none", () => {
  for (const x of markdown.extra)
    expect(paletteMarkdown(x.seed, ORIGIN, x.view, x.written, x.heldBy)).toBe(x.markdown);
  expect(paletteJson("not a seed", ORIGIN)).toBeNull();
  expect(plain("Line\nbreak `code` <b> | *x*")).toBe("Line break \\`code\\` \\<b\\> \\| \\*x\\*");
  expect(MARKDOWN_LEAD).toBe(400);
});

test("a view's missing or junk values take the default, and steps never fall under the keyframes", () => {
  for (const x of markdown.jsonExtra) {
    expect(JSON.stringify(paletteJson(x.seed, ORIGIN, x.input))).toBe(JSON.stringify(x.json));
    expect(
      JSON.stringify(paletteDocument(x.seed, decodePalette(x.seed) as Palette, ORIGIN, x.input))
    ).toBe(JSON.stringify(x.document));
  }
});

test("a palette's classes are read from its colors in the view", () => {
  const views = new Map(markdown.entries.map(e => [e.id, e.view]));
  for (const e of names.entries)
    expect(paletteClasses(e.seed, views.get(e.id) as View)).toEqual(e.paletteClasses);
});
