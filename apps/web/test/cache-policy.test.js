import { describe, expect, it } from "vitest";
import { LIST_HEADERS } from "../src/index";

describe("palette list cache policy", () => {
  it("never caches HTML or JSON containing live like totals", () => {
    expect(LIST_HEADERS).toEqual({
      "Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store",
    });
  });
});
