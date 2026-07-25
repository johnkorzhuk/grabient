// Multi-palette export: storage compat with the original site (export-list v1,
// fnv1a ids), selection UI (slot/stylesheet/toggles), the export view
// (open/close/history), option inputs + the dims popover, and the SVG grid
// generator.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportItemData, exportItemId, paletteCoeffKey } from "../src/palette";
import { generateSVGGrid } from "../src/islands/export";
import { listPage } from "../src/pages";
import { listKey, syncFromLocation, updateKey } from "../src/islands/params";
import { loadClient } from "./setup";

const SEED_A = "HQVg7AnANKAMCMMQGYAcSAsYZgGyxlwCZFgTthldkZ4JsCjhYIMoNh5UIg";
const SEED_B = "_gEngEngEngFigFRgFMgJjgJMgJUhNtgckg6x";

// This happy-dom build's localStorage is a bare object without Storage
// methods — same shim as consent.test.js.
const store = new Map();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
  },
  configurable: true,
  writable: true,
});

const itemA = () => exportItemData(SEED_A, "linearGradient", 7, 90);
const itemB = () => exportItemData(SEED_B, "radialGradient", 5, 45);

// Independent reimplementation of the original's createExportItemId — the
// compat contract is the exact JSON field order, so pin it here.
function refId({ seed, coeffs, style, steps, angle }) {
  const str = JSON.stringify({ seed, coeffs, style, steps, angle });
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

describe("exportItemData (palette.ts)", () => {
  it("builds the original's export-list item shape", () => {
    const it1 = itemA();
    expect(it1.coeffs).toHaveLength(4);
    expect(it1.coeffs[0]).toHaveLength(4); // [r,g,b,alpha]
    expect(it1.globals).toHaveLength(4);
    expect(it1.hexColors).toHaveLength(7); // sampled at steps
    expect(it1.hexColors[0]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(it1.seed).toBe(SEED_A);
    expect(it1.style).toBe("linearGradient");
  });

  it("id matches the original's fnv1a over {seed, coeffs, style, steps, angle}", () => {
    const it1 = itemA();
    expect(it1.id).toBe(refId(it1));
    expect(it1.id).toBe(exportItemId(SEED_A, it1.coeffs, "linearGradient", 7, 90));
    expect(it1.id).toMatch(/^[0-9a-z]+$/); // base36
  });

  it("id changes with view params (selection snapshots the effective view)", () => {
    const base = itemA();
    expect(exportItemData(SEED_A, "linearGradient", 8, 90).id).not.toBe(base.id);
    expect(exportItemData(SEED_A, "radialGradient", 7, 90).id).not.toBe(base.id);
    expect(exportItemData(SEED_A, "linearGradient", 7, 45).id).not.toBe(base.id);
  });

  it("returns null for unparseable seeds", () => {
    expect(exportItemData("not-a-seed", "linearGradient", 7, 90)).toBeNull();
  });
});

describe("generateSVGGrid", () => {
  it("lays out rows/columns with the original's geometry (gapY = gap*2, padding 56)", () => {
    const svg = generateSVGGrid({
      exportList: [itemA(), itemB(), itemA()],
      itemWidth: 300,
      itemHeight: 200,
      gap: 10,
      borderRadius: 0,
      columns: 2,
    });
    // 2 cols × 300 + 1 × 10 gap + 112 padding = 722
    // 2 rows × 200 + 1 × 20 gap + 112 padding = 532
    expect(svg).toContain('width="722"');
    expect(svg).toContain('height="532"');
    expect(svg).toContain('viewBox="0 0 722 532"');
    expect(svg).toContain("translate(56, 56)");
    expect(svg).toContain("translate(366, 56)");
    expect(svg).toContain("translate(56, 276)");
  });

  it("emits rounded-rect clip paths when borderRadius > 0", () => {
    const svg = generateSVGGrid({
      exportList: [itemA()],
      itemWidth: 300,
      itemHeight: 200,
      borderRadius: 50,
      columns: 1,
    });
    // 50% of min(300,200)/2 = 50px
    expect(svg).toContain('rx="50"');
    expect(svg).toContain('clip-path="url(#clip_0)"');
  });

  it("renders angular items via foreignObject + figma metadata, others inline", () => {
    const angular = exportItemData(SEED_A, "angularGradient", 7, 90);
    const svg = generateSVGGrid({
      exportList: [angular, itemA()],
      itemWidth: 300,
      itemHeight: 200,
      columns: 2,
    });
    expect(svg).toContain("foreignObject");
    expect(svg).toContain("data-figma-gradient-fill");
    expect(svg).toContain("GRADIENT_ANGULAR");
  });

  it("defaults columns to min(count, 5)", () => {
    const svg = generateSVGGrid({
      exportList: [itemA(), itemB()],
      itemWidth: 100,
      itemHeight: 100,
    });
    expect(svg).toContain('width="100"'.replace("100", "352")); // 2×100 + 40 + 112
  });
});

// ---------------------------------------------------------------------------
// DOM flow: SSR list page + real export module (happy-dom).
// ---------------------------------------------------------------------------
const cardItem = (seed, style = "linearGradient", steps = 7, angle = 90) => ({
  seed,
  key: seed,
  href: `/${seed}`,
  background: "linear-gradient(90deg,#000,#fff)",
  likesCount: 0,
  createdAtMs: Date.UTC(2026, 0, 1),
  style,
  steps,
  angle,
});

function mountListPage(items) {
  const html = listPage({
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
  // Same mount as prevlist.test.js: body content of the SSR document (the
  // shell's <body> carries class attrs, hence the [^>]*).
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
}

const seedList = (items) =>
  localStorage.setItem("export-list", JSON.stringify({ version: 1, items }));
const readList = () => JSON.parse(localStorage.getItem("export-list") ?? "{}");
const readOpts = () => JSON.parse(localStorage.getItem("export-options") ?? "{}");

async function boot() {
  const mod = await import("../src/islands/export");
  mod.bootExport();
  return mod;
}

describe("export selection (DOM flow)", () => {
  beforeEach(async () => {
    localStorage.clear();
    history.replaceState(null, "", "/");
    document.getElementById("export-style")?.remove();
    await loadClient();
    mountListPage([cardItem(SEED_A), cardItem(SEED_B, "radialGradient", 5, 45)]);
  });

  it("SSRs export containers + per-card toggles with matching ids", () => {
    const html = listPage({
      sort: "popular",
      path: "/",
      params: { style: "auto", steps: "auto", angle: "auto", page: 1, limit: 24 },
      items: [cardItem(SEED_A)],
      total: 1,
      totalPages: 1,
      origin: "https://example.com",
      nowMs: Date.UTC(2026, 6, 21),
      stars: 0,
      exportOpen: true,
    });
    expect(html).toContain('id="list-h1"');
    expect(html).toContain('id="palette-search-input"');
    expect(html).toContain('placeholder="Search palettes..."');
    expect(html).toContain('aria-label="Popular palette searches"');
    expect(html).toContain('id="export-slot"');
    expect(html).not.toContain('id="export-bar"');
    expect(html).toContain('id="export-root"');
    expect(html).toContain('<ol class="mb-12 grid');
    expect(html).toContain(`data-export-id="${itemA().id}"`);
    expect(html).toContain(`data-export-seed="${SEED_A}"`);
    expect(html).toMatch(/id="nav-select"[^>]* disabled/);
    expect(html).toMatch(/name="angle"[^>]* disabled/);
    expect(html).toMatch(/name="steps"[^>]* disabled/);
    expect(html).toMatch(/name="style"[^>]* disabled/);
    expect(html).toMatch(/id="opts-reset"[^>]*\shidden/);
  });

  it("clicking a card toggle adds the item in the original's storage shape", async () => {
    await boot();
    document.querySelector(`[data-export-seed="${SEED_A}"]`).click();
    const stored = readList();
    expect(stored.version).toBe(1);
    expect(stored.items).toHaveLength(1);
    const keys = Object.keys(stored.items[0]).sort();
    expect(keys).toEqual(
      ["angle", "coeffs", "globals", "hexColors", "id", "seed", "steps", "style"].sort(),
    );
    expect(stored.items[0].id).toBe(itemA().id);
    // Slot + toggle state
    expect(document.querySelector("#export-slot #export-open")).not.toBeNull();
    expect(document.getElementById("list-h1").textContent).toBe("Popular gradients");
    const btn = document.querySelector(`[data-export-seed="${SEED_A}"]`);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.getAttribute("aria-label")).toBe("Remove from export selection");
    expect(document.getElementById("export-style").textContent).toContain(itemA().id);
  });

  it("clicking a selected toggle removes the item and empties the slot", async () => {
    seedList([itemA()]);
    await boot();
    document.querySelector(`[data-export-seed="${SEED_A}"]`).click();
    expect(readList().items).toHaveLength(0);
    expect(document.querySelector("#export-slot #export-open")).toBeNull();
    expect(document.getElementById("export-slot").children).toHaveLength(0);
    expect(document.querySelector(`[data-export-seed="${SEED_A}"]`).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("boots from a seeded list: Export in the slot + stylesheet + pressed toggles", async () => {
    seedList([itemA(), itemB()]);
    await boot();
    expect(document.querySelector("#export-slot #export-open")).not.toBeNull();
    const css = document.getElementById("export-style").textContent;
    expect(css).toContain(itemA().id);
    expect(css).toContain(itemB().id);
    expect(
      document.querySelector(`[data-export-seed="${SEED_B}"]`).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("resets a corrupt or version-mismatched list", async () => {
    localStorage.setItem("export-list", JSON.stringify({ version: 99, items: [itemA()] }));
    await boot();
    expect(localStorage.getItem("export-list")).toBeNull();
    expect(document.querySelector("#export-slot #export-open")).toBeNull();
  });

  it("drops invalid items but keeps valid ones", async () => {
    localStorage.setItem(
      "export-list",
      JSON.stringify({ version: 1, items: [itemA(), { id: "junk", seed: 1 }, itemB()] }),
    );
    await boot();
    expect(document.querySelector("#export-slot #export-open")).not.toBeNull();
  });

  it("caps the selection at 50 (FIFO shift)", async () => {
    const fifty = Array.from({ length: 50 }, (_, i) =>
      exportItemData(SEED_A, "linearGradient", 7, i),
    );
    seedList(fifty);
    await boot();
    document.querySelector(`[data-export-seed="${SEED_B}"]`).click();
    const stored = readList();
    expect(stored.items).toHaveLength(50);
    expect(stored.items.find((i) => i.id === fifty[0].id)).toBeUndefined();
    expect(stored.items.find((i) => i.id === itemB().id)).toBeDefined();
  });
});

describe("export view (DOM flow)", () => {
  beforeEach(async () => {
    localStorage.clear();
    history.replaceState(null, "", "/");
    document.getElementById("export-style")?.remove();
    await loadClient();
    mountListPage([cardItem(SEED_A), cardItem(SEED_B, "radialGradient", 5, 45)]);
  });

  it("opens via the slot's Export button: pushes ?export=true, swaps the h1 text in place, hides the grid, renders cards + panel", async () => {
    const keyA = paletteCoeffKey(SEED_A);
    const keyB = paletteCoeffKey(SEED_B);
    globalThis.fetch = vi.fn(async (href) => {
      if (String(href).includes("/api/like-counts"))
        return {
          ok: true,
          json: async () => ({ counts: { [keyA]: 7, [keyB]: 4 } }),
        };
      return { ok: true, json: async () => ({}) };
    });
    seedList([itemA(), itemB()]);
    await boot();
    document.getElementById("export-open").click();
    expect(location.search).toBe("?export=true");
    expect(history.state.export).toBe(1);
    // The h1 row never unmounts — only its text swaps (nothing moves on y)
    const h1 = document.getElementById("list-h1");
    expect(h1.hidden).toBe(false);
    expect(h1.textContent).toBe("2 items selected");
    // Close occupies the same slot Export did
    expect(document.querySelector("#export-slot #export-close")).not.toBeNull();
    expect(document.querySelector("#export-slot #export-open")).toBeNull();
    expect(document.getElementById("grid-ssr").hidden).toBe(true);
    expect(document.getElementById("grid-island").hidden).toBe(true);
    expect(document.querySelectorAll("#export-cards > li")).toHaveLength(2);
    expect(document.querySelectorAll("#export-cards [data-export-toggle]")).toHaveLength(2);
    expect(document.querySelectorAll("#export-cards [data-like-seed]")).toHaveLength(2);
    expect(document.querySelectorAll("#export-cards a.card")).toHaveLength(0);
    expect(document.querySelectorAll("#export-cards .palette-card-edit")).toHaveLength(2);
    expect(document.querySelectorAll("#export-cards [data-palette-copy]")).toHaveLength(8);
    expect(document.querySelectorAll("#export-cards [data-palette-download]")).toHaveLength(2);
    expect(document.getElementById("export-cards").classList.contains("mb-12")).toBe(true);
    await vi.waitFor(() => {
      const counts = [...document.querySelectorAll("#export-cards .like-count")];
      expect(counts.map((count) => count.textContent)).toEqual(["7", "4"]);
      expect(counts.every((count) => !count.classList.contains("opacity-0"))).toBe(true);
    });
    // Export mode replaces the route's palette cycle with the selected items.
    const logoStyle = document.getElementById("logo-export-animation");
    expect(logoStyle).not.toBeNull();
    expect(logoStyle.textContent).toContain("@keyframes logo-export-s0");
    expect(logoStyle.textContent).toContain(itemA().hexColors[0]);
    expect(logoStyle.textContent).toContain(itemB().hexColors[0]);
    // Panel defaults (40/0/5) + auto Size (trigger not brightened)
    expect(document.getElementById("export-gap").value).toBe("40");
    expect(document.getElementById("export-radius").value).toBe("0");
    expect(document.getElementById("export-cols").value).toBe("5");
    expect(
      document.getElementById("export-dims").classList.contains("border-muted-foreground/30"),
    ).toBe(false);
    // Copy/Download remain visible and their menus align to the icon's end edge.
    const copy = document.getElementById("export-copy");
    const dl = document.getElementById("export-download");
    expect(copy.getAttribute("aria-label")).toBe("Copy");
    expect(dl.getAttribute("aria-label")).toBe("Download");
    const preview = document.getElementById("export-preview");
    expect(copy.closest(".group").contains(preview)).toBe(true);
    expect(dl.closest(".group")).toBe(copy.closest(".group"));
    expect(copy.parentElement.classList.contains("flex")).toBe(true);
    expect(copy.parentElement.classList.contains("hidden")).toBe(false);
    expect(copy.dataset.menuAlign).toBe("end");
    expect(dl.dataset.menuAlign).toBe("end");
    // Browse + palette options retain their layout but are disabled in export mode.
    const nav = document.getElementById("nav-select");
    expect(nav.parentElement.hidden).toBe(false);
    expect(nav.disabled).toBe(true);
    expect(nav.parentElement.querySelector("button[data-select-trigger]").disabled).toBe(true);
    expect(document.querySelector('#opts input[name="angle"]').disabled).toBe(true);
    expect(document.querySelector('#opts input[name="steps"]').disabled).toBe(true);
    expect(document.querySelector('#opts select[name="style"]').disabled).toBe(true);
    expect(document.querySelector('#opts button[data-select-trigger]').disabled).toBe(true);
    expect([...document.querySelectorAll("#opts .preset-btn")].every((button) => button.disabled)).toBe(
      true,
    );
    expect(document.getElementById("opts-reset").classList.contains("hidden")).toBe(true);
    expect(document.getElementById("opts").classList.contains("ml-auto")).toBe(true);
    // Live preview renders the composed SVG grid
    await vi.waitFor(() =>
      expect(document.querySelector("#export-preview svg")).not.toBeNull(),
    );
  });

  it("closes via Escape on a reload-mounted view: strips the flag, restores the grid + title", async () => {
    seedList([itemA()]);
    history.replaceState(null, "", "/?export=true"); // reload: no pushed state
    await boot();
    expect(document.getElementById("list-h1").textContent).toBe("1 item selected");
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(location.search).toBe("");
    expect(document.getElementById("export-root").hidden).toBe(true);
    expect(document.getElementById("list-h1").textContent).toBe("Popular gradients");
    expect(document.getElementById("grid-island").hidden).toBe(false);
    expect(document.getElementById("logo-export-animation")).toBeNull();
    expect(document.querySelector("#export-slot #export-open")).not.toBeNull(); // still 1 selected
    const nav = document.getElementById("nav-select");
    expect(nav.parentElement.hidden).toBe(false);
    expect(nav.parentElement.style.display).toBe("");
    expect(nav.disabled).toBe(false);
    expect(document.getElementById("opts").classList.contains("ml-auto")).toBe(true);
    expect(nav.parentElement.querySelectorAll("button[data-select-trigger]")).toHaveLength(1);
    expect(nav.parentElement.querySelector("button[data-select-trigger]").disabled).toBe(false);
    expect(document.querySelector('#opts input[name="angle"]').disabled).toBe(false);
    expect(document.querySelector('#opts input[name="steps"]').disabled).toBe(false);
    expect(document.querySelector('#opts select[name="style"]').disabled).toBe(false);
    expect(nav.parentElement.querySelector("button[data-select-trigger]").textContent).toContain(
      "Popular",
    );
  });

  it("Close button unwinds the pushed history entry; popstate closes in place", async () => {
    seedList([itemA()]);
    await boot();
    document.getElementById("export-open").click();
    expect(location.search).toBe("?export=true");
    const backSpy = vi.spyOn(history, "back").mockImplementation(() => {});
    document.getElementById("export-close").click();
    expect(backSpy).toHaveBeenCalled();
    backSpy.mockRestore();
    // The browser's Back lands as a popstate with the flag stripped — the
    // export module consumes it (no nav-layer fetch) and tears the view down.
    history.replaceState(history.state, "", "/");
    dispatchEvent(new PopStateEvent("popstate"));
    expect(document.getElementById("export-root").hidden).toBe(true);
    expect(document.getElementById("list-h1").textContent).toBe("Popular gradients");
  });

  it("strips a stale ?export=true when the list is empty", async () => {
    history.replaceState(null, "", "/?export=true");
    await boot();
    expect(location.search).toBe("");
    expect(document.getElementById("export-root").hidden).toBe(true);
  });

  it("option inputs clamp, persist v2, and re-render the preview", async () => {
    seedList([itemA()]);
    await boot();
    document.getElementById("export-open").click();
    const gap = document.getElementById("export-gap");
    gap.value = "12";
    gap.dispatchEvent(new Event("change", { bubbles: true }));
    expect(readOpts()).toMatchObject({ version: 2, gap: 12, borderRadius: 0, columns: 5 });
    expect(gap.value).toBe("12");
    // Out-of-range clamps back into the input
    gap.value = "99999";
    gap.dispatchEvent(new Event("change", { bubbles: true }));
    expect(gap.value).toBe("1000");
    expect(readOpts().gap).toBe(1000);
  });

  it("dims popover: auto shows the measured dims; a typed value commits clamped and brightens the trigger", async () => {
    seedList([itemA()]);
    await boot();
    document.getElementById("export-open").click();
    const dimsBtn = document.getElementById("export-dims");
    dimsBtn.click();
    const panel = document.getElementById("export-dims-panel");
    expect(panel).not.toBeNull();
    expect(dimsBtn.getAttribute("aria-expanded")).toBe("true");
    const w = panel.querySelector('[data-dim-axis="0"]');
    const h = panel.querySelector('[data-dim-axis="1"]');
    // happy-dom cards don't lay out, so auto falls back to the original's 800×400
    expect(w.value).toBe("800");
    expect(h.value).toBe("400");
    w.value = "915";
    w.dispatchEvent(new Event("change", { bubbles: true }));
    expect(readOpts()).toMatchObject({ width: 915, height: 400 });
    expect(dimsBtn.classList.contains("border-muted-foreground/30")).toBe(true);
    // The "auto" row resets both dims and closes the popover
    panel.querySelector('[role="option"]').click();
    expect(readOpts().width).toBeNull();
    expect(readOpts().height).toBeNull();
    expect(document.getElementById("export-dims-panel")).toBeNull();
    expect(dimsBtn.classList.contains("border-muted-foreground/30")).toBe(false);
  });

  it("dims inputs arrow-step live (Shift ×10), clamp to 40..6000, and Escape reverts without closing the view", async () => {
    seedList([itemA()]);
    await boot();
    document.getElementById("export-open").click();
    document.getElementById("export-dims").click();
    const w = document.querySelector('#export-dims-panel [data-dim-axis="0"]');
    w.value = "100";
    w.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(readOpts()).toMatchObject({ width: 101, height: 400 }); // live commit
    w.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, bubbles: true }),
    );
    expect(readOpts().width).toBe(91);
    w.value = "1";
    w.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(readOpts().width).toBe(40); // clamped at MIN_DIM
    // Escape reverts the input, keeps the popover AND the view open
    w.value = "999";
    w.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(w.value).toBe("40");
    expect(document.getElementById("export-dims-panel")).not.toBeNull();
    expect(document.getElementById("export-root").hidden).toBe(false);
    expect(location.search).toBe("?export=true");
  });

  it("dims popover closes on outside pointerdown", async () => {
    seedList([itemA()]);
    await boot();
    document.getElementById("export-open").click();
    document.getElementById("export-dims").click();
    expect(document.getElementById("export-dims-panel")).not.toBeNull();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(document.getElementById("export-dims-panel")).toBeNull();
  });

  it("dims popover lists the seed route's 8 presets; a pick applies, re-picking the active one resets to auto", async () => {
    seedList([itemA()]);
    await boot();
    document.getElementById("export-open").click();
    document.getElementById("export-dims").click();
    const opts = [...document.querySelectorAll('#export-dims-panel [role="option"]')];
    expect(opts).toHaveLength(9); // auto + 8 presets
    expect(opts[0].textContent).toContain("auto");
    expect(opts[0].getAttribute("aria-selected")).toBe("true");
    const hd = opts.find((b) => b.textContent.includes("1080p"));
    expect(hd.textContent).toContain("1920×1080");
    hd.click();
    expect(readOpts()).toMatchObject({ width: 1920, height: 1080 });
    expect(document.getElementById("export-dims-panel")).toBeNull();
    // Re-open: 1080p is the active preset — picking it again resets to auto.
    document.getElementById("export-dims").click();
    const opts2 = [...document.querySelectorAll('#export-dims-panel [role="option"]')];
    const hd2 = opts2.find((b) => b.textContent.includes("1080p"));
    expect(hd2.getAttribute("aria-selected")).toBe("true");
    hd2.click();
    expect(readOpts().width).toBeNull();
    expect(readOpts().height).toBeNull();
  });

  it("previews dimension presets on hover without persisting them, then restores the saved preview", async () => {
    seedList([itemA()]);
    await boot();
    document.getElementById("export-open").click();
    await vi.waitFor(() =>
      expect(document.querySelector("#export-preview svg")?.getAttribute("width")).toBe("4272"),
    );
    document.getElementById("export-dims").click();
    const hd = [...document.querySelectorAll('#export-dims-panel [role="option"]')].find((b) =>
      b.textContent.includes("1080p"),
    );
    hd.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.waitFor(() =>
      expect(document.querySelector("#export-preview svg")?.getAttribute("width")).toBe("9872"),
    );
    expect(readOpts().width).toBeUndefined();
    hd.dispatchEvent(new MouseEvent("mouseleave"));
    await vi.waitFor(() =>
      expect(document.querySelector("#export-preview svg")?.getAttribute("width")).toBe("4272"),
    );
  });

  it("copy menu writes the SVG grid and swaps the trigger icon to a check", async () => {
    seedList([itemA()]);
    await boot();
    document.getElementById("export-open").click();
    const writes = [];
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: (t) => {
          writes.push(t);
          return Promise.resolve();
        },
      },
      configurable: true,
    });
    const copyBtn = document.getElementById("export-copy");
    copyBtn.click();
    const pop = document.querySelector(".menu-pop");
    expect(pop).not.toBeNull();
    [...pop.querySelectorAll(".menu-item")]
      .find((b) => b.textContent.includes("SVG"))
      .click();
    await vi.waitFor(() => expect(copyBtn.innerHTML).toContain("M20 6 9 17l-5-5"));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("<svg");
    expect(copyBtn.getAttribute("data-icon")).toContain("rect"); // original icon stashed for restore
  });

  it("migrates v1 options (containerDimensions) into v2", async () => {
    seedList([itemA()]);
    localStorage.setItem(
      "export-options",
      JSON.stringify({
        version: 1,
        containerDimensions: { width: 915, height: 737 },
        gap: 8,
        borderRadius: 12,
        columns: 3,
      }),
    );
    await boot();
    document.getElementById("export-open").click();
    document.getElementById("export-dims").click();
    expect(document.querySelector('#export-dims-panel [data-dim-axis="0"]').value).toBe("915");
    expect(document.querySelector('#export-dims-panel [data-dim-axis="1"]').value).toBe("737");
    expect(document.getElementById("export-gap").value).toBe("8");
    expect(document.getElementById("export-radius").value).toBe("12");
    expect(document.getElementById("export-cols").value).toBe("3");
    // First save writes the migrated v2 shape
    const gap = document.getElementById("export-gap");
    gap.value = "9";
    gap.dispatchEvent(new Event("change", { bubbles: true }));
    expect(readOpts()).toMatchObject({ version: 2, width: 915, height: 737, gap: 9 });
  });

  it("toggling an item inside the open view updates the h1 count", async () => {
    seedList([itemA(), itemB()]);
    await boot();
    document.getElementById("export-open").click();
    expect(document.getElementById("list-h1").textContent).toBe("2 items selected");
    document.querySelector(`#export-cards [data-export-seed="${SEED_B}"]`).click();
    expect(document.getElementById("list-h1").textContent).toBe("1 item selected");
    expect(document.querySelectorAll("#export-cards > li")).toHaveLength(1);
  });

  it("removing the last item from inside the view closes it", async () => {
    seedList([itemA()]);
    await boot();
    document.getElementById("export-open").click();
    const backSpy = vi.spyOn(history, "back").mockImplementation(() => {});
    document.querySelector("#export-cards [data-export-toggle]").click();
    expect(backSpy).toHaveBeenCalled(); // auto-close unwinds the pushed entry
    backSpy.mockRestore();
    expect(readList().items).toHaveLength(0);
  });

  it("Clear selected empties the list and closes the view", async () => {
    seedList([itemA(), itemB()]);
    await boot();
    document.getElementById("export-open").click();
    const backSpy = vi.spyOn(history, "back").mockImplementation(() => {});
    document.getElementById("export-clear").click();
    expect(readList().items).toHaveLength(0);
    expect(backSpy).toHaveBeenCalled();
    backSpy.mockRestore();
  });
});

describe("updateKey keeps the export flag", () => {
  it("preserves ?export=true through island param writes", () => {
    history.replaceState(null, "", "/?steps=6&export=true");
    syncFromLocation();
    updateKey({ page: 2 });
    expect(location.search).toBe("?steps=6&page=2&export=true");
    expect(listKey().page).toBe(2);
  });

  it("does not add the flag when it is absent", () => {
    history.replaceState(null, "", "/?steps=6");
    syncFromLocation();
    updateKey({ page: 2 });
    expect(location.search).toBe("?steps=6&page=2");
  });
});
