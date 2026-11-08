import { encodePalette } from "@grabient/engine/codec.ts";
import { blobShapeOf, EFFECT_LOOK, EFFECT_PLAY } from "@grabient/engine/effect.ts";
import { expect, test } from "vitest";
import { undo } from "../../app/undo.ts";
import {
  addAll,
  clearSelection,
  heldEffect,
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

test("a palette keeps its soft and grain and the effect it played, held still: its look, never how it plays", () => {
  const seed = seedOf(2);
  const view = { seed, style: "radialSwatches" as const, steps: 6, angle: 30 };
  // the soft and the grain are part of what the selection holds, and of its id
  expect(selectedPalette({ ...view, soft: 20, grain: 64 })).toEqual({
    id: `${seed}:radialSwatches:6:30:20:64`,
    ...view,
    soft: 20,
    grain: 64
  });
  // an effect is held as designed in its motion, its look kept; its id is its still's address
  const glass = {
    kind: "glass" as const,
    speed: 2.5,
    fps: 120,
    look: { ...EFFECT_LOOK, shape: 7 }
  };
  const held = selectedPalette({ ...view, grain: 64, effect: glass });
  expect(held?.effect).toEqual({
    kind: "glass",
    ...EFFECT_PLAY,
    look: { ...EFFECT_LOOK, shape: 7 }
  });
  expect(held?.id).toBe(`${seed}?style=glass&angle=30&grain=64&shape=7`);
  // the same palette at another pace is the same still, so one palette of the selection
  expect(selectedPalette({ ...view, grain: 64, effect: { ...glass, speed: 0 } })?.id).toBe(
    held?.id
  );
  // the blob takes no angle and no steps, and one with no shape of its own takes its palette's
  const blob = selectedPalette({
    ...view,
    effect: { kind: "blob", ...EFFECT_PLAY, look: { shape: null, frost: 1.5, bg: "#102030" } }
  });
  expect(blob?.effect?.look).toEqual({
    shape: blobShapeOf(seed),
    frost: 1.5,
    bg: "#102030",
    steps: null
  });
  // the sandstone's steps draw its picture: a palette at 12 steps is a palette apart from one at its designed 28
  const strata = (steps: number | null) =>
    selectedPalette({
      ...view,
      effect: { kind: "strata", ...EFFECT_PLAY, look: { shape: null, frost: 1, bg: null, steps } }
    });
  expect(strata(12)?.effect?.look.steps).toBe(12);
  expect(strata(12)?.id).toBe(`${seed}?style=strata&angle=30&steps=12`);
  expect(strata(28)?.id).toBe(strata(null)?.id);
  expect(strata(99)?.effect?.look.steps).toBe(40);
  expect(
    selectedPalette({
      ...view,
      effect: { kind: "zen", ...EFFECT_PLAY, look: { shape: null, frost: 1, bg: null, steps: 12 } }
    })?.effect?.look.steps
  ).toBeNull();
  expect(blob?.id).toBe(`${seed}?style=blob&frost=1.5&shape=${blobShapeOf(seed)}&bg=%23102030`);
  // nor a soft: a blob chosen with one is held with its grain alone, the same palette as with none
  const softBlob = selectedPalette({
    ...view,
    soft: 20,
    grain: 64,
    effect: { kind: "blob", ...EFFECT_PLAY, look: { shape: 3, frost: 1, bg: null } }
  });
  expect(softBlob?.soft).toBeUndefined();
  expect(softBlob?.grain).toBe(64);
  expect(softBlob?.id).toBe(`${seed}?style=blob&grain=64&shape=3`);
  // the strings' ground draws their picture: a palette on a light ground is a palette apart from one on their own
  const strings = (bg: string | null) =>
    selectedPalette({
      ...view,
      effect: { kind: "strings", ...EFFECT_PLAY, look: { shape: null, frost: 1, bg, steps: null } }
    });
  expect(strings("#f4efe6")?.effect?.look.bg).toBe("#f4efe6");
  expect(strings("#f4efe6")?.id).toBe(`${seed}?style=strings&angle=30&bg=%23f4efe6`);
  expect(strings("#00000000")?.effect?.look.bg).toBe("#00000000");
  expect(strings(null)?.id).toBe(`${seed}?style=strings&angle=30`);
  expect(
    selectedPalette({
      ...view,
      effect: {
        kind: "silk",
        ...EFFECT_PLAY,
        look: { shape: null, frost: 1, bg: "#f4efe6", steps: null }
      }
    })?.effect?.look.bg
  ).toBeNull();
  // what is no effect is none
  expect(heldEffect(seed, { kind: "mesh" })).toBeNull();
  expect(heldEffect(seed, "glass")).toBeNull();
  expect(selectedPalette({ ...view, effect: null })).toEqual({
    id: `${seed}:radialSwatches:6:30`,
    ...view
  });
});

test("the same palette as a gradient, grained and playing an effect is three palettes of the selection", () => {
  clearSelection();
  const plain = drawn(3);
  const grained = { ...plain, grain: 40 };
  const silk = { ...plain, effect: { kind: "silk" as const, ...EFFECT_PLAY, look: EFFECT_LOOK } };
  expect(addAll([plain, grained, silk])).toEqual({ added: 3, dropped: 0 });
  expect(selected(plain) && selected(grained) && selected(silk)).toBe(true);
  expect(
    selected({ ...silk, effect: { ...silk.effect, look: { ...EFFECT_LOOK, shape: 3 } } })
  ).toBe(false);
  // kept as the browser keeps it, each is read back in its look
  const kept = readSelection(JSON.stringify({ version: 1, items: selection() }));
  expect(kept.map(item => item.id)).toEqual(selection().map(item => item.id));
  expect(kept[2].effect?.kind).toBe("silk");
  expect(toggle(silk)).toBe("removed");
  expect(selected(plain) && selected(grained)).toBe(true);
});
