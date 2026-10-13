import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { LOCALES } from "./locales.ts";
import {
  canonicalLocalePath,
  delocalizePath,
  isPagePath,
  localizePath,
  splitLocale
} from "./path.ts";

interface Row {
  input: string;
  split: ReturnType<typeof splitLocale>;
  isPagePath: boolean;
  canonicalLocalePath: string | null;
  delocalize: ReturnType<typeof delocalizePath>;
  localize: Record<string, string>;
}
const { paths }: { paths: Row[] } = JSON.parse(
  readFileSync(new URL("../test/fixtures/paths.json", import.meta.url), "utf8")
);

test.each(paths)("$input", row => {
  expect(splitLocale(row.input)).toEqual(row.split);
  expect(isPagePath(row.input)).toBe(row.isPagePath);
  if (row.input.startsWith("/")) {
    expect(canonicalLocalePath(row.input.replace(/[?#].*$/s, ""))).toBe(row.canonicalLocalePath);
  }
  expect(delocalizePath(row.input)).toEqual(row.delocalize);
  expect(Object.fromEntries(LOCALES.map(l => [l, localizePath(row.input, l)]))).toEqual(
    row.localize
  );
});
