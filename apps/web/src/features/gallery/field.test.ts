import { describe, expect, test } from "vitest";
import { arrivedWhole, fitted, readField, typedWords } from "./field.ts";

const SEED = "kY4mpDazO-mUuu_fuLqXU49dvVP6";

describe("what Enter in a list's field searches for", () => {
  test("words read as every list's address writes them", () => {
    expect(readField("  Dark   BLUE ")).toEqual({ words: "dark blue" });
    expect(readField("#FF6B6B #234567")).toEqual({ words: "#ff6b6b #234567" });
  });

  test("a palette is searched by its seed, in its own case", () => {
    expect(readField(SEED)).toEqual({ words: SEED });
  });

  test("a Grabient link searches what it names, with the view it draws in", () => {
    const read = readField(`https://grabient.com/ja/${SEED}?style=radialGradient&steps=9`);
    expect("words" in read && read.words).toBe(SEED);
    expect("words" in read && read.view?.get("style")).toBe("radialGradient");
    expect(readField("https://grabient.com/palettes?q=Sunset")).toMatchObject({ words: "sunset" });
    expect(readField("/palettes/rising?q=ocean")).toMatchObject({ words: "ocean" });
  });

  test("palette JSON opens the palette in the view it says", () => {
    const json = JSON.stringify({
      anchors: [
        { l: 0.3, c: 0.1, h: 250 },
        { l: 0.8, c: 0.1, h: 80 }
      ],
      style: "linearSwatches",
      steps: 6
    });
    const read = readField(json);
    expect("open" in read && read.open).toMatch(/^\/k[\w-]+\?style=linearSwatches&steps=6/);
    expect(readField('{"anchors": 3}')).toEqual({ error: "Paste palette JSON from Grabient." });
    expect(readField("{nope")).toEqual({ error: "Couldn't read this palette JSON." });
  });

  test("what cannot be searched says why", () => {
    expect(readField("   ")).toEqual({ error: "Enter a color, mood or palette link." });
    expect(readField("https://example.com/k1")).toEqual({
      error: "Only Grabient links can be opened here."
    });
    expect(readField("https://grabient.com/about")).toEqual({
      error: "Paste a link to one palette."
    });
    expect(readField("a".repeat(101))).toEqual({
      error: "Word searches can be up to 100 characters."
    });
    expect(readField("red\\blue")).toEqual({
      error: "Search with words or hex colors, or paste a palette link."
    });
    expect(readField("x".repeat(2049))).toEqual({
      error: "Links and JSON can be up to 2,048 characters."
    });
  });

  test("the tags are asked for the words, or for nothing when the text is no search", () => {
    expect(typedWords("Blu")).toBe("blu");
    expect(typedWords("https://example.com/")).toBe("");
  });
});

describe("an old grabient.com id in the field", () => {
  test("is fitted here to the palette its link would open, and searched by that", async () => {
    expect(await fitted(readField("_gLqgLqgPhf83gBkf-cf5cf5Wf4wgA3gDPf8OiWvovogA"))).toEqual({
      words: "kW5y2bdxk-PoUP17B0O-ovMo"
    });
  });

  test("one that cannot be read says so, and anything else is searched as it was read", async () => {
    expect(await fitted({ words: "_notanoldid" })).toEqual({
      error: "Couldn't read this palette link."
    });
    const words = readField("dark blue");
    expect(await fitted(words)).toBe(words);
    const seed = readField(SEED);
    expect(await fitted(seed)).toBe(seed);
  });
});

describe("a search that arrives whole", () => {
  test("a palette or a link pasted in searches at once", () => {
    expect(arrivedWhole(SEED, "")).toBe(true);
    expect(arrivedWhole(`https://grabient.com/${SEED}`, "blue")).toBe(true);
  });

  test("words wait for Enter, and so does anything typed a letter at a time", () => {
    expect(arrivedWhole("sunset beach", "")).toBe(false);
    expect(arrivedWhole(SEED, SEED.slice(0, -1))).toBe(false);
  });
});
