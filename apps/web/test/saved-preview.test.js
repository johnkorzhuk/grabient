import { describe, expect, it } from "vitest";
import { applyStaticListPreview } from "../src/islands/static-list-preview";
import { exportItemData, paletteCoeffKey, renderPalette } from "../src/palette";
import { listPage } from "../src/pages";

const SEED = "HQVg7AnANKAMCMMQGYAcSAsYZgGyxlwCZFgTthldkZ4JsCjhYIMoNh5UIg";

const item = {
  seed: SEED,
  key: paletteCoeffKey(SEED),
  href: `/${SEED}`,
  background: renderPalette(SEED, "linearGradient", 7, 90).background,
  likesCount: 3,
  createdAtMs: Date.UTC(2026, 6, 21),
  style: "linearGradient",
  steps: 7,
  angle: 90,
};

describe("Saved palette hover preview", () => {
  it("serializes preview data while retaining the SSR-only grid", () => {
    const html = listPage({
      sort: "saved",
      path: "/saved",
      params: { style: "auto", steps: "auto", angle: "auto", page: 1, limit: 24 },
      items: [item],
      total: 1,
      totalPages: 1,
      origin: "https://example.com",
      nowMs: Date.UTC(2026, 6, 21),
      stars: 0,
      island: false,
    });
    expect(html).toContain('id="grid-ssr"');
    expect(html).not.toContain('id="grid-island"');
    expect(html).toContain('id="__DATA__" data-static-preview');
  });

  it("repaints saved cards and synchronizes their action metadata", () => {
    document.body.innerHTML = listPage({
      sort: "saved",
      path: "/saved",
      params: { style: "auto", steps: "auto", angle: "auto", page: 1, limit: 24 },
      items: [item],
      total: 1,
      totalPages: 1,
      origin: "https://example.com",
      nowMs: Date.UTC(2026, 6, 21),
      stars: 0,
      island: false,
    }).match(/<body[^>]*>([\s\S]*)<\/body>/)[1];

    applyStaticListPreview([item], { style: "radialGradient", steps: 13, angle: 45 });

    const expected = renderPalette(SEED, "radialGradient", 13, 45);
    const expectedExport = exportItemData(SEED, "radialGradient", 13, 45);
    const card = document.querySelector("[data-palette-card]");
    expect(card.querySelector(".card").style.background).toBe(expected.background);
    expect(card.querySelector(".glow").style.background).toBe(expected.background);
    expect(card.dataset.paletteStyle).toBe("radialGradient");
    expect(card.dataset.paletteSteps).toBe("13");
    expect(card.dataset.paletteAngle).toBe("45");
    expect(card.querySelector("[data-export-toggle]").dataset.exportId).toBe(expectedExport.id);
    expect(card.closest("li").querySelector("[data-like-seed]").dataset.likeStyle).toBe(
      "radialGradient",
    );
  });
});
