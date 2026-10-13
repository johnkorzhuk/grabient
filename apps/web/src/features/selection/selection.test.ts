import { encodePalette } from "@grabient/engine/codec.ts";
import { expect, test } from "vitest";
import { undo } from "../../app/undo.ts";
import {
  addAll,
  clearSelection,
  readSelection,
  SELECTION_MAX,
  selected,
  selectedPalette,
  selection,
  toggle
} from "./selection.ts";

const seedOf = (i: number) =>
  encodePalette({
    anchors: [
      { l: 0.2 + (i % 50) / 100, c: 0.1, h: i },
      { l: 0.8, c: 0.05, h: i + 40 }
    ]
  });
const drawn = (i: number) => ({
  seed: seedOf(i),
  style: "linearGradient" as const,
  steps: 7,
  angle: 90
});
const settled = () => new Promise(resolve => setTimeout(resolve));

test("a palette is held canonical, in its view, never with fewer steps than keyframes", () => {
  const seed = seedOf(1);
  expect(selectedPalette({ seed, style: "radialSwatches", steps: 1, angle: 45 })).toEqual({
    id: `${seed}:radialSwatches:3:45`,
    seed,
    style: "radialSwatches",
    steps: 3,
    angle: 45
  });
  expect(selectedPalette({ seed: "nope" })).toBeNull();
  expect(selectedPalette(null)).toBeNull();
});

test("a kept selection is read with repeats and anything past its room left out", () => {
  const items = [
    drawn(1),
    drawn(1),
    { seed: "nope" },
    ...Array.from({ length: 120 }, (_, i) => drawn(i + 2))
  ];
  const read = readSelection(JSON.stringify({ version: 1, items }));
  expect(read).toHaveLength(SELECTION_MAX - 2);
  expect(read[0].seed).toBe(seedOf(1));
  expect(readSelection(JSON.stringify({ version: 2, items }))).toEqual([]);
  expect(readSelection("{")).toEqual([]);
});

test("a full selection makes room by letting its oldest go, and one undo puts them back", async () => {
  clearSelection();
  expect(addAll(Array.from({ length: SELECTION_MAX }, (_, i) => drawn(i)))).toEqual({
    added: SELECTION_MAX,
    dropped: 0
  });
  expect(toggle(drawn(500))).toBe("made room");
  expect(selection()).toHaveLength(SELECTION_MAX);
  expect(selected(drawn(0))).toBe(false);
  expect(selected(seedOf(500))).toBe(true);
  await settled();
  await undo();
  expect(selected(drawn(0))).toBe(true);
  expect(selected(drawn(500))).toBe(false);
  expect(toggle(drawn(0))).toBe("removed");
  expect(toggle({ seed: "nope", style: "linearGradient", steps: 7, angle: 90 })).toBe("invalid");
});
