import { expect, test } from "vitest";
import { edgeFor, NO_STORE } from "./cache.ts";

test("a page drawn from data kept apart lives at the edge while the data stays fresh, and nowhere once it may not", () => {
  expect(edgeFor(269.7)).toEqual({
    "Cache-Control": "public, max-age=0, must-revalidate",
    "CDN-Cache-Control": "max-age=269"
  });
  expect(edgeFor(0)).toEqual(NO_STORE);
  expect(edgeFor(0.5)).toEqual(NO_STORE);
});
