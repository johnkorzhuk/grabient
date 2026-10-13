import { decodePalette } from "@grabient/engine/codec.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { expect, test } from "vitest";
import { weekIconAnswer } from "./answers.ts";
import golden from "./fixtures/tab-icons.json" with { type: "json" };
import {
  legibleStops,
  MARK_FIXED,
  markSvg,
  markTileSvg,
  markWeek,
  svgDataUrl,
  weekMark
} from "./mark.ts";

test("the mark is drawn as the golden icons are", () => {
  expect({
    fixed: markSvg(),
    lightOnly: markSvg(["#ff0080", "#40e0d0"], "light"),
    adaptive: markSvg(["#fdfcfb", "#f3e7e9"]),
    one: markSvg(["#fdfcfb"])
  }).toEqual(golden.markSvg);
  expect({
    tile: markTileSvg("#0c0c0e", MARK_FIXED, "tile"),
    square: markTileSvg("#0c0c0e", MARK_FIXED, "square")
  }).toEqual(golden.tiles);
});

test("a color too near the tab strip moves clear of it, and a colorful one stays", () => {
  expect(legibleStops(["#fdfcfb", "#f3e7e9", "#e2d1c3"], "light")).toEqual(
    golden.legible.paleLight
  );
  expect(legibleStops(["#0c0c0e", "#141e30", "#1f1c2c"], "dark")).toEqual(golden.legible.deepDark);
  expect(legibleStops(["#000000", "#888888", "#ffffff"], "light")).toEqual(
    golden.legible.grays.light
  );
  expect(legibleStops(["#000000", "#888888", "#ffffff"], "dark")).toEqual(
    golden.legible.grays.dark
  );
});

test("a palette's icon is its curve at 16 stops, as a data address for each scheme", () => {
  const P = decodePalette("kS7Q8Yy5S_SChv0");
  if (!P) throw new Error("No palette");
  const stops = sampleStops(P, 16).map(stop => stop.hex);
  expect(stops).toEqual(golden.iconStops);
  expect({ light: svgDataUrl(markSvg(stops, "light")), dark: svgDataUrl(markSvg(stops)) }).toEqual(
    golden.paletteIcon
  );
  for (const [name, colors] of [
    ["vivid", ["#ff0080", "#40e0d0"]],
    ["pale", ["#fdfcfb", "#0c0c0e"]],
    ["single", ["#e11d48"]]
  ] as const) {
    const hrefs = {
      light: svgDataUrl(markSvg(colors, "light")),
      dark: svgDataUrl(markSvg(colors))
    };
    expect([name, hrefs]).toEqual([name, golden[name]]);
  }
});

test("each ISO week has its own colors and its own files, from the first week to next week", async () => {
  const now = Date.parse(golden.now);
  expect(markWeek(now)).toBe("2026-w42");
  expect(markWeek(Date.parse("2026-01-01T00:00:00Z"))).toBe("2026-w01");
  expect(markWeek(Date.parse("2027-01-01T12:00:00Z"))).toBe("2026-w53");
  expect(weekMark("2026-w42").light).toHaveLength(16);
  for (const [path, want] of Object.entries(golden.weekFiles)) {
    if (!want) continue;
    const answer = weekIconAnswer(new Request(`https://grabient.test${path}`), now);
    expect([path, answer.status, answer.headers.get("Cache-Control")]).toEqual([
      path,
      want.status,
      want.cache
    ]);
    if (want.status === 200) expect(answer.headers.get("Content-Type")).toBe(want.type);
  }
  const file = (path: string) =>
    weekIconAnswer(new Request(`https://grabient.test${path}`), now).text();
  expect(await file("/favicon/2026-w42.svg")).toBe(golden.weekSvgW42.light);
  expect(await file("/favicon/2026-w42-dark.svg")).toBe(golden.weekSvgW42.dark);
  expect(weekIconAnswer(new Request("https://grabient.test/favicon/x.svg"), now).status).toBe(404);
});
