import { expect, test } from "vitest";
import golden from "./fixtures/image-dimensions.json" with { type: "json" };
import { cardSize, montageSize, PIXELS_MAX, pictureSize, SIDE_MAX } from "./size.ts";

const at = (query: string) => new URLSearchParams(query);
const pair = ({ width, height }: { width: number; height: number }) => [width, height];

test("a palette's picture, a montage and a card take the sizes the golden addresses drew", () => {
  for (const row of golden.dims) {
    const params = at(row.query);
    if (row.branded) {
      const card = cardSize(params);
      expect([row.query, pair(card), card.chips]).toEqual([row.query, row.drawn, row.chips]);
    } else {
      const drawn = row.view ? pictureSize(params) : montageSize(params);
      expect([row.query, row.view, pair(drawn)]).toEqual([row.query, row.view, row.drawn]);
    }
  }
  for (const row of golden.pngSizes.filter(row => !("view" in row))) {
    expect([row.query, pictureSize(at(row.query))]).toEqual([row.query, row.size]);
  }
});

test("any size is 1 to 2400 a side and no more pixels than the ceiling, and keeps its shape", () => {
  const sides = [
    "auto",
    "0",
    "1",
    "15",
    "16",
    "39",
    "40",
    "256",
    "630",
    "1200",
    "2400",
    "2401",
    "6000",
    "6001",
    "99999",
    "9".repeat(30)
  ];
  for (const a of sides) {
    for (const b of sides) {
      if (a === "auto" && b === "auto") continue;
      const { width, height } = pictureSize(at(`size=${a}x${b}`));
      const label = `size=${a}x${b} drew ${width}x${height}`;
      expect([label, Number.isInteger(width) && Number.isInteger(height)]).toEqual([label, true]);
      expect([label, width >= 1 && height >= 1 && width <= SIDE_MAX && height <= SIDE_MAX]).toEqual(
        [label, true]
      );
      expect([label, width * height <= PIXELS_MAX]).toEqual([label, true]);
      if (a !== "auto" && b !== "auto")
        expect(pictureSize(at(`w=${a}&h=${b}`))).toEqual({ width, height });
    }
  }
  expect(PIXELS_MAX).toBe(3_024_000);
  expect(pair(pictureSize(at("size=7000x7000")))).toEqual([1738, 1738]);
  expect(1739 * 1739).toBeGreaterThan(PIXELS_MAX);
});

test("a malformed size is no size, and a card ignores every size but its head", () => {
  for (const none of [
    "256",
    "x1",
    "256x",
    "-5x10",
    "2.5x10",
    "256X1",
    "256x1x1",
    "1e3x10",
    "autoxauto",
    "",
    "wide",
    " 256x1"
  ]) {
    expect([none, pair(pictureSize(at(`size=${encodeURIComponent(none)}`)))]).toEqual([
      none,
      [1200, 630]
    ]);
  }
  expect(cardSize(at("w=100&h=100&size=1080x1920"))).toEqual({
    width: 1200,
    height: 630,
    chips: true
  });
  expect(cardSize(at("head=800x200&chips=on"))).toEqual({ width: 800, height: 200, chips: false });
});
