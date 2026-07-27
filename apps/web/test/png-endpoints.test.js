import { describe, expect, it } from "vitest";
import app from "../src/index";
import { paletteBareSvg, paletteOgSvg, queryBareSvg, queryOgSvg } from "../src/seo";
import { renderPalette } from "../src/palette";

const SEED = "_gH0gGQgGQgH0gGQgEsgH0gH0gH0gAAgBkgDI";
const B = "https://grabient.com";

const RESULT = {
  seed: SEED,
  tags: ["blue"],
  style: "linearGradient",
  steps: 7,
  angle: 90,
  likesCount: 1,
  createdAt: 0,
  score: 1,
};

describe("raw PNG renders carry no branding", () => {
  it("omits the logo from a palette render but keeps it on the OG card", () => {
    const view = renderPalette(SEED, "linearGradient", 7, 90);
    const bare = paletteBareSvg(view, 1200, 630);
    const card = paletteOgSvg(view);

    // The logo is the only thing that pulls in the Grabient wordmark gradient.
    expect(card).toContain("logoG");
    expect(bare).not.toContain("logoG");
    expect(bare).not.toContain("Grabient");
    expect(bare).toContain('width="1200" height="630"');
  });

  it("omits the logo from a query montage but keeps it on the OG card", () => {
    const bare = queryBareSvg([RESULT], "auto", "auto", "auto", 1200, 630);
    const card = queryOgSvg([RESULT], "auto", "auto", "auto");

    expect(card).toContain("logoG");
    expect(bare).not.toContain("logoG");
    expect(bare).not.toContain("Grabient");
  });

  it("honours requested dimensions", () => {
    const view = renderPalette(SEED, "linearGradient", 7, 90);
    expect(paletteBareSvg(view, 916, 88)).toContain('width="916" height="88"');
    expect(queryBareSvg([RESULT], "auto", "auto", "auto", 400, 200)).toContain(
      'width="400" height="200"',
    );
  });
});

// These assert routing and parameter parsing only. Rasterizing is impossible
// here: renderPng imports @cf-wasm/resvg/workerd, which needs the workers
// runtime, which is also why /api/og has never had route-level coverage. The
// 400 paths all run before any rasterizing, so they prove the route matched,
// the suffix was stripped and the handler parsed its input. Actual image output
// is verified against the deployed worker.
describe("PNG routing", () => {
  it("rejects an unparseable seed rather than rendering a default", async () => {
    expect((await app.request(`${B}/api/png?seed=notaseed!!`)).status).toBe(400);
  });

  it("strips the .png suffix before parsing the seed", async () => {
    // Reaching the seed validator at all means /:seed{.+\.png} matched and the
    // suffix was removed — otherwise this would 404 from the catch-all.
    expect((await app.request(`${B}/notaseed!!.png`)).status).toBe(400);
  });

  it("requires a query for the search render", async () => {
    expect((await app.request(`${B}/api/png/query`)).status).toBe(400);
    expect((await app.request(`${B}/api/png/query?q=`)).status).toBe(400);
  });

  it("does not fall through to the HTML search page", async () => {
    const response = await app.request(`${B}/palettes/denim.png`);
    expect(response.headers.get("Content-Type") ?? "").not.toContain("text/html");
  });
});
