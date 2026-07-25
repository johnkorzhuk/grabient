// Integration test against the BUILT islands bundle (dist/client): the grid
// island must mount its palette data from SSR-embedded JSON, replace the SSR
// grid, reconcile the cached like counts, and register the params handler that makes
// style/steps/angle changes in-place instead of full navigations.
// Requires `pnpm build` first (CI order: build -> test).
import { describe, expect, it, vi } from "vitest";
import manifest from "../dist/client/.vite/manifest.json";

const DATA = {
  palettes: [
    { seed: "HQVg7AnANKAMCMMQGYAcSAsYZgGyxlwCZFgTthldkZ4JsCjhYIMoNh5UIg", href: "/_test1", background: "linear-gradient(90deg, #000, #fff)", likesCount: 2, style: "linearGradient", steps: 7, angle: 90 },
    { seed: "_gEngEngEngFigFRgFMgJjgJMgJUhNtgckg6x", href: "/_test2", background: "red", likesCount: 0, style: "radialGradient", steps: 5, angle: 45 },
  ],
  total: 2,
  totalPages: 1,
};

describe("islands integration (built bundle)", () => {
  it("mounts the grid island from SSR data, removes SSR grid, registers params handler", async () => {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    globalThis.IntersectionObserver = class {
      observe() {}
      disconnect() {}
    };
    window.scrollTo = () => {};
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    document.body.innerHTML = `
<header><form id="opts"><select name="style"><option value="">Auto</option></select><input name="steps" value=""><input name="angle" value=""></form></header>
<main class="wrap">
<div id="grid-ssr"><ul class="grid"><li><a class="card" href="/_test1">ssr</a></li></ul></div>
<div id="grid-island"></div>
<script type="application/json" id="__DATA__">${JSON.stringify(DATA)}</script>
</main>`;

    await import(/* @vite-ignore */ `../dist/client/${manifest["src/islands/entry.tsx"].file}`);
    await new Promise((r) => setTimeout(r, 50));

    expect(document.getElementById("grid-ssr")).toBeNull();
    const cards = document.querySelectorAll("#grid-island [data-palette-card]");
    expect(cards.length).toBe(2);
    expect(document.querySelector("#grid-island .grid-virtual").classList.contains("mb-12")).toBe(
      true,
    );
    expect(cards[0].querySelector(".palette-card-edit").getAttribute("href")).toBe("/_test1");
    expect(cards[0].querySelectorAll("[data-palette-copy]")).toHaveLength(4);
    expect(cards[0].querySelectorAll("[data-palette-download]")).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/like-counts?keys=");
    expect(typeof window.__paramsHandler).toBe("function");
  });

  it("wires hover previews onto an SSR-only Saved grid", () => {
    const saved = DATA.palettes[0];
    document.body.innerHTML = `
<header><form id="opts"><select name="style"><option value=""></option></select><input name="steps" value=""><input name="angle" value=""></form></header>
<main>
  <div id="grid-ssr"><ol><li>
    <div data-palette-card data-palette-seed="${saved.seed}" data-palette-style="${saved.style}" data-palette-steps="${saved.steps}" data-palette-angle="${saved.angle}">
      <div class="glow" style="background:${saved.background}"></div>
      <div class="card" style="background:${saved.background}"></div>
      <button data-export-toggle></button>
    </div>
    <button data-like-seed="${saved.seed}"></button>
  </li></ol></div>
  <script type="application/json" id="__DATA__" data-static-preview>${JSON.stringify(DATA)}</script>
</main>`;
    history.replaceState(null, "", "/saved");
    document.dispatchEvent(new CustomEvent("app:swap"));

    expect(document.getElementById("grid-ssr")).not.toBeNull();
    expect(window.__paramsHandler).toBeUndefined();
    expect(typeof window.__previewHandler).toBe("function");

    window.__previewHandler({ style: "radialGradient", steps: "13", angle: "45" });
    const card = document.querySelector("[data-palette-card]");
    expect(card.dataset.paletteStyle).toBe("radialGradient");
    expect(card.dataset.paletteSteps).toBe("13");
    expect(card.dataset.paletteAngle).toBe("45");
    expect(card.querySelector(".card").style.background).not.toBe(saved.background);

    window.__previewHandler(null);
    expect(card.dataset.paletteStyle).toBe(saved.style);
    expect(card.dataset.paletteSteps).toBe(String(saved.steps));
    expect(card.dataset.paletteAngle).toBe(String(saved.angle));
  });
});
