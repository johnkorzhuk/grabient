import { afterEach, beforeEach, expect, test, vi } from "vitest";

// the browser's paths: Node resolves Solid's server build, where isServer is true
vi.mock("@solidjs/web", async original => ({
  ...(await original<typeof import("@solidjs/web")>()),
  isServer: false
}));

const { keepOrder, keptOrder } = await import("./order.ts");

/* The sheet's order is the record the lists keep for the tab, `{ order, frame }` under one key: what a list wrote is
   what the sheet reads, and what the sheet writes is what a list reads. */
const KEY = "grabient-order";
let held: Map<string, string>;
beforeEach(() => {
  held = new Map();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value)
  });
});
afterEach(() => vi.unstubAllGlobals());

test("a tab that kept nothing reads the most liked first, and Rising by the week", () => {
  expect(keptOrder()).toEqual({ sort: "popular", frame: "1w" });
});

test("the order a list was read in is the sheet's", () => {
  held.set(KEY, JSON.stringify({ order: "rising", frame: "3m" }));
  expect(keptOrder()).toEqual({ sort: "rising", frame: "3m" });
});

test("Saved is no order of the sheet's: it reads Popular and keeps the frame Rising was read in", () => {
  held.set(KEY, JSON.stringify({ order: "saved", frame: "1y" }));
  expect(keptOrder()).toEqual({ sort: "popular", frame: "1y" });
});

test("a record that is no record reads as nothing kept", () => {
  for (const kept of [
    "{",
    "null",
    "7",
    '{"order":"newest","frame":"2w"}',
    '{"order":["rising"]}'
  ]) {
    held.set(KEY, kept);
    expect(keptOrder()).toEqual({ sort: "popular", frame: "1w" });
  }
});

test("a press writes the record as a list reads it", () => {
  keepOrder({ sort: "rising", frame: "1y" });
  expect(JSON.parse(held.get(KEY) ?? "")).toEqual({ order: "rising", frame: "1y" });
  expect(keptOrder()).toEqual({ sort: "rising", frame: "1y" });
  keepOrder({ sort: "popular", frame: "1y" });
  expect(JSON.parse(held.get(KEY) ?? "")).toEqual({ order: "popular", frame: "1y" });
});

test("a browser that keeps nothing for the site still orders the sheet", () => {
  vi.stubGlobal("sessionStorage", {
    getItem: () => {
      throw new Error("refused");
    },
    setItem: () => {
      throw new Error("refused");
    }
  });
  expect(keptOrder()).toEqual({ sort: "popular", frame: "1w" });
  expect(() => keepOrder({ sort: "rising", frame: "1w" })).not.toThrow();
});
