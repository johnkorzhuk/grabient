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
  it("marks the flexible style control and wraps the options form on phones", () => {
    expect(html).toMatch(
      /id="opts"[\s\S]*class="ctrl-wrap style-wrap relative inline-flex shrink-0"/,
    );

    expect(appCss).toContain("flex-wrap: wrap");
    expect(appCss).toContain(".subheader #opts");
    expect(appCss).toContain("flex: 1 1 100%");
    expect(appCss).toContain("max-width: 100%");
    expect(appCss).toContain("margin: 0");
    expect(appCss).toContain("overflow-x: visible");
    expect(appCss).toContain(".subheader #opts .style-wrap");
    expect(appCss).toContain("min-width: 6.5rem");
  });
});
