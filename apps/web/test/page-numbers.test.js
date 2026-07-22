// Pagination algorithm ported from the current site's palettes-pagination.tsx.
import { describe, expect, it } from "vitest";
import { pageNumbers } from "../src/page-numbers";

describe("pageNumbers", () => {
  it("renders all pages when 5 or fewer", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("near the start shows 1-4 then ellipsis and last", () => {
    expect(pageNumbers(1, 10)).toEqual([1, 2, 3, 4, "...", 10]);
    expect(pageNumbers(3, 10)).toEqual([1, 2, 3, 4, "...", 10]);
  });

  it("in the middle shows first, ellipses, and neighbors", () => {
    expect(pageNumbers(5, 10)).toEqual([1, "...", 4, 5, 6, "...", 10]);
  });

  it("near the end shows first, ellipsis, then last 4", () => {
    expect(pageNumbers(8, 10)).toEqual([1, "...", 7, 8, 9, 10]);
    expect(pageNumbers(10, 10)).toEqual([1, "...", 7, 8, 9, 10]);
  });

  it("clamps out-of-range pages", () => {
    expect(pageNumbers(99, 10)).toEqual([1, "...", 7, 8, 9, 10]);
    expect(pageNumbers(0, 10)).toEqual([1, 2, 3, 4, "...", 10]);
    expect(pageNumbers(1, 0)).toEqual([]);
  });
});
