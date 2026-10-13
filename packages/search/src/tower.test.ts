import { canonical, decodePalette, encodePalette } from "@grabient/engine";
import { anchorsFromHexes } from "@grabient/engine/spec.ts";
import { describe, expect, test } from "vitest";
import { fixture, searchFile, searchJson, type VocabFile } from "../test/files.ts";
import { FEATURES } from "./features.ts";
import { loadTower, textSide } from "./tower.ts";
import { paletteVector, seedVector } from "./vectors.ts";

interface ModelCheck {
  version: string;
  palettes: { colors: string[]; vector: number[] }[];
  phrases: { phrase: string; index: number; embedding: number[]; vector: number[] }[];
}

const check = fixture<ModelCheck>("model-check.json");
const model = loadTower(searchFile("tower.bin"));
const fallback = loadTower(searchFile("tower-fallback.bin"));
const vocab = searchJson<VocabFile>("vocab.json");
const vocabBytes = searchFile("vocab.bin");
const vectors = new Float32Array(
  vocabBytes.buffer,
  vocabBytes.byteOffset,
  vocabBytes.byteLength / 4
);
const worst = (a: ArrayLike<number>, b: readonly number[]) =>
  Array.from(a).reduce((most, v, i) => Math.max(most, Math.abs(v - b[i])), 0);

describe("the model files", () => {
  test("agree on the version and the shapes", () => {
    expect([model.version, fallback.version, vocab.version]).toEqual([
      check.version,
      check.version,
      check.version
    ]);
    expect([model.din, model.d, vocab.d]).toEqual([FEATURES, 64, 64]);
    expect(model.embedder).toBe("@cf/google/embeddinggemma-300m");
    expect(fallback.embedder).toBe("@cf/baai/bge-m3");
    expect(vectors.length).toBe(vocab.phrases.length * vocab.d);
  });

  test("the fallback shares the palette side, so switching embedders needs no new vectors", () => {
    expect(fallback.W0).toEqual(model.W0);
    expect(fallback.W1).toEqual(model.W1);
  });
});

describe("the arithmetic lands within 2e-5 of the training code", () => {
  test("palette side", () => {
    for (const p of check.palettes) {
      // the training held each keyframe a hair off its hex color, on the seed's grid
      const made = anchorsFromHexes(p.colors)!;
      const palette = canonical({ anchors: made.anchors.map(a => ({ ...a, l: a.l + 1e-6 })) });
      const got = paletteVector(model, palette).values;
      expect(worst(got, p.vector)).toBeLessThan(2e-5);
      expect(Math.abs(Math.hypot(...got) - 1)).toBeLessThan(1e-5);
    }
  });

  test("text side and vocab.bin", () => {
    for (const p of check.phrases) {
      expect(worst(textSide(model, p.embedding), p.vector)).toBeLessThan(2e-5);
      expect(worst(vectors.subarray(p.index * 64, (p.index + 1) * 64), p.vector)).toBeLessThan(
        2e-5
      );
      expect(vocab.phrases[p.index]).toBe(p.phrase);
    }
  });
});

test("a palette's vector is a function of its seed alone", () => {
  const seed = "kY4mpDazO-mUuu_fuLqXU49dvVP6";
  expect(seedVector(model, encodePalette(decodePalette(seed)!))).toEqual(seedVector(model, seed));
  expect(seedVector(model, "not-a-seed")).toBeNull();
});

test("a model file of the wrong size is refused", () => {
  const bytes = searchFile("tower.bin");
  expect(() => loadTower(bytes.subarray(0, bytes.length - 4))).toThrow("wrong size");
  expect(() => loadTower(new Uint8Array([1, 2, 3]))).toThrow("Not a search model file");
});
