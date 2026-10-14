import { encodePalette } from "@grabient/engine/codec.ts";
import { expect, test } from "vitest";
import {
  AS_SAVED,
  drawnIn,
  inOrder,
  inView,
  type ListView,
  readListView,
  viewParams,
  viewSince
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

test("a change to a list's address is written in the lists' one order", () => {
  const written = (search: Record<string, unknown>, change: Record<string, unknown>) =>
    Object.entries(inOrder(search, change))
      .filter(([, value]) => value !== undefined)
      .map(([name]) => name);
  expect(
    written({ q: "blue", page: 2, limit: 48 }, viewParams({ style: "angularSwatches" }))
  ).toEqual(["q", "style", "page", "limit"]);
  expect(written({ steps: 9, page: 2, selection: "" }, { size: "1200x630", angle: 45 })).toEqual([
    "steps",
    "angle",
    "size",
    "page",
    "selection"
  ]);
  expect(written({ q: "blue", style: "linearSwatches" }, viewParams({ style: "auto" }))).toEqual([
    "q"
  ]);
  expect(written({ page: 3 }, { selection: "" })).toEqual(["page", "selection"]);
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

test("a list returned to takes each choice made since it was left, a cleared one included, over its own address", () => {
  const radial: ListView = { ...AS_SAVED, style: "radialGradient" };
  const own: ListView = { ...AS_SAVED, steps: 5 };
  // Radial was chosen on another list: the steps this address names stay
  expect(viewSince(own, AS_SAVED, radial)).toEqual({ ...own, style: "radialGradient" });
  // nothing was chosen since: the address stands, whatever the tab remembers
  expect(viewSince(own, radial, radial)).toEqual(own);
  // the steps were let go elsewhere, and a size chosen
  const sized: ListView = { ...AS_SAVED, size: { width: 1200, height: 630 } };
  expect(viewSince(own, own, sized)).toEqual(sized);
  // no record of the leaving, as after a reload: the list takes the tab's view whole
  expect(viewSince(own, undefined, radial)).toEqual(radial);
});
