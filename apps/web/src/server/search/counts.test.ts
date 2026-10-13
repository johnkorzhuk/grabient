import { expect, test } from "vitest";
import {
  type CountRow,
  countedWords,
  risingSearches,
  type SearchPage,
  tally,
  unreadWords
} from "./counts.ts";
import { fixture, searchEnv } from "./testing.ts";

const round = (x: number) => Math.round(x * 1e6) / 1e6;
const golden = fixture<{
  countedWords: { page: SearchPage; raw: string; counted: string | null; unread: string | null }[];
  tally: [string, number][];
  risingSearches: unknown[];
  rows: CountRow[];
  today: number;
}>("counts.json");

test("a search counts as the tag would say it, and other words only as letters", async () => {
  const env = searchEnv();
  for (const { page, raw, counted, unread } of golden.countedWords) {
    expect(await countedWords(env, page, raw), raw).toBe(counted);
    expect(await unreadWords(env, raw), raw).toBe(unread);
  }
});

test("the window's searches, weighed by age, from three on", () => {
  expect(
    [...tally(golden.rows, golden.today)].map(([words, score]) => [words, round(score)])
  ).toEqual(golden.tally);
});

test("rising this week against the weeks before", () => {
  expect(risingSearches(golden.rows, golden.today)).toEqual(golden.risingSearches);
});
