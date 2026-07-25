import { describe, expect, it } from "vitest";
import app, { LIST_HEADERS } from "../src/index";

describe("palette list cache policy", () => {
  it("never caches HTML or JSON containing live like totals", () => {
    expect(LIST_HEADERS).toEqual({
      "Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store",
    });
  });

  it("never caches missing bundled assets", async () => {
    const response = await app.request("https://grabient.com/assets/missing.js");

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
  });
});
