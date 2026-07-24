// List pages animate the logo's gradient bar through the page's palettes.
import { describe, expect, it } from "vitest";
import { listPage } from "../src/pages";
import { renderPalette } from "../src/palette";

const SEED_A = "HQVg7AnANKAMCMMQGYAcSAsYZgGyxlwCZFgTthldkZ4JsCjhYIMoNh5UIg";
const SEED_B = "_gEngEngEngFigFRgFMgJjgJMgJUhNtgckg6x";

const item = (seed, n) => ({
  seed,
  key: seed,
  href: `/${seed}`,
  background: "linear-gradient(90deg,#000,#fff)",
  likesCount: n,
  createdAtMs: Date.UTC(2026, 0, 1),
  style: "linearGradient",
  steps: 7,
  angle: 90,
});

const page = (items, sort = "popular") =>
  listPage({
    sort,
    path: sort === "popular" ? "/" : `/${sort}`,
    params: { style: "auto", steps: "auto", angle: "auto", page: 1, limit: 24 },
    items,
    total: items.length,
    totalPages: 1,
    origin: "https://example.com",
    nowMs: Date.UTC(2026, 6, 21),
    stars: 0,
  });

describe("logo palette animation", () => {
  it("emits keyframes for all 3 gradient stops when 2+ palettes load", () => {
    const html = page([item(SEED_A, 1), item(SEED_B, 2)]);
    expect(html).toContain('id="logo-list-animation"');
    expect(html).toContain("@keyframes logo-list-s0");
    expect(html).toContain("@keyframes logo-list-s2");
    expect(html).toContain("prefers-reduced-motion: no-preference");
    expect(html).toMatch(/#logoG stop:nth-of-type\(1\)\{animation:logo-list-s0 6s/);
  });

  it("uses the only rendered palette as a static bar", () => {
    const html = page([item(SEED_A, 1)]);
    const colors = renderPalette(SEED_A, "linearGradient", 7, 90).hexColors;
    expect(html).not.toContain("@keyframes logo-list-s0");
    expect(html).toContain("animation:none");
    expect(html).toContain(`stop-color:${colors[0]}`);
    expect(html).toContain(`stop-color:${colors.at(-1)}`);
  });

  it("uses the route's own palette order", () => {
    const newest = page([item(SEED_A, 1), item(SEED_B, 2)], "newest");
    const saved = page([item(SEED_B, 2), item(SEED_A, 1)], "saved");
    const colorA = renderPalette(SEED_A, "linearGradient", 7, 90).hexColors[0];
    const colorB = renderPalette(SEED_B, "linearGradient", 7, 90).hexColors[0];
    expect(newest).toContain(`0.00%{stop-color:${colorA}}`);
    expect(saved).toContain(`0.00%{stop-color:${colorB}}`);
  });
});
