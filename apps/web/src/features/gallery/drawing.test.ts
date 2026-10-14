import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { hexesOf } from "../../lib/palette.ts";
import { AS_SAVED, drawnIn } from "../list/appearance.ts";
import {
  homePaint,
  madeItems,
  nameOf,
  ownOf,
  paintOf,
  paletteHref,
  picturedAs,
  relativeAge
} from "./drawing.ts";
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

test("a list's palette leads to its editor in the view the list draws it in, at the reader's size", () => {
  const own = ownOf({ kseed: "kS7Q8Yy5S_SChv0", style: "linearGradient", steps: 7, angle: 90 });
  const drawn = drawnIn(own, { ...AS_SAVED, angle: 45 });
  expect(hexesOf(drawn)).toHaveLength(drawn.steps);
  expect(paletteHref(drawn, { width: 1200, height: 630 })).toBe(
    "/kS7Q8Yy5S_SChv0?angle=45&size=1200x630"
  );
  expect(paletteHref(drawn, null)).toBe("/kS7Q8Yy5S_SChv0?angle=45");
});

test("a palette is named by its colors in the view it is drawn in, the same each time it is asked", () => {
  const own = ownOf({ kseed: "kS7Q8Yy5S_SChv0", style: "linearGradient", steps: 7, angle: 90 });
  const name = nameOf(own);
  expect(name).not.toBe("");
  expect(nameOf({ ...own })).toBe(name);
  expect(nameOf({ ...own, style: "linearSwatches" })).not.toBe("");
});

test("the palettes a search's colors make tell no age and hold no likes", () => {
  const made = madeItems(["#ff6b6b", "#4ecdc4"]);
  expect(made.length).toBeGreaterThan(0);
  expect(made.every(item => item.likes === 0 && item.createdAt === 0)).toBe(true);
  expect(madeItems([])).toEqual([]);
});

test("a picture draws what the control is setting over the address's view, and the style it previews", () => {
  const own = { seed: "kS7Q8Yy5S_SChv0", style: "linearGradient" as const, steps: 7, angle: 90 };
  const view = { ...AS_SAVED, style: "radialSwatches", steps: 9 } as const;
  expect(picturedAs(own, view, null, null)).toEqual(drawnIn(own, view));
  expect(picturedAs(own, view, { steps: 12, angle: 45 }, "angularGradient")).toEqual({
    ...own,
    style: "angularGradient",
    steps: 12,
    angle: 45
  });
  expect(picturedAs(own, view, { angle: "auto" }, null)).toMatchObject({ steps: 9, angle: 90 });
});

test("the frame paints a list's first palettes as the list draws them, and the home's head before its groups", () => {
  const item = (n: number) => ({
    kseed: `kS7Q8Yy5S_SChv${n}`,
    style: "linearGradient" as const,
    steps: 7,
    angle: 90,
    likes: 0,
    createdAt: 0
  });
  const items = Array.from({ length: 12 }, (_, n) => item(n));
  const view = { ...AS_SAVED, style: "radialSwatches" } as const;
  const painted = paintOf(items, view);
  expect(painted).toHaveLength(8);
  expect(painted[0]).toEqual(drawnIn(ownOf(items[0]!), view));
  const group = (seeds: number[]) => ({
    preview: seeds.map(n => ({ seed: item(n).kseed, style: item(n).style, steps: 7, angle: 90 }))
  });
  // a searched home may hold no head: its groups' first palettes paint the frame
  const groups = [group([20, 21, 22]), group([30])];
  expect(homePaint([], groups, AS_SAVED).map(p => p.seed)).toEqual(
    [20, 21, 30].map(n => item(n).kseed)
  );
  expect(homePaint(items, groups, AS_SAVED).map(p => p.seed)).toEqual(
    items.slice(0, 8).map(p => p.kseed)
  );
});
