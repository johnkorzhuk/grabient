// UI delegation handlers that must work on every page type.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadClient } from "./setup";

let fetchMock;

beforeAll(async () => {
  fetchMock = await loadClient();
});

describe("delegated UI handlers", () => {
  it("supports the current app's theme and eyedropper shortcuts outside editable fields", async () => {
    document.documentElement.classList.remove("dark");
    document.body.innerHTML = `<div id="live"></div>
      <button id="theme-toggle" aria-label="Toggle theme"></button>
      <input id="editable">`;

    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.getElementById("theme-toggle").getAttribute("aria-label")).toBe(
      "Switch to light theme",
    );

    document.getElementById("editable").dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    const open = vi.fn(async () => ({ sRGBHex: "#12abef" }));
    const writeText = vi.fn(async () => {});
    Object.defineProperty(window, "EyeDropper", {
      value: class {
        open() {
          return open();
        }
      },
      configurable: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "e", metaKey: true, bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("#12abef"));
    expect(document.getElementById("live").textContent).toBe("#12abef copied");
    delete window.EyeDropper;
    document.documentElement.classList.remove("dark");
  });

  it("copies data-copy content and restores label", async () => {
    document.body.innerHTML = `<button id="c" data-copy="#aabbcc">#aabbcc</button>`;
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    document.getElementById("c").click();
    expect(writeText).toHaveBeenCalledWith("#aabbcc");
  });

  it("copies CSS, SVG, and PNG from palette-list format buttons", async () => {
    document.body.innerHTML = `<div id="live"></div>
      <div data-palette-card data-palette-seed="HQVg7AnANKAMCMMQGYAcSAsYZgGyxlwCZFgTthldkZ4JsCjhYIMoNh5UIg" data-palette-style="linearGradient" data-palette-steps="7" data-palette-angle="90">
        <button data-palette-card-action data-palette-copy="css">CSS</button>
        <button data-palette-card-action data-palette-copy="svg">SVG</button>
        <button data-palette-card-action data-palette-copy="png">PNG</button>
      </div>`;
    const writeText = vi.fn(() => Promise.resolve());
    const write = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText, write },
      configurable: true,
    });
    const gradient = { addColorStop: vi.fn() };
    const context = {
      createLinearGradient: vi.fn(() => gradient),
      fillRect: vi.fn(),
      set fillStyle(_value) {},
    };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) => callback(new Blob(["png"], { type: "image/png" })));
    class TestClipboardItem {
      constructor(data) {
        this.data = data;
      }
    }
    Object.defineProperty(globalThis, "ClipboardItem", {
      value: TestClipboardItem,
      configurable: true,
    });

    document.querySelector('[data-palette-copy="css"]').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(writeText.mock.calls[0][0]).toContain("linear-gradient");
    document.querySelector('[data-palette-copy="svg"]').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(writeText.mock.calls[1][0]).toContain("<svg");
    document.querySelector('[data-palette-copy="png"]').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(write).toHaveBeenCalledTimes(1);
    expect(document.getElementById("live").textContent).toBe("PNG copied to clipboard");

    getContext.mockRestore();
    toBlob.mockRestore();
  });

  it("opens an aligned palette download menu and downloads SVG", async () => {
    document.body.innerHTML = `<div id="live"></div>
      <div data-palette-card data-palette-seed="HQVg7AnANKAMCMMQGYAcSAsYZgGyxlwCZFgTthldkZ4JsCjhYIMoNh5UIg" data-palette-style="linearGradient" data-palette-steps="7" data-palette-angle="90">
        <button data-palette-card-action data-palette-download data-menu-align="end" aria-expanded="false">Download</button>
      </div>`;
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const trigger = document.querySelector("[data-palette-download]");
    trigger.click();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect([...document.querySelectorAll(".menu-item")].map((item) => item.textContent)).toEqual([
      "SVG",
      "PNG",
    ]);
    document.querySelector(".menu-item").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(document.getElementById("live").textContent).toBe("SVG download started");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    click.mockRestore();
  });

  it("swatch copy swaps only the label text, keeping the pill span intact", async () => {
    document.body.innerHTML = `<button data-copy="#aabbcc"><span class="swatch-label">#aabbcc</span></button>`;
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    document.querySelector("button").click();
    await new Promise((r) => setTimeout(r, 0));
    const span = document.querySelector("button .swatch-label");
    expect(span).toBeTruthy();
    expect(span.textContent).toBe("Copied!");
    await new Promise((r) => setTimeout(r, 1300));
    expect(document.querySelector("button .swatch-label").textContent).toBe("#aabbcc");
  });

  it("export code tabs switch the visible panel and retarget the copy button", () => {
    document.body.innerHTML = `<section id="export-code">
      <div role="tablist">
      <button role="tab" data-code-tab="css-code" aria-selected="true" tabindex="0">CSS</button>
      <button role="tab" data-code-tab="shader-code" aria-selected="false" tabindex="-1">ShaderToy</button>
      </div>
      <button data-copy="body{}"><span class="copy-label">Copy</span></button>
      <pre data-code-panel="css-code"><code id="css-code">body{}</code></pre>
      <pre data-code-panel="shader-code" class="hidden"><code id="shader-code">vec3 palette</code></pre>
    </section>`;
    document.querySelector('[data-code-tab="shader-code"]').click();
    expect(document.querySelector('[data-code-panel="css-code"]').classList.contains("hidden")).toBe(true);
    expect(document.querySelector('[data-code-panel="shader-code"]').classList.contains("hidden")).toBe(false);
    expect(document.querySelector('[data-code-tab="shader-code"]').getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector('[data-code-tab="css-code"]').getAttribute("aria-selected")).toBe("false");
    expect(document.querySelector("[data-copy]").getAttribute("data-copy")).toBe("vec3 palette");
    // Roving tabindex + arrow-key selection (WAI-ARIA tabs pattern).
    expect(document.querySelector('[data-code-tab="shader-code"]').getAttribute("tabindex")).toBe("0");
    expect(document.querySelector('[data-code-tab="css-code"]').getAttribute("tabindex")).toBe("-1");
    document
      .querySelector('[data-code-tab="shader-code"]')
      .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.querySelector('[data-code-tab="css-code"]').getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector('[data-code-panel="css-code"]').classList.contains("hidden")).toBe(false);
  });

  it("enhances selects into styled listbox menus that write back to the native select", async () => {
    document.body.innerHTML = `<span class="relative"><select data-enhance-select aria-label="Gradient style" class="ctrl"><option value="">Style</option><option value="radialGradient" selected>Radial Gradient</option></select><span class="native-chevron"></span></span>`;
    document.dispatchEvent(new CustomEvent("app:swap"));
    const trigger = document.querySelector('button[aria-haspopup="listbox"]');
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toContain("Radial Gradient");
    trigger.click();
    const items = document.querySelectorAll(".menu-item");
    expect(items.length).toBe(2);
    const changed = vi.fn();
    document.querySelector("select").addEventListener("change", changed);
    items[0].click();
    expect(document.querySelector("select").value).toBe("");
    expect(changed).toHaveBeenCalled();
    expect(document.querySelector(".menu-pop")).toBeNull();
  });

  it("preset chevron opens a menu that fills the number input", () => {
    document.body.innerHTML = `<span class="relative"><input name="steps" value=""><button type="button" class="preset-btn" data-presets="3,5,8"></button></span>`;
    document.dispatchEvent(new CustomEvent("app:swap"));
    document.querySelector(".preset-btn").click();
    const items = document.querySelectorAll(".menu-item");
    expect(items.length).toBe(3);
    items[1].click();
    expect(document.querySelector("input").value).toBe("5");
    // Picking the already-selected preset resets to auto.
    document.querySelector(".preset-btn").click();
    document.querySelectorAll(".menu-item")[1].click();
    expect(document.querySelector("input").value).toBe("");
  });

  it("fits swatches serpentine when wrapping to two rows", () => {
    document.body.innerHTML = `<ul class="swatches">${Array.from({ length: 10 }, (_, i) => `<li>c${i}</li>`).join("")}</ul>`;
    const ul = document.querySelector("ul.swatches");
    Object.defineProperty(ul, "clientWidth", { value: 300, configurable: true });
    window.__fitSwatches();
    // 10 chips at 300px -> 2 rows of 5; row 2 flows right-to-left.
    expect(ul.style.gridTemplateColumns).toBe("repeat(5,minmax(0,1fr))");
    expect(ul.children[4].style.gridColumnStart).toBe("5"); // row 1 end: right edge
    expect(ul.children[5].style.gridColumnStart).toBe("5"); // row 2 start: directly below it
    expect(ul.children[9].style.gridColumnStart).toBe("1"); // row 2 end: left edge
    // Wide enough for one row -> serpentine placement cleared.
    Object.defineProperty(ul, "clientWidth", { value: 2000, configurable: true });
    window.__fitSwatches();
    expect(ul.children[5].style.gridColumnStart).toBe("");
  });

  it("delegates #opts changes to the island params handler, stripping input masks", () => {
    document.body.innerHTML = `<form id="opts"><select name="style"><option value="radialGradient" selected>R</option></select><input name="steps" value="5"><input name="angle" data-suffix="°" value="45°"></form>`;
    const handler = vi.fn();
    window.__paramsHandler = handler;
    document.querySelector("select").dispatchEvent(new Event("change", { bubbles: true }));
    expect(handler).toHaveBeenCalledWith({ style: "radialGradient", steps: "5", angle: "45" });
    expect(fetchMock).not.toHaveBeenCalled();
    delete window.__paramsHandler;
  });

  it("reconciles edge-cached list counts from the write-fresh count endpoint", async () => {
    const keyA = "_gEngEngEngFigFRgFMgJjgJMgJUhNtgckg6x";
    const keyB = "_gJDgH1gIagIjgL4gJtgDZgFrgDFgAAgguhBd";
    document.body.innerHTML =
      `<button data-like-seed="${keyA}" data-count="41"><span class="like-count">41</span></button>` +
      `<button data-like-seed="${keyB}" data-count="9"><span class="like-count">9</span></button>`;
    const previousFetch = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (href) => {
      const url = String(href);
      if (url.includes("/api/like-counts"))
        return {
          ok: true,
          json: async () => ({ counts: { [keyA]: 42, [keyB]: 0 } }),
        };
      if (url.includes("/api/auth/get-session"))
        return { ok: true, json: async () => null };
      return { ok: true, json: async () => ({}) };
    });

    document.dispatchEvent(new CustomEvent("app:swap"));
    await new Promise((r) => setTimeout(r, 0));

    const first = document.querySelector(`[data-like-seed="${keyA}"]`);
    const second = document.querySelector(`[data-like-seed="${keyB}"]`);
    expect(first.dataset.count).toBe("42");
    expect(first.querySelector(".like-count").textContent).toBe("42");
    expect(second.dataset.count).toBe("0");
    expect(second.querySelector(".like-count").classList.contains("opacity-0")).toBe(true);

    fetchMock.mockImplementation(previousFetch);
    fetchMock.mockClear();
  });

  it("arrow-key hold spins the value per press, previews live, and commits one change after release", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<form id="opts"><input name="angle" data-step-keys data-wrap data-suffix="°" data-min="0" data-max="359" value=""></form>`;
    const input = document.querySelector("input");
    const changed = vi.fn();
    const preview = vi.fn();
    window.__previewHandler = preview;
    input.addEventListener("change", changed);
    input.focus();
    for (let i = 0; i < 5; i++)
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
      );
    // Empty starts at min (0), then +1 per repeat — masked with the degree unit.
    expect(input.value).toBe("4°");
    // Each press previews the raw (unmasked) value on the palettes.
    expect(preview).toHaveBeenLastCalledWith({ angle: "4" });
    expect(changed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(changed).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    delete window.__previewHandler;
  });

  it("subheader reset clears every option to auto and hides itself", () => {
    document.body.innerHTML = `<form id="opts"><input name="angle" data-suffix="°" value="45°"><input name="steps" value="5"><select name="style"><option value=""></option><option value="radialGradient" selected>R</option></select></form><button id="opts-reset">r</button>`;
    const handler = vi.fn();
    window.__paramsHandler = handler;
    document.getElementById("opts-reset").click();
    expect(document.querySelector('input[name="angle"]').value).toBe("");
    expect(document.querySelector('input[name="steps"]').value).toBe("");
    expect(document.querySelector("select").value).toBe("");
    expect(handler).toHaveBeenLastCalledWith({ angle: "", steps: "", style: "" });
    expect(document.getElementById("opts-reset").classList.contains("hidden")).toBe(true);
    delete window.__paramsHandler;
  });

  it("shows a delayed tooltip for data-tip elements and hides on pointerout", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<button data-tip="Toggle theme">x</button>`;
    const btn = document.querySelector("button");
    btn.dispatchEvent(new Event("pointerover", { bubbles: true }));
    expect(document.querySelector(".ui-tip[data-open]")).toBeNull();
    vi.advanceTimersByTime(700);
    const tip = document.querySelector(".ui-tip[data-open]");
    expect(tip).toBeTruthy();
    expect(tip.textContent).toBe("Toggle theme");
    expect(btn.getAttribute("aria-describedby")).toBe("ui-tip");
    btn.dispatchEvent(new Event("pointerout", { bubbles: true }));
    expect(document.querySelector(".ui-tip[data-open]")).toBeNull();
    expect(btn.getAttribute("aria-describedby")).toBeNull();
    vi.useRealTimers();
  });

  it("tooltip survives a body swap (client-side nav replaces body children)", () => {
    vi.useFakeTimers();
    // First page: open a tooltip so the singleton exists.
    document.body.innerHTML = `<button data-tip="One">x</button>`;
    document.querySelector("button").dispatchEvent(new Event("pointerover", { bubbles: true }));
    vi.advanceTimersByTime(700);
    expect(document.querySelector(".ui-tip[data-open]")).toBeTruthy();
    // Simulate swap(): body children replaced wholesale, orphaning #ui-tip.
    document.body.innerHTML = `<button data-tip="Two">y</button>`;
    document.querySelector("button").dispatchEvent(new Event("pointerover", { bubbles: true }));
    vi.advanceTimersByTime(700);
    const tip = document.querySelector(".ui-tip[data-open]");
    expect(tip).toBeTruthy();
    expect(tip.textContent).toBe("Two");
    document.querySelector("button").dispatchEvent(new Event("pointerout", { bubbles: true }));
    vi.useRealTimers();
  });

  it("tapping the gradient toggles the floating controls (canvas mode)", () => {
    document.body.innerHTML = `<div id="seed-hero" class="seed-hero"><div id="preview-box"><section id="edit-preview"></section></div><div id="mobile-dock"></div></div>`;
    const hero = document.getElementById("seed-hero");
    const gradient = document.getElementById("edit-preview");
    gradient.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    expect(hero.classList.contains("ui-show")).toBe(true);
    gradient.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    expect(hero.classList.contains("ui-show")).toBe(false);
    // Mouse hover over the gradient reveals; over the sliders sheet hides.
    gradient.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }));
    expect(hero.classList.contains("ui-show")).toBe(true);
  });

  it("touch taps toggle one palette card's actions without activating its controls", () => {
    document.body.innerHTML = `<div data-palette-card id="one"><div class="card"></div><a data-palette-card-action href="/edit">edit</a></div>
      <div data-palette-card id="two"><div class="card"></div><button data-palette-card-action>copy</button></div>`;
    const one = document.getElementById("one");
    const two = document.getElementById("two");
    const surface = one.querySelector(".card");
    surface.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    expect(one.classList.contains("actions-open")).toBe(true);
    one.querySelector("a").focus();
    surface.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    expect(one.classList.contains("actions-open")).toBe(false);
    expect(one.contains(document.activeElement)).toBe(false);
    surface.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    one.querySelector("a").dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }),
    );
    expect(one.classList.contains("actions-open")).toBe(true);
    two.querySelector(".card").dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }),
    );
    expect(one.classList.contains("actions-open")).toBe(false);
    expect(two.classList.contains("actions-open")).toBe(true);
  });

  it("hovering the fused swatch strip drives the graph legend (canvas mode)", () => {
    document.body.innerHTML = `<div id="seed-hero" class="seed-hero show-graph">
      <section id="graph-panel"><figure data-samples='[{"t":0,"hex":"#112233","rgb":[17,34,51]}]'>
        <div class="graph-plot"><div class="graph-crosshair"></div></div>
        <div class="graph-tip hidden"></div>
      </figure></section>
      <div id="swatches-strip"><ul class="swatches"><li><button data-copy="#112233">x</button></li></ul></div>
    </div>`;
    document
      .querySelector("#swatches-strip button")
      .dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(document.querySelector(".graph-tip").classList.contains("hidden")).toBe(false);
    expect(document.querySelector(".graph-tip").textContent).toContain("#112233");
  });

  it("clicking the graph copies the hex at that index and confirms in the legend", async () => {
    document.body.innerHTML = `<figure data-samples='[{"t":0,"hex":"#112233","rgb":[17,34,51]},{"t":1,"hex":"#445566","rgb":[68,85,102]}]'><div class="graph-plot"></div><div class="graph-tip hidden"></div></figure>`;
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    document.querySelector(".graph-plot").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(writeText).toHaveBeenCalledWith("#112233");
    const tip = document.querySelector(".graph-tip");
    expect(tip.classList.contains("hidden")).toBe(false);
    expect(tip.textContent).toContain("Copied!");
  });

  it("lets a mounted island intercept popstate (seed-route undo/redo)", () => {
    fetchMock.mockClear();
    window.__popstateHandler = vi.fn(() => true);
    dispatchEvent(new PopStateEvent("popstate"));
    expect(window.__popstateHandler).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    delete window.__popstateHandler;
  });

  it("hovering a menu item previews it; closing without picking clears the preview", () => {
    document.body.innerHTML = `<form id="opts"><input name="steps" value=""><span class="relative"><input name="angle" data-suffix="°" value="45°"><button type="button" class="preset-btn" data-presets="45,90" data-preset-suffix="°"></button></span></form>`;
    const preview = vi.fn();
    window.__previewHandler = preview;
    document.dispatchEvent(new CustomEvent("app:swap"));
    document.querySelector(".preset-btn").click();
    const items = document.querySelectorAll(".menu-item");
    items[1].dispatchEvent(new Event("mouseenter"));
    expect(preview).toHaveBeenLastCalledWith({ steps: "", angle: "90" });
    items[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(preview).toHaveBeenLastCalledWith(null);
    delete window.__previewHandler;
  });

  it("masks data-suffix inputs so typed digits keep the unit", () => {
    document.body.innerHTML = `<input data-suffix="°" value="">`;
    const el = document.querySelector("input");
    el.value = "45";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    expect(el.value).toBe("45°");
    el.value = "4a5°x";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    expect(el.value).toBe("45°");
  });
});
