import { createRoot, flush } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AS_SAVED, recallView, rememberedView, rememberView } from "../list/appearance.ts";
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
  rememberView({ ...AS_SAVED });
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
  rememberView({ ...AS_SAVED });
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

test("the aurora stands at 90 while no angle is set, whatever the page's own, which a gradient shown after it has again", () => {
  /* John, 11 Nov 2026, of the aurora lying on its side at a palette's own angle: "make auto 90 deg for this one" */
  opened("angle=45", e => {
    expect([e.angle(), e.opened().set.angle]).toEqual([45, false]);
    e.effects.choose("aurora");
    flush();
    /* the page plays it upright, and so its address, its files and its saves take it; the menu's Angle reads Auto */
    expect([e.angle(), e.opened().set.angle]).toEqual([90, false]);
    /* a tile or a layer of a kind is drawn at that kind's: the gradient's and every other effect's the page's own */
    expect([e.angleIn("aurora"), e.angleIn("silk"), e.angleIn(null)]).toEqual([90, 45, 45]);
    /* a gradient, or an effect its angle turns, has the page's own again */
    e.effects.choose("silk");
    flush();
    expect(e.angle()).toBe(45);
    e.effects.choose(null);
    flush();
    expect(e.angle()).toBe(45);
    /* an angle the reader sets turns the aurora as any other, and Auto stands it up again */
    e.effects.choose("aurora");
    e.setAngle(30);
    flush();
    expect([e.angle(), e.angleIn("aurora"), e.opened().set.angle]).toEqual([30, 30, true]);
    e.letViewGo("angle");
    flush();
    expect([e.angle(), e.angleIn(null), e.opened().set.angle]).toEqual([90, 45, false]);
  });
});

test("an aurora's page opens at Auto where its address names no angle, and at the reader's where it names one", () => {
  opened("style=aurora", e => {
    expect([e.angle(), e.opened().set.angle]).toEqual([90, false]);
  });
  /* an angle in its address is one a reader set: the aurora's own is 90, which an address leaves out */
  opened("style=aurora&angle=45", e => {
    expect([e.angle(), e.opened().set.angle]).toEqual([45, true]);
    e.letViewGo("angle");
    flush();
    expect([e.angle(), e.opened().set.angle]).toEqual([90, false]);
  });
  /* another effect's page at an angle is at Auto there, as it was */
  opened("style=silk&angle=45", e => {
    expect([e.angle(), e.opened().set.angle]).toEqual([45, false]);
  });
});

test("an aurora's page that opened from a palette's own angle keeps it for the gradient", () => {
  /* its entry's record, as a card hands it or a reload finds it: the page's own angle 45, none set */
  createRoot(dispose => {
    const page = readSeedPage(SEED, new URLSearchParams("style=aurora"))!;
    const e = createPaletteEditor(page, {
      opened: {
        style: "linearGradient",
        steps: 7,
        angle: 45,
        set: { style: true, steps: false, angle: false }
      }
    });
    flush();
    expect([e.angle(), e.opened().set.angle]).toEqual([90, false]);
    e.effects.choose(null);
    flush();
    expect(e.angle()).toBe(45);
    dispose();
  });
});
