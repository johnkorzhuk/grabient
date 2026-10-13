import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { drawnAs, hexesOf, paletteHref, picturedAs, relativeAge } from "./drawing.ts";
import { sortSearch } from "./sort.ts";

const helpers = JSON.parse(
  readFileSync(new URL("fixtures/helpers.json", import.meta.url), "utf8")
) as {
  relativeAge: { now: number; ages: { ago: number; age: string }[] };
};
const golden = JSON.parse(
  readFileSync(new URL("fixtures/keys-routes-orders.json", import.meta.url), "utf8")
) as { sorts: Record<string, string[]> };

test.each(helpers.relativeAge.ages)(
  "an age $ago ms old reads as grabient4 said it",
  ({ ago, age }) => {
    const now = helpers.relativeAge.now;
    /* grabient4 said "12 months" for the last days of a year; past twelve thirty-day months it is the month it was */
    expect(relativeAge(now - ago, now)).toBe(age === "12 months" ? "Oct 2025" : age);
  }
);

test("a search sorts as both sides do, ties by the seed's code points", () => {
  const items = [
    { kseed: "kB", likes: 5, createdAt: 3, score: 0.2, rising: 10, rising3m: 1 },
    { kseed: "kA", likes: 5, createdAt: 1, score: 0.9, rising: 10, rising3m: 3 },
    { kseed: "kC", likes: 9, createdAt: 2, score: 0.1, rising1y: 4 },
    { kseed: "kD", likes: 0, createdAt: 9, score: 0.5 },
    { kseed: "kÄ", likes: 0, createdAt: 9, score: 0.5 }
  ];
  for (const [order, seeds] of Object.entries(golden.sorts)) {
    const [sort, frame] = order.split(":") as ["popular", "1w"];
    expect([order, sortSearch(items, sort, frame).map(item => item.kseed)]).toEqual([order, seeds]);
  }
});

test("a palette drawn in a list's view, never with fewer steps than its keyframes, and its editor in that view", () => {
  const own = { seed: "kS7Q8Yy5S_SChv0", style: "linearGradient" as const, steps: 7, angle: 90 };
  expect(
    drawnAs(own, { style: "radialSwatches", steps: 3, angle: "auto", size: "auto" })
  ).toMatchObject({
    style: "radialSwatches",
    angle: 90
  });
  const drawn = drawnAs(own, { style: "auto", steps: "auto", angle: 45, size: "auto" });
  expect(hexesOf(drawn.seed, drawn.steps)).toHaveLength(drawn.steps);
  expect(paletteHref(drawn, "1200x630")).toBe("/kS7Q8Yy5S_SChv0?angle=45&size=1200x630");
});

test("a picture draws what the control is setting over the address's view, and the style it previews", () => {
  const own = { seed: "kS7Q8Yy5S_SChv0", style: "linearGradient" as const, steps: 7, angle: 90 };
  const view = { style: "radialSwatches", steps: 9, angle: "auto", size: "auto" } as const;
  expect(picturedAs(own, view, null, null)).toEqual(drawnAs(own, view));
  expect(picturedAs(own, view, { steps: 12, angle: 45 }, "angularGradient")).toEqual({
    ...own,
    style: "angularGradient",
    steps: 12,
    angle: 45
  });
  expect(picturedAs(own, view, { angle: "auto" }, null)).toMatchObject({ steps: 9, angle: 90 });
});
