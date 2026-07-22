// List pages animate the logo's gradient bar through the page's palettes.
import { describe, expect, it } from "vitest";
import { listPage } from "../src/pages";

const SEED_A = "HQVg7AnANKAMCMMQGYAcSAsYZgGyxlwCZFgTthldkZ4JsCjhYIMoNh5UIg";
const SEED_B = "_gEngEngEngFigFRgFMgJjgJMgJUhNtgckg6x";

const item = (seed, n) => ({
  seed,
  href: `/${seed}`,
  background: "linear-gradient(90deg,#000,#fff)",
  likesCount: n,
  createdAtMs: Date.UTC(2026, 0, 1),
  style: "linearGradient",
  steps: 7,
  angle: 90,
});

const page = (items) =>
  listPage({
    sort: "popular",
    path: "/",
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
    expect(html).toContain("@keyframes logo-s0");
    expect(html).toContain("@keyframes logo-s2");
    expect(html).toContain("prefers-reduced-motion: no-preference");
    expect(html).toMatch(/#logoG stop:nth-of-type\(1\)\{animation:logo-s0 6s/);
  });

  it("stays static with fewer than 2 palettes", () => {
    const html = page([item(SEED_A, 1)]);
    expect(html).not.toContain("@keyframes logo-s0");
  });
});
