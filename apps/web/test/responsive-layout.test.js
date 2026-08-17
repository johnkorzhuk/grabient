import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { listPage, seedPage } from "../src/pages";

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

describe("canvas-mode graph is a mode", () => {
  const seedHtml = seedPage({
    seed: "_gDXgDJgEFgKggKsgJSgEYgFbgDsgguhBdgAAlBoEwFfn",
    params: { style: "auto", steps: "auto", angle: "auto", page: 1, limit: 24 },
    size: "auto",
    graph: false,
    origin: "https://grabient.com",
    stars: 0,
  });

  it("puts the close button's slot outside the form it has to outlive", () => {
    // Graph mode hides #opts wholesale, so a slot nested inside it would go
    // with it. The slot is the form's sibling for exactly that reason.
    expect(seedHtml).toMatch(/<\/form>\s*<span id="graph-dock"/);
  });

  it("hides the whole options form rather than listing its children", () => {
    expect(appCss).toMatch(/\.seed-hero\.show-graph #opts\s*\{\s*display: none;/);
    expect(appCss).toMatch(
      /\.seed-hero\.show-graph #graph-dock\s*\{\s*display: flex;/,
    );
    // The dock is empty once its button moves, and an empty flex item still
    // spends a row gap.
    expect(appCss).toMatch(
      /\.seed-hero\.show-graph #mobile-dock\s*\{\s*display: none;/,
    );
  });

  it("relocates only the graph toggle, not the whole dock", () => {
    // The dock portal held the toggle AND copy/export/dimensions/download.
    // Re-pointing that one portal dragged every one of them into the subheader.
    // Two portals now: the toggle moves, the rest is anchored to #mobile-dock.
    const island = readFileSync(resolve(process.cwd(), "src/islands/edit.tsx"), "utf8");
    const toggle = island.indexOf("graphBtnMount()");
    const rest = island.indexOf("<Show when={dockMount}>");
    expect(toggle).toBeGreaterThan(-1);
    expect(rest).toBeGreaterThan(toggle);
    // The format buttons must sit in the anchored portal, after it opens.
    expect(island.indexOf("data-mobile-format-actions")).toBeGreaterThan(rest);
    // Solid wraps each portal in a div; two portals into one mount would stack
    // unless the wrappers are dissolved.
    expect(appCss).toMatch(
      /#mobile-dock > div,\s*#graph-dock > div \{\s*display: contents;/,
    );
  });

  it("separates the view toggle from the export cluster in the dock", () => {
    // A view control on the end of the export row is the wrong group, and the
    // toggle arrives from its own portal — so its position is set by `order`,
    // not by whichever portal happens to mount first.
    const island = readFileSync(resolve(process.cwd(), "src/islands/edit.tsx"), "utf8");
    expect(island).toContain("data-graph-toggle");
    expect(appCss).toMatch(
      /#mobile-dock \[data-graph-toggle\] \{\s*order: -1;/,
    );
    expect(appCss).toMatch(/#mobile-dock \{[^}]*justify-content: space-between;/);
    // Icon actions sit in a row above the format chips: two parallel lines, not
    // a column wrapped round the corner of one.
    expect(island).toMatch(
      /class="order-1 flex items-center gap-2" data-mobile-primary-actions/,
    );
  });

  it("gives the seed subheader one icon rail and one content column", () => {
    // The seed page has no browse select, so a two-column .subheader-left left
    // row 1 as a lone back button, a dead gap, then the style select.
    expect(appCss).toMatch(
      /\.subheader:not\(\.sticky\) \.subheader-left \{\s*grid-column: 1;/,
    );
    expect(appCss).toMatch(
      /\.subheader:not\(\.sticky\) #opts \.style-wrap \{\s*grid-column: 2 \/ 4;/,
    );
  });

  it("gates every rule that reveals the preview stacks on graph mode", () => {
    // Four rules turn these on and they all share a specificity, so a later
    // display:none wins or loses on source order. Gating the positives leaves
    // one answer instead of a race.
    const reveals = appCss.match(
      /^\s*\.seed-hero\.(?:ui-show|menu-open)[^{]*#preview-actions[^{]*\{/gm,
    );
    expect(reveals).not.toBeNull();
    for (const rule of reveals) expect(rule).toContain(":not(.show-graph)");
    // …and the Tailwind group-hover utility on the markup is closed too.
    expect(appCss).toMatch(
      /\.seed-hero\.show-graph :is\(#preview-actions, #preview-actions-br\)/,
    );
  });
});
