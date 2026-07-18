import { describe, it, expect } from "vitest";
import {
  applyBandingFloor,
  canonicalize,
  featureVector,
  minGradientSteps,
  reversedFeatureVector,
  toCosineCoeffs,
  toFlat12,
  FEATURE_DIMENSIONS,
} from "../src/lib/features";
import { deserializeCoeffs } from "@repo/data-ops/serialization";
import { PALETTE_STYLES } from "@repo/data-ops/valibot-schema/grabient";
import { splitFor } from "../src/lib/exporter";

const SAMPLE = [0.5, 0.5, 0.5, 0.3, 0.25, 0.2, 1.0, 0.9, 0.8, 0.0, 0.15, 0.3];

describe("coeffs conversion", () => {
  it("round-trips 12 floats through CosineCoeffs", () => {
    expect(toFlat12(toCosineCoeffs(SAMPLE))).toEqual(SAMPLE);
  });

  it("rejects wrong lengths", () => {
    expect(() => toCosineCoeffs([1, 2, 3])).toThrow();
  });
});

describe("canonicalize", () => {
  it("produces a seed that deserializes back to the same coeffs", () => {
    const canonical = canonicalize(SAMPLE);
    const { coeffs } = deserializeCoeffs(canonical.seed);
    expect(toFlat12(coeffs)).toEqual(canonical.flat12);
  });

  it("is deterministic", () => {
    const a = canonicalize(SAMPLE);
    const b = canonicalize(SAMPLE);
    expect(a.seed).toBe(b.seed);
    expect(a.hexStops).toEqual(b.hexStops);
  });

  it("rounds unrounded input onto the seed grid", () => {
    const noisy = SAMPLE.map((v) => v + 0.00004);
    expect(canonicalize(noisy).seed).toBe(canonicalize(SAMPLE).seed);
  });

  it("flags degenerate palettes as invalid", () => {
    const black = [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0];
    expect(canonicalize(black).valid).toBe(false);
  });

  it("derives deterministic, in-range presentation properties", () => {
    const a = canonicalize(SAMPLE);
    const b = canonicalize(SAMPLE);
    expect(a.style).toBe(b.style);
    expect(a.steps).toBe(b.steps);
    expect(a.angle).toBe(b.angle);
    expect(PALETTE_STYLES).toContain(a.style);
    expect(a.steps).toBeGreaterThanOrEqual(2);
    expect(a.steps).toBeLessThanOrEqual(50);
    expect(a.angle).toBeGreaterThanOrEqual(0);
    expect(a.angle).toBeLessThanOrEqual(360);
  });
});

describe("banding floor", () => {
  it("scales the gradient-steps minimum with max frequency", () => {
    const c1 = toCosineCoeffs(SAMPLE); // max freq 1.0
    expect(minGradientSteps(c1)).toBe(10);
    const fast = [...SAMPLE];
    fast[6] = 2.0;
    expect(minGradientSteps(toCosineCoeffs(fast))).toBe(20);
  });

  it("floors gradient styles but leaves swatch styles alone", () => {
    const coeffs = toCosineCoeffs(SAMPLE);
    expect(applyBandingFloor("linearGradient", 6, coeffs)).toBe(10);
    expect(applyBandingFloor("linearGradient", 14, coeffs)).toBe(14);
    expect(applyBandingFloor("linearSwatches", 6, coeffs)).toBe(6);
  });
});

describe("featureVector", () => {
  it("has the configured dimensionality", () => {
    const { hexStops } = canonicalize(SAMPLE);
    expect(featureVector(hexStops)).toHaveLength(FEATURE_DIMENSIONS);
  });

  it("reversed vector equals vector of reversed stops", () => {
    const { hexStops } = canonicalize(SAMPLE);
    expect(reversedFeatureVector(hexStops)).toEqual(
      featureVector([...hexStops].reverse()),
    );
  });

  it("distinct palettes produce distant vectors", () => {
    const a = featureVector(canonicalize(SAMPLE).hexStops);
    const dark = [0.25, 0.2, 0.35, 0.2, 0.15, 0.25, 0.6, 0.7, 0.5, 0.5, 0.6, 0.7];
    const b = featureVector(canonicalize(dark).hexStops);
    const dist = Math.sqrt(a.reduce((s, v, i) => s + (v - (b[i] ?? 0)) ** 2, 0));
    expect(dist).toBeGreaterThan(10);
  });
});

describe("splitFor", () => {
  it("is deterministic and roughly 90/5/5", () => {
    const counts = { train: 0, val: 0, test: 0 };
    for (let i = 0; i < 2000; i++) {
      counts[splitFor(`query-${i}`)]++;
    }
    expect(counts.train).toBeGreaterThan(1650);
    expect(counts.val).toBeGreaterThan(40);
    expect(counts.test).toBeGreaterThan(40);
    expect(splitFor("query-42")).toBe(splitFor("query-42"));
  });
});
