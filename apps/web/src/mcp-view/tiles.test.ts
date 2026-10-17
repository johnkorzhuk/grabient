import { describe, expect, it } from "vitest";
import golden from "./fixtures/view-tiles.json" with { type: "json" };
import {
  chosenWords,
  type FileFormat,
  fileUrl,
  nameFromArguments,
  sheetFromResult,
  type Tile,
  tilesFromArguments
} from "./tiles.ts";

const SEED = "kSWUkczDNDewdRK";
const TILE: Tile = { tile: 2, seed: SEED, style: "radialSwatches", steps: 5, angle: 90 };

describe("the view's tiles", () => {
  it("are read from a call's arguments as the server reads them, or not at all", () => {
    for (const { args, tiles } of golden.args) {
      // `picture` was a flag the server refuses: a call that names it paints nothing
      const expected = "picture" in args ? null : tiles;
      expect(tilesFromArguments({ name: "A set", ...args }), JSON.stringify(args)).toEqual(
        expected
      );
      // nor does a call that names no set, or one past a title's length
      expect(tilesFromArguments(args)).toBeNull();
      expect(tilesFromArguments({ name: "x".repeat(81), ...args })).toBeNull();
    }
    expect(nameFromArguments({ name: "  Harbor\tlights  ", palettes: [] })).toBe("Harbor lights");
    expect(nameFromArguments({ palettes: [] })).toBeNull();
  });

  it("are read from an answer's view data, else from its words where marked as their own", () => {
    const answers = [
      {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              tiles: [
                {
                  tile: 1,
                  seed: SEED,
                  url: `https://grabient.com/${SEED}`,
                  title: "By colors",
                  style: "linearGradient",
                  steps: 7,
                  angle: 90
                },
                {
                  tile: 2,
                  seed: "kQf5EOWSTcQ",
                  title: "Mine",
                  own: true,
                  style: "linearSwatches",
                  steps: 3,
                  angle: 90
                }
              ]
            })
          }
        ]
      },
      { isError: true, content: [{ type: "text", text: "no" }] },
      {
        _meta: {
          "com.grabient/view": {
            origin: "https://grabient.com",
            tiles: [
              { tile: 1, seed: SEED, style: "linearGradient", steps: 7, angle: 90, title: "Mine" }
            ]
          }
        }
      }
    ];
    expect(answers.map(sheetFromResult)).toEqual(golden.sheetFromResult);
    // the set's name rides with the view's data, on one line
    expect(
      sheetFromResult({
        _meta: {
          "com.grabient/view": {
            name: " Harbor\n lights ",
            tiles: [{ tile: 1, seed: SEED, style: "linearGradient", steps: 7, angle: 90 }]
          }
        }
      })?.name
    ).toBe("Harbor lights");
  });

  it("tell the model the palette a person chose, and name its files in its view", () => {
    expect(chosenWords(TILE, "https://grabient.com")).toBe(golden.chosenWords);
    const formats: FileFormat[] = ["svg", "png", "css", "md", "tokens", "ase"];
    expect(formats.map(format => fileUrl("https://grabient.com", TILE, format))).toEqual(
      golden.fileUrl
    );
  });
});
