import { describe, expect, test } from "vitest";
import { fixture } from "../test/files.ts";
import {
  americanSpelling,
  hangulStem,
  harmonyFilter,
  joinTokens,
  nearWord,
  normalizeQuery,
  normalizeText,
  QUERY_MAX,
  queryTokens,
  textTokens
} from "./text.ts";
import { FORM_WORDS, FUNCTION_WORDS, padded, queryIntent } from "./words.ts";

interface Read {
  text: string;
  normalized: string;
  tokens: string[];
  harmony: string[] | null;
  mapped: {
    presentation: { render: string | null; style: string | null; count: number | null };
    stopwordHits: number;
  };
}
const reads = fixture<{ results: Read[] }>("reads.json").results;

describe("a query as G4 read it", () => {
  test.each(reads.map(read => [read.text, read] as const))("%s", (_, read) => {
    expect(normalizeQuery(read.text)).toBe(read.normalized);
    expect(queryTokens(read.text)).toEqual(read.tokens);
    expect(harmonyFilter(read.normalized)).toEqual(read.harmony);
    const { render, style, count } = read.mapped.presentation;
    const intent = queryIntent(read.text);
    expect(intent.swatches).toBe(render === "swatches");
    expect(intent.style).toBe(
      style === null ? null : style === "conic" ? "angularGradient" : `${style}Gradient`
    );
    expect(intent.count).toBe(count);
    expect(padded(read.text)).toBe(read.mapped.stopwordHits > 0);
  });
});

test("normalization keeps emoji and marks, and cuts by code point", () => {
  expect(normalizeQuery("Red ❤️!")).toBe("red ❤");
  expect(normalizeQuery("👍🏽")).toBe("👍");
  expect(normalizeQuery("🧑‍🚀")).toBe("🧑‍🚀");
  expect(normalizeQuery("लाल")).toBe("लाल");
  expect(QUERY_MAX).toBe(100);
  expect(normalizeQuery("🌊".repeat(60)).split(" ")).toHaveLength(50);
});

test("a title, a tag or a description is read to its end, and a query to its hundredth code point", () => {
  const text = `${"Ocean blue, ".repeat(24)}and a night.`;
  expect(text).toHaveLength(300);
  expect(normalizeText(text)).toBe(`${"ocean blue ".repeat(24)}and a night`);
  expect(Array.from(normalizeQuery(text)).length).toBeLessThanOrEqual(QUERY_MAX);
  expect(textTokens(text).at(-1)).toBe("night");
  expect(queryTokens(text)).not.toContain("night");
  for (const short of [
    "Nashville Predators inspired palette",
    "日本の秋",
    "พระอาทิตย์ตก",
    "🌊🌅sunset"
  ])
    expect(textTokens(short), short).toEqual(queryTokens(short));
  // mapped as the training script maps its phrases: the index map passes cuts nothing
  expect(["Ocean blue", "日本の秋"].map(normalizeQuery)).toEqual(["ocean blue", "日本の秋"]);
});

test("words are found inside unspaced scripts", () => {
  expect(queryTokens("🌊🌅sunset")).toEqual(["🌊", "🌅", "sunset"]);
  expect(queryTokens("日本の秋")).toEqual(["日本", "の", "秋"]);
  expect(queryTokens("พระอาทิตย์ตก")).toEqual(["พระอาทิตย์", "ตก"]);
  expect(joinTokens(["深", "蓝色"])).toBe("深蓝色");
  expect(joinTokens(["dark", "blue"])).toBe("dark blue");
  expect(joinTokens(["sunset", "日落"])).toBe("sunset 日落");
});

test("a Korean noun loses its particle", () => {
  expect(hangulStem("바다의")).toBe("바다");
  expect(hangulStem("바다에서")).toBe("바다");
  expect(hangulStem("sea")).toBeNull();
  expect(hangulStem("의")).toBeNull();
});

test("one slip is forgiven where it cannot change the meaning", () => {
  const pairs: [string, string, boolean][] = [
    ["purpel", "purple", true],
    ["redd", "red", true],
    ["blend", "bland", false],
    ["song", "sáng", false],
    ["turkis", "türkis", true],
    ["home", "hope", false],
    ["gold", "bold", false],
    ["oceans", "ocean", true],
    ["clam", "clay", false]
  ];
  for (const [typed, known, near] of pairs)
    expect(nearWord(typed, known), `${typed} ${known}`).toBe(near);
});

test("American spelling, whole words only", () => {
  expect(americanSpelling("light grey green")).toBe("light gray green");
  expect(americanSpelling("greyhound colour")).toBe("greyhound color");
  expect(americanSpelling("centre greys greyish")).toBe("center grays grayish");
});

test("form words are always set aside; another language's grammar only when it is no word of its own", () => {
  expect(FORM_WORDS.has("over") && FORM_WORDS.has("or")).toBe(true);
  expect(FUNCTION_WORDS.has("の") && FUNCTION_WORDS.has("sur")).toBe(true);
  expect(FUNCTION_WORDS.has("or")).toBe(false);
  expect([FORM_WORDS.size, FUNCTION_WORDS.size]).toEqual([101, 445]);
});

test("drawing intent", () => {
  expect(queryIntent("blue radial swatches")).toEqual({
    style: "radialGradient",
    swatches: true,
    count: null
  });
  expect(queryIntent("5 color sunset palette")).toEqual({ style: null, swatches: true, count: 5 });
  expect(queryIntent("two tone pink")).toEqual({ style: null, swatches: false, count: null });
  expect(queryIntent("17 conic").count).toBeNull();
  expect(queryIntent("conic").style).toBe("angularGradient");
});

test("a vocabulary phrase that a padding word joins is never a page of its own", () => {
  expect(padded("navy and gold")).toBe(true);
  expect(padded("landing page")).toBe(true);
  expect(padded("black and white")).toBe(false);
  expect(padded("light to dark blue")).toBe(false);
  expect(padded("light to dark to light")).toBe(true);
  expect(padded("sunset")).toBe(false);
});
