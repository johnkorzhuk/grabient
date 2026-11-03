import { EFFECT_LOOK, type Effect } from "@grabient/engine/effect.ts";
import { expect, test } from "vitest";
import { standsBare } from "./card-effect.tsx";

const blob = (bg: string | null): Effect => ({
  kind: "blob",
  look: { ...EFFECT_LOOK, bg },
  speed: 1,
  fps: 60
});

test("a card's blob stands bare where its ground is none or lets the page through, as its files and the stage do", () => {
  expect(standsBare(blob(null))).toBe(true);
  expect(standsBare(blob("#f0e6d240"))).toBe(true);
  expect(standsBare(blob("#f0e6d2"))).toBe(false);
  expect(standsBare(blob("#f0e6d2ff"))).toBe(false);
  expect(standsBare({ ...blob(null), kind: "glass" })).toBe(false);
  expect(standsBare(null)).toBe(false);
});
