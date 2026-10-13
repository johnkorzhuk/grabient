import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { formatMessage, formatRich, messageShape, type Params, parseMessage } from "./format.ts";
import type { Locale } from "./locales.ts";

interface Golden {
  formatCases: { message: string; params: Params | null; locale: Locale; out: string }[];
  throws: { message: string; throws: string | null }[];
  shapes: { message: string; shape: ReturnType<typeof messageShape> }[];
  richCase: unknown[];
  richUnknownTag: unknown[];
}
const golden: Golden = JSON.parse(
  readFileSync(new URL("../test/fixtures/format.json", import.meta.url), "utf8")
);

describe("formatMessage", () => {
  test.each(golden.formatCases)("$message in $locale", ({ message, params, locale, out }) => {
    expect(formatMessage(message, params ?? undefined, locale)).toBe(out);
  });
});

test.each(golden.throws)("a malformed message names its place: $message", ({ message, throws }) => {
  expect(() => parseMessage(message)).toThrow(throws ?? "");
});

test.each(golden.shapes)("the shape of $message", ({ message, shape }) => {
  expect(messageShape(message)).toEqual(shape);
});

test("rich messages hand each tag its formatted words and keep unknown tags' words", () => {
  const drawn = formatRich(
    "Read the <link>terms of {site}</link>, then <b>go</b>.",
    { site: "Grabient" },
    "en",
    {
      link: children => ({ a: children }),
      b: children => ({ b: children })
    }
  );
  expect(drawn).toEqual(golden.richCase);
  expect(formatRich("Keep <x>this</x> and <y/>.", {}, "en", {})).toEqual(golden.richUnknownTag);
});
