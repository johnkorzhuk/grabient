import { describe, expect, it } from "vitest";
import app, { LIST_HEADERS } from "../src/index";

describe("palette list cache policy", () => {
  // List HTML used to be no-store because it embeds like totals. It is now
  // edge-cacheable: the markup is identical for every visitor (session UI is
  // applied client-side) and the client's /api/like-counts pass repaints the
  // real totals on load and on every swap. The trade is that a served list can
  // show counts up to the CDN TTL stale for the instant before that pass lands.
  //
  // If this ever goes back to no-store, the reconciliation pass is what makes
  // caching safe — check that first.
  it("lets the edge cache list HTML and JSON, briefly", () => {
    expect(LIST_HEADERS).toEqual({
      "Cache-Control": "public, max-age=60",
      "CDN-Cache-Control": "max-age=300, stale-while-revalidate=900",
    });
  });

  // The browser TTL must stay short and SWR-free: a browser cache is not
  // invalidated by a deploy, so a long one serves pre-deploy HTML afterwards.
  it("keeps the browser TTL short with no stale-while-revalidate", () => {
    expect(LIST_HEADERS["Cache-Control"]).toBe("public, max-age=60");
    expect(LIST_HEADERS["Cache-Control"]).not.toContain("stale-while-revalidate");
  });

  it("never caches missing bundled assets", async () => {
    const response = await app.request("https://grabient.com/assets/missing.js");

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
  });

  it("never caches the HTTP to HTTPS redirect", async () => {
    const response = await app.request("http://grabient.com/", {
      headers: { "x-forwarded-proto": "http" },
    });

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("https://grabient.com/");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
  });
});
