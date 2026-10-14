import { encodePalette } from "@grabient/engine/codec.ts";
import { expect, test } from "vitest";
import { canonicalGallery } from "../gallery/address.ts";
import {
  AS_SAVED,
  drawnIn,
  inView,
  type ListView,
  readListView,
  searchInView,
  viewParams
} from "./appearance.ts";

const SEED = encodePalette({
  anchors: Array.from({ length: 8 }, (_, i) => ({ l: 0.2 + i * 0.1, c: 0.1, h: i * 30 }))
});

test("a list's address sets each part of the view, or leaves it to every palette", () => {
  expect(readListView({})).toEqual(AS_SAVED);
  expect(readListView({ style: "radialSwatches", steps: 2, angle: 45, size: "1200x630" })).toEqual({
    style: "radialSwatches",
    steps: 3,
    angle: 45,
    size: { width: 1200, height: 630 }
  });
  expect(readListView({ style: "auto", steps: "12", angle: 361, size: "39x39" })).toEqual({
    ...AS_SAVED,
    steps: 12
  });
  expect(readListView({ steps: 101, angle: -1 })).toEqual(AS_SAVED);
});

test("a view as search params leaves out what each palette keeps", () => {
  expect(viewParams({ style: "auto", steps: 9, angle: "auto", size: null })).toEqual({
    style: undefined,
    steps: 9,
    angle: undefined,
    size: undefined
  });
  expect(viewParams({ size: { width: "auto", height: 630 } })).toEqual({ size: "autox630" });
  expect(
    inView("/palettes", { style: "linearSwatches", steps: 7, angle: "auto", size: null })
  ).toBe("/palettes?style=linearSwatches&steps=7");
  expect(inView("/", AS_SAVED)).toBe("/");
});

test("a change of view writes a list's query in the lists' one order, the address the Worker keeps", () => {
  /* a query as the router reads it into a search and writes the search back, name by name */
  const written = (address: string, view: Partial<ListView>) => {
    const [path, query = ""] = address.split("?");
    const search = searchInView(Object.fromEntries(new URLSearchParams(query)), view);
    const out = new URLSearchParams(
      Object.entries(search).map(([name, value]) => [name, String(value)])
    )
      .toString()
      .replace(/=(?=&|$)/g, "");
    return out ? `${path}?${out}` : path!;
  };
  for (const start of [
    "/palettes",
    "/palettes?limit=48",
    "/?page=2",
    "/palettes/rising?q=blue&page=2",
    "/palettes/saved?q=warm&selection",
    "/palettes?angle=45&size=800x600"
  ]) {
    const to = written(start, { steps: 5, style: "linearSwatches" });
    expect(to).toContain("style=linearSwatches&steps=5");
    expect(canonicalGallery(to), start).toBe(to);
  }
  expect(
    written("/palettes?q=blue&style=linearSwatches&steps=5&limit=48", {
      style: "auto",
      steps: "auto"
    })
  ).toBe("/palettes?q=blue&limit=48");
});

test("a card draws the list's view over its own, a draft over both, never fewer steps than keyframes", () => {
  const own = { seed: SEED, style: "angularGradient" as const, steps: 12, angle: 10 };
  expect(drawnIn(own, AS_SAVED)).toEqual(own);
  expect(drawnIn(own, { ...AS_SAVED, style: "linearGradient", steps: 3 })).toEqual({
    ...own,
    style: "linearGradient",
    steps: 8
  });
  expect(drawnIn(own, { ...AS_SAVED, angle: 90 }, { angle: 200, steps: 20 })).toEqual({
    ...own,
    steps: 20,
    angle: 200
  });
});
