import { describe, expect, test } from "vitest";
import { arrivedWhole, readField, typedWords } from "./field.ts";

const SEED = "kY4mpDazO-mUuu_fuLqXU49dvVP6";

describe("the collections search field", () => {
  test("reads words as a list's address writes them", () => {
    expect(readField("  Ocean   Depths ")).toEqual({ words: "ocean depths" });
    expect(readField(SEED)).toEqual({ words: SEED, palette: true });
  });

  test("reads a Grabient link as the palette it names, with its view, or the words it searches", () => {
    expect(readField(`https://grabient.com/${SEED}?style=radialGradient&steps=9&angle=45`)).toEqual(
      {
        words: SEED,
        palette: true,
        view: new URLSearchParams("style=radialGradient&steps=9&angle=45")
      }
    );
    expect(readField("https://grabient.com/collections?q=Warm")).toEqual({ words: "warm" });
    expect(readField("grabient.com/ocean-depths")).toEqual({ words: "ocean depths" });
  });

  test("opens exported palette JSON in the editor", () => {
    const read = readField(JSON.stringify({ spec: "nope" }));
    expect(read).toEqual({ error: "Paste palette JSON from Grabient." });
    expect(readField("{ not json")).toEqual({ error: "Couldn't read this palette JSON." });
  });

  test("says why it cannot search what it holds", () => {
    expect(readField("")).toEqual({ error: "Enter a color, mood or palette link." });
    expect(readField("x".repeat(2049))).toEqual({
      error: "Links and JSON can be up to 2,048 characters."
    });
    expect(readField("w".repeat(101))).toEqual({
      error: "Word searches can be up to 100 characters."
    });
    expect(readField("red\\blue")).toEqual({
      error: "Search with words or hex colors, or paste a palette link."
    });
    expect(readField("https://example.com/red")).toEqual({
      error: "Only Grabient links can be opened here."
    });
    expect(readField("https://grabient.com/about/team")).toEqual({
      error: "Paste a link to one palette."
    });
  });

  test("asks the tags for the words typed, and for nothing in a link that names nothing", () => {
    expect(typedWords("Neon Ni")).toBe("neon ni");
    expect(typedWords("https://example.com/red")).toBe("");
    expect(typedWords("red\\blue")).toBe("red\\blue");
  });

  test("searches at once for a palette or a link that arrived whole, never for a letter typed", () => {
    expect(arrivedWhole(SEED, "")).toBe(true);
    expect(arrivedWhole(`https://grabient.com/${SEED}`, "")).toBe(true);
    expect(arrivedWhole(SEED, SEED.slice(0, -1))).toBe(false);
    expect(arrivedWhole("ocean depths", "")).toBe(false);
  });
});
