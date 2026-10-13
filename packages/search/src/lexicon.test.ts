import { describe, expect, test } from "vitest";
import { fixture, searchJson, type VocabFile } from "../test/files.ts";
import { createLexicon, type LexiconFile, withEmoji } from "./lexicon.ts";
import { normalizeQuery, queryTokens } from "./text.ts";

const vocab = searchJson<VocabFile>("vocab.json");
const lex = searchJson<LexiconFile>("lex.json");
const emoji = searchJson<Record<string, string>>("emoji.json");
const lexicon = createLexicon(lex);
const said = createLexicon(withEmoji(lex, emoji, vocab.phrases));
const phraseOf = (text: string) => {
  const hit = said.lookup(text);
  return hit && vocab.phrases[hit.phrase];
};

interface Read {
  text: string;
  lookup: { phrase: string; how: string; key: string } | null;
}

describe("whole-text lookups as G4 made them", () => {
  test.each(
    fixture<{ results: Read[] }>("reads.json").results.map(read => [read.text, read] as const)
  )("%s", (_, read) => {
    const hit = said.lookup(read.text);
    expect(hit && { phrase: vocab.phrases[hit.phrase], how: hit.how, key: hit.key }).toEqual(
      read.lookup
    );
  });
});

test("exact, translated, misspelled", () => {
  expect(phraseOf("Sunset")).toBe("sunset");
  expect(phraseOf("  SUNSET!! ")).toBe("sunset");
  expect(phraseOf("sunsett")).toBe("sunset");
  expect(said.lookup("sunsett")?.how).toBe("typo");
  expect(phraseOf("atardecer")).toBe("sunset");
  expect(phraseOf("coucher de soleil")).toBe("sunset");
  expect(phraseOf("redd")).toBe("red");
  expect(phraseOf("turkis")).toBe("turquoise");
  expect(phraseOf("लाल")).toBe("red");
  for (const typo of ["purpel", "lavendar", "burgandy", "yelow", "oceann", "magneta"]) {
    expect(said.lookup(typo)?.how, typo).toBe("typo");
  }
});

test("forgiveness stops where it would change the meaning", () => {
  expect(phraseOf("beige")).not.toBe("snow");
  expect(said.lookup("xqzv")).toBeNull();
  expect(said.lookup("rde")).toBeNull();
  expect(said.lookup("song")).toBeNull();
  expect(said.lookup("grren")).toBeNull();
  expect(said.lookup("")).toBeNull();
});

test("a Korean noun is read without its particle word by word, never whole", () => {
  expect(vocab.phrases[lexicon.word("바다의")!.phrase]).toBe("ocean");
  expect(lexicon.lookup("바다의")).toBeNull();
});

test("every key normalizes to itself", () => {
  for (const key of Object.keys(lex)) expect(normalizeQuery(key)).toBe(key);
});

test("emoji lead to the phrases they stand for", () => {
  expect(Object.keys(emoji).length).toBeGreaterThan(500);
  for (const [key, phrase] of Object.entries(emoji)) {
    expect(vocab.phrases).toContain(phrase);
    expect(normalizeQuery(key)).toBe(key);
  }
  expect(phraseOf("🌊")).toBe("ocean");
  expect(phraseOf("❄️")).toBe("snow");
  expect(said.lookup("👍🏽💜")).toBeNull();
  expect(queryTokens("เหลืองน้ำเงิน").map(phraseOf)).toEqual(["yellow", "blue"]);
});
