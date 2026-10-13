import { decodePalette } from "@grabient/engine";
import { expect, test } from "vitest";
import { fixture } from "../test/files.ts";
import {
  invented,
  madePalettes,
  madeView,
  queryColors,
  sixDigits,
  withoutColors
} from "./colors.ts";

const round = (x: number) => Math.round(x * 1e6) / 1e6;

test("hex codes however a list of them is written", () => {
  expect(["#FFF", "#abc", "#264653ff", "#ABCDEF", "fff"].map(sixDigits)).toEqual([
    "#ffffff",
    "#aabbcc",
    "#264653",
    "#abcdef",
    "#ffffff"
  ]);
  const cases: [string, string[], string][] = [
    ["#FFF, #264653ff and navy", ["#ffffff", "#264653"], ", and navy"],
    ["navy", [], "navy"],
    ["#12345 #123456", ["#123456"], "#12345"],
    ["#gggggg", [], "#gggggg"],
    ["a#fff", ["#ffffff"], "a"],
    ["#fff1", [], "#fff1"]
  ];
  for (const [query, colors, rest] of cases) {
    expect(queryColors(query)).toEqual(colors);
    expect(withoutColors(query)).toBe(rest);
  }
});

test("the palettes colors make, and how each is first drawn, as G4 made them", () => {
  const golden =
    fixture<
      {
        colors: string[];
        made: { seed: string; style: string; steps: number; angle: number }[];
        invented: number | null;
      }[]
    >("made.json");
  for (const { colors, made, invented: most } of golden) {
    const seeds = madePalettes(colors);
    expect(seeds.map((seed, place) => ({ seed, ...madeView(seed, place) }))).toEqual(made);
    expect(seeds[0] ? round(invented(decodePalette(seeds[0])!, colors.slice(0, 8))) : null).toBe(
      most
    );
  }
});
