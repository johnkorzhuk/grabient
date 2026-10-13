import type { Locale } from "@grabient/i18n";
import { setLocaleSource } from "@grabient/i18n";
import { afterEach, expect, test } from "vitest";
import { monthOf } from "./month.ts";

const inLanguage = (tag: Locale) => setLocaleSource(() => tag);
afterEach(() => inLanguage("en"));

test("an issue's month is said in the reader's language, with Latin digits", () => {
  expect(monthOf("2026-10")).toBe("October 2026");
  inLanguage("ar");
  expect(monthOf("2026-10")).toMatch(/2026/);
  inLanguage("fa");
  expect(monthOf("2026-10")).toMatch(/2026/);
  inLanguage("th");
  expect(monthOf("2026-10")).toMatch(/2569/);
});
