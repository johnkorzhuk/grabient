import { encodePalette } from "@grabient/engine/codec.ts";
import { expect, test } from "vitest";
import { paletteNumbers, useInput } from "./use.ts";

const SEED = encodePalette({
  anchors: [
    { l: 0.9, c: 0.05, h: 80 },
    { l: 0.4, c: 0.15, h: 20 }
  ]
});
const OTHER = encodePalette({
  anchors: [
    { l: 0.3, c: 0.1, h: 250 },
    { l: 0.8, c: 0.12, h: 300 },
    { l: 0.6, c: 0.2, h: 340 }
  ]
});

test("a copy counts each palette once, in the view it was taken in, at its place", () => {
  const input = useInput({
    action: "copy",
    format: "css:hex",
    surface: "search",
    words: "  warm  ",
    searched: true,
    items: [
      { seed: SEED, style: "radialSwatches", steps: 1, angle: 45, position: 3 },
      { seed: SEED, position: 4 },
      { seed: "not a seed" },
      { seed: OTHER, position: 1000 }
    ]
  });
  expect(input).toEqual({
    action: "copy",
    format: "css:hex",
    surface: "search",
    collection: "",
    words: "  warm  ",
    searched: true,
    edited: null,
    items: [
      { seed: SEED, view: "radialSwatches:3:45", position: 3 },
      { seed: OTHER, view: "linearGradient:7:90", position: -1 }
    ]
  });
});

test("an open keeps no view, and a take needs a format the site knows", () => {
  expect(
    useInput({ action: "open", surface: "list", items: [{ seed: SEED, style: "linearSwatches" }] })
      ?.items
  ).toEqual([{ seed: SEED, view: "", position: -1 }]);
  expect(
    useInput({ action: "copy", format: "exe", surface: "list", items: [{ seed: SEED }] })
  ).toBeNull();
  expect(
    useInput({ action: "open", format: "css", surface: "list", items: [{ seed: SEED }] })
  ).toBeNull();
  expect(useInput({ action: "copy", format: "png", surface: "list", items: [] })).toBeNull();
  // an effect's two tags, and its script's address
  for (const format of ["html", "link:js"])
    expect(
      useInput({ action: "copy", format, surface: "editor", items: [{ seed: SEED }] })?.format
    ).toBe(format);
  expect(useInput({ action: "share", surface: "list", items: [{ seed: SEED }] })).toBeNull();
  expect(useInput(null)).toBeNull();
});

test("a collection's page seen names a public collection's address and nothing else", () => {
  expect(
    useInput({ action: "view", surface: "collection", collection: "ocean-gradients" })
  ).toMatchObject({
    action: "view",
    collection: "ocean-gradients",
    items: []
  });
  expect(
    useInput({ action: "view", surface: "collection", collection: "Ocean Gradients" })
  ).toBeNull();
  expect(useInput({ action: "view", surface: "list", collection: "ocean-gradients" })).toBeNull();
  expect(
    useInput({
      action: "view",
      surface: "collection",
      collection: "ocean",
      items: [{ seed: SEED }]
    })
  ).toBeNull();
});

test("the editor's change is kept only for one palette that changed", () => {
  const take = { action: "download", format: "png", surface: "editor" } as const;
  expect(useInput({ ...take, items: [{ seed: SEED }], edited: OTHER })?.edited).toBe(OTHER);
  expect(useInput({ ...take, items: [{ seed: SEED }], edited: SEED })?.edited).toBeNull();
  expect(
    useInput({ ...take, surface: "list", items: [{ seed: SEED }], edited: OTHER })?.edited
  ).toBeNull();
});

test("a palette's numbers say its keyframes, its lightness and its hues", () => {
  const numbers = paletteNumbers(OTHER);
  expect(numbers?.anchors).toBe(3);
  expect(numbers?.rangeL).toBeGreaterThan(0.3);
  expect(numbers?.hueSpan).toBeGreaterThan(40);
  expect(paletteNumbers("kAAA")).toBeNull();
});
