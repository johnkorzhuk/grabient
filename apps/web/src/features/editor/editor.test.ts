import { createRoot, flush } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { recallView, rememberedView, rememberView } from "../list/appearance.ts";
import { readSeedPage } from "./address.ts";
import { createPaletteEditor } from "./editor.ts";

// the browser's paths: Node resolves Solid's server build, where isServer is true
vi.mock("@solidjs/web", async original => ({
  ...(await original<typeof import("@solidjs/web")>()),
  isServer: false
}));

const SEED = "kWTATrcQ7MeMxv1MwbbLKq84";
const storage = () => {
  const kept = new Map<string, string>();
  return {
    getItem: (k: string) => kept.get(k) ?? null,
    setItem: (k: string, v: string) => void kept.set(k, v)
  };
};

beforeEach(() => {
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  vi.stubGlobal("addEventListener", () => {});
  vi.stubGlobal("removeEventListener", () => {});
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {}
  }));
  // the tab's memory is read once its first page is live
  recallView();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** A palette's page as an address opens it, its editor and what the tab remembers once each change has settled. */
function opened(query: string, run: (e: ReturnType<typeof createPaletteEditor>) => void) {
  createRoot(dispose => {
    run(createPaletteEditor(readSeedPage(SEED, new URLSearchParams(query))!));
    flush();
    dispose();
  });
  return rememberedView();
}

test("Reset gives the lists back the effect the tab had as the page opened", () => {
  rememberView({ style: "auto", steps: "auto", angle: "auto", size: null, effect: null });
  flush();
  const tab = opened("style=glass", e => {
    e.effects.choose("blob");
    flush();
    expect(rememberedView().effect?.kind).toBe("blob");
    e.letViewGo();
  });
  expect(tab.effect).toBeNull();
});

test("a gradient chosen in the editor leaves the lists' effect, the style let go with it", () => {
  rememberView({ style: "auto", steps: "auto", angle: "auto", size: null, effect: null });
  flush();
  const tab = opened("style=glass", e => {
    e.effects.choose("glass");
    flush();
    expect(rememberedView().effect?.kind).toBe("glass");
    // As saved in the editor's menu: the effect goes and the style is let go, in one press
    e.effects.choose(null);
    e.letViewGo("style");
  });
  expect(tab.effect).toBeNull();
  expect(tab.style).toBe("auto");
});
