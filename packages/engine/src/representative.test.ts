import { expect, test } from "vitest";
import { representatives } from "./representative.ts";

/* the Christmas gradients' eight most liked, wine, blush, crimson and gold, and three of its forest greens */
const WARM = [
  "kU7BIRVqY_7q9vgZl75g",
  "kS8SQNYyvAsJIwG",
  "kWKSj5HCDAaKvQI9RUEqLM-4",
  "kW7yw84yS_kwvP21qD9npm_Y",
  "kQ-go87yDAA",
  "kYl6gRyFHAETMwBPxUE4jbEG-xQa",
  "kWRywvvShA3Ugwq_q71phm_A",
  "kW7SVE7Zo-NqcO9EIbwsJ28o"
];
const GREEN = ["kU5RJlOp8_56XwOMhr_g", "kUHBJrnp0_7MvPyYFEEA", "kY-hBAdQtC-gSQXVF8EwJZCC0SwW"];

test("a set's eight most liked of one color make room for a color they leave out", () => {
  const set = [...WARM.map(seed => ({ seed, likes: 2 })), ...GREEN.map(seed => ({ seed }))];
  const picks = representatives(set, 8);
  expect(picks).toEqual([0, 1, 2, 3, 4, 5, 7, 8]);
  expect(picks.some(i => GREEN.includes(set[i].seed))).toBe(true);
});

test("the first palette stays, and the picks come in the set's order", () => {
  const set = [...GREEN, ...WARM].map(seed => ({ seed }));
  const picks = representatives(set, 4);
  expect(picks[0]).toBe(0);
  expect(picks).toEqual([...picks].sort((a, b) => a - b));
  expect(picks).toHaveLength(4);
});

test("likes choose between palettes that look alike", () => {
  const twins = (likes: [number, number]) => [
    { seed: WARM[0], likes: 1 },
    { seed: GREEN[1], likes: likes[0] },
    { seed: GREEN[1], likes: likes[1] }
  ];
  expect(representatives(twins([0, 1]), 2)).toEqual([0, 2]);
  expect(representatives(twins([1, 0]), 2)).toEqual([0, 1]);
  expect(representatives(twins([0, 0]), 2)).toEqual([0, 1]);
});

test("a set no larger than the count is all picked, and a seed that names no palette never is", () => {
  expect(
    representatives([{ seed: WARM[0] }, { seed: "not a seed" }, { seed: GREEN[0] }], 8)
  ).toEqual([0, 2]);
  const set = [{ seed: "kzzz" }, ...WARM.map(seed => ({ seed }))];
  expect(representatives(set, 3)[0]).toBe(1);
  expect(representatives([], 8)).toEqual([]);
});
