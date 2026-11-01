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

test("written words name a palette in the view it was saved in alone, what its colors call it beside them", () => {
  const x = markdown.extra.find(e => e.written)!;
  const words = x.written!;
  const own = paletteMarkdown(x.seed, ORIGIN, x.view, words, x.heldBy)!;
  expect(own.startsWith(`# ${plain(words.title)}\n`)).toBe(true);
  expect(own).toMatch(/\n- Also called: .+\n- Seed: /);
  expect(paletteJson(x.seed, ORIGIN, x.view, null, words)).toMatchObject({ title: words.title });
  const others: Partial<View>[] = [
    { ...x.view, style: x.view.style === "radialSwatches" ? "linearSwatches" : "radialSwatches" },
    { ...x.view, steps: (x.view.steps ?? 7) + 1 }
  ];
  // a turn of the angle leaves the written words standing
  const turned = { ...x.view, angle: ((x.view.angle ?? 90) + 45) % 360 };
  expect(paletteJson(x.seed, ORIGIN, turned, null, words)).toMatchObject({ title: words.title });
  expect(
    paletteMarkdown(x.seed, ORIGIN, turned, words, x.heldBy)?.startsWith(
      `# ${plain(words.title)}\n`
    )
  ).toBe(true);
  for (const view of others) {
    expect(paletteMarkdown(x.seed, ORIGIN, view, words, x.heldBy)).toBe(
      paletteMarkdown(x.seed, ORIGIN, view, null, x.heldBy)
    );
    expect(paletteJson(x.seed, ORIGIN, view, null, words)).not.toHaveProperty("title");
  }
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
