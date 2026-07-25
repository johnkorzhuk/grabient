import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { listPage } from "../src/pages";

const appCss = readFileSync(resolve(process.cwd(), "src/app.css"), "utf8");

const html = listPage({
  sort: "popular",
  path: "/",
  params: {
    style: "radialGradient",
    steps: 13,
    angle: 45,
    page: 1,
    limit: 24,
  },
  items: [],
  total: 0,
  totalPages: 1,
  origin: "https://grabient.com",
  nowMs: 0,
  stars: 0,
  emptyText: "No palettes",
});

describe("responsive subheader", () => {
  it("uses a compact two-row grid with a full browse label on phones", () => {
    expect(html).toMatch(
      /id="opts"[\s\S]*class="subheader-left[\s\S]*class="ctrl-wrap browse-wrap/,
    );
    expect(html).toContain("ctrl-wrap angle-wrap");
    expect(html).toContain("ctrl-wrap steps-wrap");
    expect(html).toContain("ctrl-wrap style-wrap");

    expect(appCss).toContain(".subheader #opts");
    expect(appCss).toContain(
      "grid-template-columns: 2.75rem minmax(0, 1fr) minmax(0, 1fr)",
    );
    expect(appCss).toContain("grid-template-rows: auto auto");
    expect(appCss).toContain("max-width: 100%");
    expect(appCss).toContain("margin: 0");
    expect(appCss).toContain("overflow-x: visible");
    expect(appCss).toContain(".subheader #opts .style-wrap");
    expect(appCss).toContain(".subheader #opts-reset.hidden + .angle-wrap");
    expect(appCss).toContain(".subheader-left .browse-wrap");
    expect(appCss).toContain("width: 8.5rem");
  });
});
