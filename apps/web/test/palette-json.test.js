import { describe, expect, it } from "vitest";
import app from "../src/index";

const SEED = "_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKb";
const ORIGIN = "https://grabient-lite.jkorzhuk.workers.dev";

function env() {
  return { DB: {}, PUBLIC_ORIGIN: ORIGIN };
}

describe("palette JSON API", () => {
  it("serves a palette as machine-readable data at the .png route's sibling suffix", async () => {
    const response = await app.request(`http://local.test/${SEED}.json`, {}, env());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    // Public, read-only, edge-cached: usable from a browser-sandboxed agent.
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    // API surface, not a search result — the HTML page is the indexable form.
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    // The edge TTL is carried by CDN-Cache-Control, which outranks s-maxage.
    // s-maxage is deliberately absent: including it would disable
    // stale-while-revalidate and stale-if-error on a route we want served
    // stale rather than failed.
    expect(response.headers.get("cdn-cache-control")).toContain("max-age=604800");
    expect(response.headers.get("cache-control")).not.toContain("s-maxage");

    const body = await response.json();
    expect(body.seed).toBe(SEED);
    expect(body.url).toBe(`${ORIGIN}/${SEED}`);
    expect(body.png).toBe(`${ORIGIN}/${SEED}.png`);
    expect(body.hexColors).toHaveLength(body.steps);
    for (const hex of body.hexColors) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(body.coeffs.a).toHaveLength(3);
    expect(body.coeffs.d).toHaveLength(3);
    // Globals are a positional tuple internally; the API names them.
    expect(Object.keys(body.globals)).toEqual([
      "exposure",
      "contrast",
      "frequency",
      "phase",
    ]);
    expect(body.css).toContain("gradient");
    expect(Array.isArray(body.tags)).toBe(true);
    expect(body.tags.length).toBeGreaterThan(0);
  });

  it("honors style, steps and angle, and offers the query-param spelling", async () => {
    const response = await app.request(
      `http://local.test/api/palette.json?seed=${SEED}&style=radialSwatches&steps=5&angle=45`,
      {},
      env(),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.style).toBe("radialSwatches");
    expect(body.steps).toBe(5);
    expect(body.angle).toBe(45);
    expect(body.hexColors).toHaveLength(5);
  });

  it("rejects an undecodable seed without caching the rejection", async () => {
    const response = await app.request("http://local.test/not-a-seed.json", {}, env());
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).error).toBeTruthy();
  });

  it("answers preflight for the public render surface and only for it", async () => {
    const allowed = await app.request(
      `http://local.test/${SEED}.png`,
      { method: "OPTIONS" },
      env(),
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("*");
    expect(allowed.headers.get("access-control-allow-methods")).toContain("GET");

    // Pages and credentialed endpoints stay closed.
    const denied = await app.request("http://local.test/", { method: "OPTIONS" }, env());
    expect(denied.status).toBe(404);
    const html = await app.request(`http://local.test/${SEED}`, {}, env());
    expect(html.headers.get("access-control-allow-origin")).toBeNull();
  });
});
