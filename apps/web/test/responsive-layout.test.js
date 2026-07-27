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
  total: 72,
  totalPages: 3,
  origin: "https://grabient.com",
  nowMs: 0,
  stars: 0,
});

describe("responsive subheader", () => {
  it("keeps only browse navigation in the sticky phone subheader", () => {
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
    expect(html).toContain("subheader mobile-options-docked");
    expect(appCss).toContain(".subheader.mobile-options-docked #opts");
    expect(appCss).toMatch(
      /\.subheader\.mobile-options-docked\s*\{\s*padding-top: 0;/,
    );
    expect(appCss).toContain(
      "> :is(.angle-wrap, .steps-wrap, .style-wrap)",
    );
    expect(appCss).not.toContain(
      "> :is(#opts-reset, .angle-wrap, .steps-wrap, .style-wrap)",
    );
  });
});

describe("responsive search placement", () => {
  it("keeps desktop search above results and homes the mobile dock before the footer", () => {
    const desktop = html.indexOf('data-search-placement="desktop"');
    const heading = html.indexOf('id="list-h1"');
    const mobile = html.indexOf('data-search-placement="mobile"');
    const main = html.indexOf("<main");
    const pagination = html.indexOf('class="pages ');
    const exportRoot = html.indexOf('id="export-root"');
    const dockHome = html.indexOf("data-mobile-search-dock-home");
    const footer = html.indexOf("<footer");

    expect(desktop).toBeGreaterThan(-1);
    expect(desktop).toBeLessThan(heading);
    expect(heading).toBeLessThan(pagination);
    expect(pagination).toBeLessThan(exportRoot);
    expect(exportRoot).toBeLessThan(dockHome);
    expect(dockHome).toBeLessThan(mobile);
    expect(mobile).toBeLessThan(footer);

    expect(html).toMatch(
      /data-search-placement="desktop"[^>]*class="[^"]*hidden[^"]*md:flex/,
    );
    expect(html).toMatch(
      /data-search-placement="mobile"[^>]*class="[^"]*md:hidden/,
    );
    expect(html).toMatch(
      /data-search-placement="mobile"[^>]*class="[^"]*fixed[^"]*bottom-0[^"]*bg-background/,
    );
    expect(html).toContain(
      '<main class="flex-1 px-5 pb-5 pt-3 md:pt-5 lg:px-14">',
    );
    expect(html).toContain(
      'data-mobile-search-dock-home class="relative h-[calc(11rem+env(safe-area-inset-bottom))] shrink-0 md:hidden"',
    );
    const mobileOptions = html.indexOf('id="opts-mobile"');
    const mobileSearch = html.indexOf('id="palette-search-mobile"');
    const mobileSuggestions = html.indexOf(
      'aria-label="Popular palette searches"',
      mobileSearch,
    );
    const mobileStyle = html.indexOf('name="style"', mobileOptions);
    const mobileAngle = html.indexOf('name="angle"', mobileOptions);
    const mobileSteps = html.indexOf('name="steps"', mobileOptions);
    expect(mobile).toBeLessThan(mobileOptions);
    expect(mobileOptions).toBeLessThan(mobileSearch);
    expect(mobileSearch).toBeLessThan(mobileSuggestions);
    expect(mobileStyle).toBeLessThan(mobileAngle);
    expect(mobileAngle).toBeLessThan(mobileSteps);
    expect(html).toMatch(
      /id="palette-search-mobile"[^>]*class="relative w-full"/,
    );
    expect(html).not.toMatch(
      /id="palette-search-mobile"[^>]*class="[^"]*max-w-/,
    );
    expect(html.match(/data-palette-search(?=[\s>])/g)).toHaveLength(2);
    expect(html.match(/id="palette-search"/g)).toHaveLength(1);
    expect(html.match(/id="palette-search-mobile"/g)).toHaveLength(1);
    expect(html.match(/id="palette-search-input"/g)).toHaveLength(1);
    expect(html.match(/id="palette-search-input-mobile"/g)).toHaveLength(1);
  });
});
