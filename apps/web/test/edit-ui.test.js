import { describe, expect, it, vi } from "vitest";
import manifest from "../dist/client/.vite/manifest.json";
import { seedPage } from "../src/pages";

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
    ).toEqual(["Copy CSS", "Copy SVG", "Copy PNG to clipboard"]);
    const mobilePrimary = document.querySelector("[data-mobile-primary-actions]");
    const mobileFormats = document.querySelector("[data-mobile-format-actions]");
    expect(mobilePrimary.className).toContain("order-1");
    expect(mobilePrimary.className).toContain("flex-col");
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
    ).toEqual(["Copy CSS", "Copy SVG", "Copy PNG to clipboard"]);

    const exportTrigger = document.querySelector(
      "#preview-actions [data-seed-export-toggle]",
    );
    expect(exportTrigger.getAttribute("aria-pressed")).toBe("false");
    exportTrigger.click();
    const selected = JSON.parse(localStorage.getItem("export-list"));
    expect(selected.version).toBe(1);
    expect(selected.items).toHaveLength(1);
    expect(selected.items[0].seed).toBe(SEED);
    expect(exportTrigger.getAttribute("aria-pressed")).toBe("true");
    expect(exportTrigger.querySelector(".xp-minus")).not.toBeNull();
    exportTrigger.click();
    expect(JSON.parse(localStorage.getItem("export-list")).items).toHaveLength(0);
    expect(exportTrigger.getAttribute("aria-pressed")).toBe("false");

    const trigger = document.querySelector(
      '#preview-actions button[aria-label="Preview dimensions"]',
    );
    trigger.click();

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.className).toContain("bg-background/60");
    expect(document.getElementById("seed-hero").classList.contains("menu-open")).toBe(true);

    const fit = document.getElementById("preview-fit");
    const preset = document.querySelector('[data-preview-dims="1920x1080"]');
    preset.dispatchEvent(new MouseEvent("mouseenter"));
    expect(fit.style.getPropertyValue("aspect-ratio").replaceAll(" ", "")).toBe("1920/1080");
    expect(location.search).toBe("");

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
