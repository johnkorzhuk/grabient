import { afterEach, beforeEach, expect, test } from "vitest";
import { EFFECT_KEY } from "./effect-page.ts";
import { createEffects } from "./effects.ts";
import { stillWanted } from "./glass-draw.ts";

const SEED = "kWTATrcQ7MeMxv1MwbbLKq84";
const store = new Map<string, string>();
const root = { dataset: {} as DOMStringMap };
const kept = () => JSON.parse(store.get(EFFECT_KEY) ?? "null");

beforeEach(() => {
  store.clear();
  root.dataset = {};
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v)
    },
    document: { documentElement: root }
  });
});
afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "document");
});

test("a choice marks the page and is kept at once, not one change late", () => {
  const fx = createEffects(null, true, () => SEED);
  fx.choose("glass");
  expect(root.dataset.glass).toBeUndefined();
  expect(kept().kind).toBe("glass");
  fx.choose("blob");
  expect(root.dataset.glass).toBe("off");
  expect(kept().kind).toBe("blob");
  expect(kept().settings.blob.look.shape).toEqual(expect.any(Number));
  fx.set("blob", { speed: 2 });
  expect(kept().settings.blob.speed).toBe(2);
  fx.look("blob", { frost: 0.5, bg: "#10101480" });
  expect(kept().settings.blob.look).toMatchObject({ frost: 0.5, bg: "#10101480" });
  // the glass keeps a shape of its own, which the blob's leaves as it is
  fx.look("glass", { shape: 12 });
  expect(kept().settings.glass.look.shape).toBe(12);
  expect(kept().settings.blob.look.shape).not.toBe(12);
  fx.choose(null);
  expect(root.dataset.glass).toBe("off");
  expect(kept().kind).toBeNull();
});

test("an editor a navigation opens marks its own effect over the mark the page before left", () => {
  const look = { shape: null, frost: 1, bg: null, steps: null };
  // a page whose address named no style hid the glass for a reader who chose the gradient
  root.dataset.glass = "off";
  createEffects({ kind: "glass", speed: 1, fps: 60, look }, true, () => SEED);
  expect(root.dataset.glass).toBeUndefined();
  createEffects({ kind: "blob", speed: 1, fps: 60, look }, true, () => SEED);
  expect(root.dataset.glass).toBe("off");
  // an address that names no style opens on the reader's choice, the glass until another is kept
  createEffects(null, false, () => SEED);
  expect(root.dataset.glass).toBeUndefined();
  // a figure's palette plays none and leaves the page's mark as it is
  root.dataset.glass = "off";
  createEffects({ kind: "glass", speed: 1, fps: 60, look }, true, () => SEED, true);
  expect(root.dataset.glass).toBe("off");
  expect(kept()).toBeNull();
});

test("a navigation asks the address it goes to whether its editor draws the glass's still", () => {
  let booting = false;
  Object.assign(root, { hasAttribute: () => booting });
  expect(stillWanted("?style=glass&angle=135")).toBe(true);
  expect(stillWanted("?style=blob")).toBe(false);
  expect(stillWanted("?style=linearGradient&steps=5")).toBe(false);
  // no style: the reader's choice, the glass until another is kept, and a kind this build doesn't know plays the glass
  expect(stillWanted("")).toBe(true);
  for (const [kind, glass] of [
    ["glass", true],
    ["silk", false],
    [null, false],
    ["tinsel", true]
  ] as const) {
    store.set(EFFECT_KEY, JSON.stringify({ kind, settings: {} }));
    expect(stillWanted("?steps=7"), String(kind)).toBe(glass);
  }
  store.set(EFFECT_KEY, "{not json");
  expect(stillWanted("")).toBe(true);
  // the page's first screen still shows the server's still
  booting = true;
  expect(stillWanted("?style=glass")).toBe(false);
});

test("an address that lands shows its effect and leaves the reader's own choice as kept", () => {
  const fx = createEffects(null, true, () => SEED);
  fx.choose("blob");
  fx.arrive({ kind: "glass", speed: 1, fps: 60, look: kept().settings.blob.look }, true);
  expect(root.dataset.glass).toBeUndefined();
  expect(kept().kind).toBe("blob");
  expect(fx.changed()).toBe(false);
});

test("Reset gives back the effect the page opened with, marked and kept", () => {
  const fx = createEffects(
    {
      kind: "glass",
      speed: 1,
      fps: 60,
      look: { frost: 1, shape: null, bg: null, steps: null }
    },
    true,
    () => SEED
  );
  fx.choose("blob");
  fx.reset();
  expect(root.dataset.glass).toBeUndefined();
  expect(kept().kind).toBe("glass");
});

test("a figure's palette plays none, and neither marks the page nor keeps anything", () => {
  const fx = createEffects(null, false, () => SEED, true);
  fx.arrive(null, false);
  expect(root.dataset.glass).toBeUndefined();
  expect(store.size).toBe(0);
});

test("a new shape is never the one shown, never the glass as designed, and at most 999", () => {
  const fx = createEffects(null, true, () => SEED);
  for (let i = 0; i < 20; i++) {
    const was = fx.settings("glass").look.shape;
    fx.shuffle("glass");
    const now = fx.settings("glass").look.shape;
    expect(now).not.toBe(was);
    expect(now).not.toBe(0);
    expect(now).not.toBeNull();
    expect(now).toBeLessThanOrEqual(999);
  }
  fx.choose("blob");
  const blob = fx.settings("blob").look.shape;
  fx.shuffle("blob");
  expect(fx.settings("blob").look.shape).not.toBe(blob);
  expect(fx.settings("blob").look.shape).toBeLessThanOrEqual(999);
});

test("frames a second are 60 unless set, and keep within 1 to 120", () => {
  const fx = createEffects(null, true, () => SEED);
  expect(fx.settings("glass").fps).toBe(60);
  fx.set("glass", { fps: 500 });
  expect(fx.settings("glass").fps).toBe(120);
  fx.set("glass", { fps: 24 });
  expect(kept().settings.glass.fps).toBe(24);
});

test("the reader's choices are told for the lists, an address landing and Reset are not", () => {
  const told: unknown[] = [];
  const fx = createEffects(
    null,
    true,
    () => SEED,
    false,
    effect => told.push(effect?.kind ?? null)
  );
  fx.choose("glass");
  fx.set("glass", { speed: 0.5 });
  fx.arrive(
    { kind: "blob", speed: 1, fps: 60, look: { shape: 3, frost: 1, bg: null, steps: null } },
    true
  );
  fx.reset();
  fx.choose(null);
  expect(told).toEqual(["glass", "glass", null]);
});
