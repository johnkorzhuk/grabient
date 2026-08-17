import { describe, expect, it, vi } from "vitest";
import manifest from "../dist/client/.vite/manifest.json";
import { seedPage } from "../src/pages";
import { paletteCoeffKey } from "../src/palette";

const store = new Map();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  },
  configurable: true,
  writable: true,
});

const SEED = "_gEngEngEngFigFRgFMgJjgJMgJUhNtgckg6x";

describe("$seed preview dimensions", () => {
  it("keeps the open trigger rendered and previews presets without committing the URL", async () => {
    localStorage.removeItem("export-list");
    history.replaceState(null, "", `/${SEED}`);
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
    globalThis.IntersectionObserver = class {
      observe() {}
      disconnect() {}
    };
    globalThis.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    globalThis.fetch = vi.fn(async () => ({ ok: false, json: async () => null }));
    window.scrollTo = vi.fn();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const html = seedPage({
      seed: SEED,
      params: { style: "auto", steps: "auto", angle: "auto", page: 1, limit: 24 },
      size: "auto",
      graph: false,
      origin: "http://localhost",
      stars: 0,
    });
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];

    await import(/* @vite-ignore */ `../dist/client/${manifest["src/islands/entry.tsx"].file}`);
    await vi.waitFor(() =>
      expect(
        document.querySelector('#preview-actions button[aria-label="Preview dimensions"]'),
      ).not.toBeNull(),
    );
    expect(
      [...document.querySelectorAll("#preview-actions button")].map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).toEqual([
      "Add to export selection",
      "Preview dimensions",
      "Download gradient",
    ]);
    expect(
      [...document.querySelectorAll("#preview-actions-br button")].map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).toEqual(["Copy CSS", "Copy SVG", "Copy PNG to clipboard", "Copy URL"]);
    const mobilePrimary = document.querySelector("[data-mobile-primary-actions]");
    const mobileFormats = document.querySelector("[data-mobile-format-actions]");
    expect(mobilePrimary.className).toContain("order-1");
    // A ROW, not a column. Stacked above the format chips it wrapped the dock
    // round the corner in an L; two parallel right-aligned rows read as one
    // block. See responsive-layout.test.js for the rest of the dock contract.
    expect(mobilePrimary.className).toContain("items-center");
    expect(mobilePrimary.className).not.toContain("flex-col");
    expect(
      [...mobilePrimary.querySelectorAll("button")].map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).toEqual([
      "Add to export selection",
      "Preview dimensions",
      "Download gradient",
    ]);
    expect(mobileFormats.className).toContain("order-2");
    expect(mobileFormats.className).toContain("items-center");
    expect(
      [...mobileFormats.querySelectorAll("button")].map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).toEqual(["Copy CSS", "Copy SVG", "Copy PNG to clipboard", "Copy URL"]);

    document.querySelector('#preview-actions-br button[aria-label="Copy URL"]').click();
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `http://localhost/${SEED}?style=linearGradient&steps=7&angle=90`,
      ),
    );

    const heart = document.querySelector("[data-like-info]");
    const initialHeartSeed = heart.dataset.likeRow;
    const exposure = document.querySelector(
      'input[type="range"][aria-label="exposure"]',
    );
    exposure.value = "0.1";
    exposure.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(heart.dataset.likeRow).not.toBe(initialHeartSeed));
    await vi.waitFor(() =>
      expect(decodeURIComponent(location.pathname.slice(1))).toBe(heart.dataset.likeRow),
    );
    expect(heart.dataset.likeSeed).toBe(paletteCoeffKey(heart.dataset.likeRow));
    expect(heart.dataset.likeSeed).not.toBe(heart.dataset.likeRow);

    const afterGlobalSeed = heart.dataset.likeRow;
    const exposureTab = [...document.querySelectorAll('button[aria-expanded]')].find(
      (button) => button.textContent.trim() === "exposure",
    );
    exposureTab.click();
    await vi.waitFor(() =>
      expect(
        document.querySelector(
          'input[type="range"][aria-label="exposure Red channel"]',
        ),
      ).not.toBeNull(),
    );
    const red = document.querySelector(
      'input[type="range"][aria-label="exposure Red channel"]',
    );
    const currentRed = Number(red.value);
    red.value = String(currentRed > 0.8 ? currentRed - 0.1 : currentRed + 0.1);
    red.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(heart.dataset.likeRow).not.toBe(afterGlobalSeed));
    await vi.waitFor(() =>
      expect(decodeURIComponent(location.pathname.slice(1))).toBe(heart.dataset.likeRow),
    );
    expect(heart.dataset.likeSeed).toBe(paletteCoeffKey(heart.dataset.likeRow));

    const exportTrigger = document.querySelector(
      "#preview-actions [data-seed-export-toggle]",
    );
    expect(exportTrigger.getAttribute("aria-pressed")).toBe("false");
    exportTrigger.click();
    const selected = JSON.parse(localStorage.getItem("export-list"));
    expect(selected.version).toBe(1);
    expect(selected.items).toHaveLength(1);
    expect(selected.items[0].seed).toBe(heart.dataset.likeRow);
    expect(exportTrigger.getAttribute("aria-pressed")).toBe("true");
    expect(exportTrigger.querySelector(".xp-minus")).not.toBeNull();
    exportTrigger.click();
    expect(JSON.parse(localStorage.getItem("export-list")).items).toHaveLength(0);
    expect(exportTrigger.getAttribute("aria-pressed")).toBe("false");

    const preview = document.getElementById("edit-preview");
    const beforeInvert = preview.style.background;
    document.querySelector('button[aria-label="Invert gradient colors"]').click();
    expect(preview.style.background).not.toBe(beforeInvert);

    const beforeSwap = preview.style.background;
    const firstChannel = document.querySelector("#rgb-tabs [data-ch]");
    firstChannel.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(preview.style.background).not.toBe(beforeSwap);

    const trigger = document.querySelector(
      '#preview-actions button[aria-label="Preview dimensions"]',
    );
    trigger.click();

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.className).toContain("bg-background/60");
    expect(document.getElementById("seed-hero").classList.contains("menu-open")).toBe(true);

    const fit = document.getElementById("preview-fit");
    const preset = document.querySelector('[data-preview-dims="1920x1080"]');
    const searchBeforePreset = location.search;
    preset.dispatchEvent(new MouseEvent("mouseenter"));
    expect(fit.style.getPropertyValue("aspect-ratio").replaceAll(" ", "")).toBe("1920/1080");
    expect(location.search).toBe(searchBeforePreset);

    preset.dispatchEvent(new MouseEvent("mouseleave"));
    expect(fit.style.getPropertyValue("aspect-ratio")).toBe("");
    expect(fit.style.width).toBe("100%");
    expect(fit.style.height).toBe("100%");

    trigger.click();
    const graph = document.querySelector('button[aria-label="Open graph"]');
    expect(graph.getAttribute("aria-keyshortcuts")).toBe("Escape");
    graph.click();
    expect(document.getElementById("seed-hero").classList.contains("show-graph")).toBe(true);
    expect(location.search).toContain("graph=1");
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(document.getElementById("seed-hero").classList.contains("show-graph")).toBe(false);
    expect(location.search).not.toContain("graph=1");
  });
});
