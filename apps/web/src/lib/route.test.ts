import { expect, test } from "vitest";
import { drawnSearch, searchOf } from "./route.ts";

test("a route's search reads back as its address wrote it", () => {
  expect(searchOf({ q: "sea", steps: 5, selection: "" })).toBe("?q=sea&steps=5&selection");
  expect(searchOf({ style: ["linearSwatches", "radialGradient"], angle: undefined })).toBe(
    "?style=linearSwatches"
  );
  expect(searchOf({})).toBe("");
});

test("a page is drawn from its search without the browser's own words and a landing's campaign tags", () => {
  const search = { q: "sea", page: 2, selection: "", lock: "hue", unlock: "chroma" };
  const landed = { ...search, utm_source: "news", UTM_Medium: "email", gclid: "x", ref: "ph" };
  expect(drawnSearch(landed)).toEqual({ q: "sea", page: 2 });
  expect(drawnSearch({ q: "sea", referrer: "x" })).toEqual({ q: "sea", referrer: "x" });
});
