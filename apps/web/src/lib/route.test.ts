import { expect, test } from "vitest";
import { searchOf } from "./route.ts";

test("a route's search reads back as its address wrote it", () => {
  expect(searchOf({ q: "sea", steps: 5, selection: "" })).toBe("?q=sea&steps=5&selection");
  expect(searchOf({ style: ["linearSwatches", "radialGradient"], angle: undefined })).toBe(
    "?style=linearSwatches"
  );
  expect(searchOf({})).toBe("");
});
