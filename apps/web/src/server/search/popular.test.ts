import { expect, test } from "vitest";
import { loadVocabulary } from "./files.ts";
import {
  isEmoji,
  kindOf,
  leadRow,
  mixSearches,
  POPULAR_KEPT,
  rankSearches,
  tagWords
} from "./popular.ts";
import { assets, fixture } from "./testing.ts";

const voc = (await loadVocabulary({ ASSETS: assets() }))!;
const golden = fixture<{
  POPULAR_KEPT: number;
  yearRow: string[];
  kinds: [string, string][];
  leadRowExample: string[];
  emoji: Record<string, { isEmoji: boolean; tag: string | null }>;
  tagWords: Record<string, string | null>;
}>("tags-row.json");

test("the year's row, the kinds in turn, as grabient4 made it", () => {
  const row = mixSearches(
    voc,
    rankSearches(voc).map(entry => entry.words)
  );
  expect(POPULAR_KEPT).toBe(golden.POPULAR_KEPT);
  expect(row).toEqual(golden.yearRow);
  expect(row.map(words => [words, kindOf(voc, words)])).toEqual(golden.kinds);
});

test("the row at rest: what is scheduled, then four rising, then the most searched", () => {
  const row = leadRow(voc, {
    scheduled: ["christmas", "halloween", "christmas", "notaword123"],
    rising: ["blue", "navy blue", "golden", "teal", "mint", "lavender", "lime"],
    palettes: ["red", "dark red", "green"]
  });
  expect(row).toEqual(golden.leadRowExample);
});

test("the words a tag says", () => {
  for (const [words, tag] of Object.entries(golden.tagWords))
    expect(tagWords(voc, words), words).toBe(tag);
  for (const [words, { isEmoji: emoji, tag }] of Object.entries(golden.emoji)) {
    expect(isEmoji(words), words).toBe(emoji);
    expect(tagWords(voc, words), words).toBe(tag);
  }
});

test("counted searches take over from the year", () => {
  expect(rankSearches(voc, new Map([["halloween", 500]]))[0].words).toBe("halloween");
});
