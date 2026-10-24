import { readFileSync } from "node:fs";
import { decodeSnapshot } from "@grabient/search/snapshot.ts";
import { beforeAll, describe, expect, test } from "vitest";
import { readyOldIds } from "../seo/legacy.ts";
import { loadVocabulary } from "./files.ts";
import { answerBar, knownScores } from "./rank.ts";
import {
  describedNames,
  excludedWords,
  hexQuery,
  knownQuery,
  nameWords,
  plainPhrase,
  queryWords,
  titleNames
} from "./read.ts";
import {
  normalizeSearchQuery,
  queryFromParam,
  searchRequestInput,
  sitemapQueries,
  unreadPalette
} from "./search.ts";
import { assets, fixture, searchFile } from "./testing.ts";

// the old addresses' maps load on first need; these tests read them through the plain functions
beforeAll(readyOldIds);

const round = (x: number) => Math.round(x * 1e6) / 1e6;
const env = { ASSETS: assets() };
const voc = (await loadVocabulary(env))!;
const snapshot = decodeSnapshot(searchFile("snapshot.bin"));

interface Read {
  text: string;
  words: string[];
  hex: unknown;
  known: {
    phrases: string[];
    rows: number[];
    how: string;
    whole: boolean;
    unknown: string[];
    filter: string[] | null;
    each: number;
    vector: number[];
  } | null;
}
const reads = (
  JSON.parse(
    readFileSync(
      new URL("../../../../../packages/search/test/fixtures/reads.json", import.meta.url),
      "utf8"
    )
  ) as { results: Read[] }
).results;

describe("a query as the vocabulary read it", () => {
  test.each(reads.map(read => [read.text, read] as const))("%s", (_, read) => {
    const known = knownQuery(voc, read.text);
    expect(
      known && {
        phrases: known.phrases,
        rows: known.rows,
        how: known.how,
        whole: known.whole,
        unknown: known.unknown,
        filter: known.filter,
        each: known.each?.length ?? 0,
        vector: known.vector.slice(0, 4).map(round)
      }
    ).toEqual(read.known);
    expect(queryWords(read.text)).toEqual(read.words);
    expect(hexQuery(read.text)).toEqual(read.hex);
  });
});

describe("what a search takes", () => {
  const pure = fixture<Record<string, [string, unknown][]>>("pure.json");

  test("normalized queries, path words and request input", () => {
    for (const [raw, query] of pure.normalizeSearchQuery)
      expect(normalizeSearchQuery(raw), raw).toBe(query);
    for (const [raw, query] of pure.queryFromParam) expect(queryFromParam(raw), raw).toBe(query);
    for (const [path, input] of pure.searchRequestInput) {
      expect(searchRequestInput(new Request(`https://grabient.test${path}`)), path).toEqual(input);
    }
  });

  test("an old id no map knows is a palette only the browser reads", () => {
    for (const [query, unread] of pure.unreadPalette)
      expect(unreadPalette(query), query).toBe(unread);
  });

  test("one indexable page per meaning", () => {
    for (const [query, plain] of pure.plainPhrase)
      expect(plainPhrase(knownQuery(voc, query), query), query).toBe(plain);
  });

  test("the sitemap's searches", async () => {
    expect(await sitemapQueries(env)).toEqual(
      fixture<{ sitemapQueries: string[] }>("pure.json").sitemapQueries
    );
  });

  test("the bar a held palette clears", () => {
    for (const [query, each] of [
      ["sunset", false],
      ["red and blue", true]
    ] as const) {
      const bar = answerBar(knownScores(snapshot, knownQuery(voc, query)!), each);
      expect(round(bar)).toBe(Object.fromEntries(pure.answerBar)[query]);
    }
  });
});

test("what follows a negation is read and said, never left out", () => {
  expect(excludedWords(voc, "warm but not too dark")).toEqual(["dark"]);
  expect(excludedWords(voc, "without dark blue")).toEqual(["dark blue"]);
  expect(excludedWords(voc, "forget me not")).toEqual([]);
  expect(excludedWords(voc, "floresta no outono")).toEqual([]);
  expect(excludedWords(voc, "bleu sans rouge")).toEqual(["rouge"]);
});

test("a name is read to the end of its text, a query to its hundredth character", () => {
  const title = `${"Teal ".repeat(20)}Lakers`;
  expect(nameWords(title)).toContain("lakers");
  expect(queryWords(title)).not.toContain("lakers");
  expect(nameWords("The Lakers of the night")).toEqual(["lakers", "night"]);
});

test("a description names its palette by the words it capitalizes inside a sentence, where few descriptions use them", () => {
  const named = describedNames(
    new Map([
      [
        "kA",
        [
          "The Preds' home gold, as worn at Bridgestone Arena.",
          "Smashville gold for the Preds. Soft midtones for the Preds."
        ]
      ],
      ["kB", ["Lights at the arena."]],
      ["kC", ["An Arena of colors."]],
      ["kD", ["Arena nights. The ARENA."]],
      ["kE", ["Colors for 2026 and the Stanley Cup."]],
      ["kF", ["… — !"]],
      ["kG", ["Colors of the Tokyo東京2026 games."]],
      ["kH", ["Away white for the Preds."]],
      ["kI", ["A third jersey for the Preds."]]
    ])
  );
  /* Smashville and Colors open a sentence, midtones is no name, arena is in four palettes' descriptions and Preds in
     three, as many as a name may be in, and a number is never a name, whole or split from a word */
  expect([...named]).toEqual([
    ["kA", "bridgestone preds"],
    ["kE", "cup stanley"],
    ["kG", "tokyo 東京"],
    ["kH", "preds"],
    ["kI", "preds"]
  ]);
});

test("a title names what it holds, and beneath a collection's own title", () => {
  const names = (title: string) => titleNames(voc, title).map(row => voc.phrases[row]);
  expect(names("Dark blue night")).toContain("dark blue");
  expect(names("Red and black")).toEqual(expect.arrayContaining(["red", "black"]));
  expect(names("the of")).toEqual([]);
});
