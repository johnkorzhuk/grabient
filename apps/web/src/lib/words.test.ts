import { expect, test } from "vitest";
import { grabientHost, listWords, readLink } from "./words.ts";

// A seed whose letters hold a hyphen: read as words, the hyphen would become a space.
const SEED = "kY4mpDazO-mUuu_fuLqXU49dvVP6";

test("a link to a palette on any of Grabient's hosts is that palette, however its address is written", () => {
  for (const link of [
    `https://grabient.com/${SEED}`,
    `https://www.grabient.com/ja/${SEED}/edit`,
    `https://staging.grabient.com/${SEED}/`,
    `grabient-lite.jkorzhuk.workers.dev/${SEED}.png?style=radialGradient`,
    `https://grabient4.jkorzhuk.workers.dev/api/og?seed=${SEED}`,
    `/palettes/${SEED}`,
    `https://grabient.com/palettes/${SEED}/`
  ]) {
    expect([link, listWords(link)]).toEqual([link, SEED]);
  }
  expect(readLink(`https://grabient.com/${SEED}?style=radialSwatches&steps=12&view=3d`)).toEqual({
    words: SEED,
    view: new URLSearchParams("style=radialSwatches&steps=12")
  });
});

test("a link to a search is its words, and a link off the site or to neither is nothing", () => {
  expect(listWords("https://grabient.com/palettes/rising/3m?q=Dark%20%20Blue")).toBe("dark blue");
  expect(listWords("https://grabient.com/palettes/dark-blue")).toBe("dark blue");
  expect(listWords("https://example.com/palettes?q=blue")).toBe("");
  expect(listWords("https://user@grabient.com/palettes?q=blue")).toBe("");
  expect(listWords("https://grabient.com/about")).toBe("");
  expect(grabientHost("GRABIENT.COM") && !grabientHost("grabient.com.example.org")).toBe(true);
});

test("words are written one way, and a palette's seed keeps its case", () => {
  expect(listWords("  Dark　ＢＬＵＥ  ")).toBe("dark blue");
  expect(listWords(SEED)).toBe(SEED);
  expect(listWords("x".repeat(101))).toBe("");
  expect(listWords("a\u0000b")).toBe("");
  expect(listWords(null)).toBe("");
});
