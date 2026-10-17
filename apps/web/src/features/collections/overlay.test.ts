import { afterEach, describe, expect, test, vi } from "vitest";
import {
  collectionGone,
  forgetCollection,
  forgetPalette,
  paletteGone,
  recallCollection
} from "./overlay.ts";

/* What this tab deleted, which its pages leave out while an answer kept from before may still hold it. */

afterEach(() => {
  vi.useRealTimers();
});

describe("what this tab deleted", () => {
  test("is gone for ten minutes, as long as an answer kept from before may hold it", () => {
    vi.useFakeTimers();
    expect(paletteGone("kSyQDAzZa8zgZxS")).toBe(false);
    forgetPalette("kSyQDAzZa8zgZxS");
    forgetCollection("ocean-depths");
    expect(paletteGone("kSyQDAzZa8zgZxS")).toBe(true);
    expect(collectionGone("ocean-depths")).toBe(true);
    expect(collectionGone("ocean")).toBe(false);
    // the edge's five minutes on top of a data center's copy of up to five
    vi.advanceTimersByTime(599_000);
    expect(collectionGone("ocean-depths")).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(paletteGone("kSyQDAzZa8zgZxS")).toBe(false);
    expect(collectionGone("ocean-depths")).toBe(false);
  });
  test("is there again once a collection is made at its address", () => {
    forgetCollection("@ada/blues");
    forgetCollection("@ada/greens");
    recallCollection("@ada/reds");
    expect(collectionGone("@ada/blues")).toBe(true);
    recallCollection("@ada/blues");
    expect(collectionGone("@ada/blues")).toBe(false);
    expect(collectionGone("@ada/greens")).toBe(true);
  });
});
