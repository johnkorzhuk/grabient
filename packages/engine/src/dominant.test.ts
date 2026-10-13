import { expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { dominantColors } from "./dominant.ts";

const { dominant } = golden<{ dominant: { seeds: string[]; max: number; colors: string[] }[] }>(
  "colors"
);

test("a set of palettes blooms with the same one to five colors as before", () => {
  for (const d of dominant) expect(dominantColors(d.seeds, d.max)).toEqual(d.colors);
  expect(dominantColors([])).toEqual([]);
  expect(dominantColors(["not a seed"])).toEqual([]);
});
