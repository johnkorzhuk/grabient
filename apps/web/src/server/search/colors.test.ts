import { labOf } from "@grabient/search/colors.ts";
import { expect, test } from "vitest";
import { searchColors } from "./colors.ts";
import { blendOf, seedFacts, shownDistance } from "./facts.ts";
import { assets, fixture } from "./testing.ts";

const round = (x: number) => (Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : x);

test("a search's colors, as the tab and its tag wear them", async () => {
  const env = { ASSETS: assets() };
  for (const [query, colors] of fixture<{ results: [string, string[]][] }>("search-colors.json")
    .results) {
    expect(await searchColors(env, query), query).toEqual(colors);
  }
});

test("the 24 points a palette is measured against, as grabient4 measured them", () => {
  const golden = fixture<{
    seedFacts: [string, (number | null)[]][];
    blendOf: [string[], number[][]][];
    shownDistance: [{ kseed: string; style: string; steps: number }, string[], number][];
  }>("facts.json");
  // JSON writes Infinity as null
  for (const [seed, facts] of golden.seedFacts) {
    expect(
      [...seedFacts([seed])].map(x => (Number.isFinite(x) ? round(x) : null)),
      seed
    ).toEqual(facts);
  }
  for (const [hexes, points] of golden.blendOf)
    expect(blendOf(hexes).map(p => p.map(round))).toEqual(points);
  for (const [item, hexes, distance] of golden.shownDistance) {
    expect(round(shownDistance(item, hexes.map(labOf)))).toBe(distance);
  }
});
