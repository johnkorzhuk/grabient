import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_INFO,
  LOCALE_SEGMENTS,
  LOCALES,
  type Locale,
  MENU_ORDER
} from "./locales.ts";
import { messageKey } from "./message-key.ts";
import { dir, formatDate, formatNumber, localHref, setLocaleSource } from "./runtime.ts";

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../test/fixtures/${name}.json`, import.meta.url), "utf8"));
const golden = fixture("locales");
const keys = fixture("message-keys");

test("the locale table", () => {
  expect(LOCALES).toEqual(golden.LOCALES);
  expect(DEFAULT_LOCALE).toBe(golden.DEFAULT_LOCALE);
  expect(LOCALE_COOKIE).toBe(golden.LOCALE_COOKIE);
  expect(MENU_ORDER).toEqual(golden.MENU_ORDER);
  expect(LOCALE_SEGMENTS).toEqual(golden.LOCALE_SEGMENTS);
  expect(LOCALE_INFO).toEqual(golden.LOCALE_INFO);
});

test.each(LOCALES)("numbers, dates, direction and links in %s", (locale: Locale) => {
  const expected = golden.intl[locale];
  setLocaleSource(() => locale);
  const date = Date.UTC(2026, 9, 13, 12, 0, 0);
  expect({
    number: formatNumber(1234567.891),
    percent: formatNumber(0.256, { style: "percent" }),
    integer: formatNumber(2.5, { maximumFractionDigits: 0 }),
    dateMedium: formatDate(date),
    dateLong: formatDate(date, { dateStyle: "long" }),
    monthYear: formatDate(date, { month: "long", year: "numeric" }),
    dir: dir(),
    localHref: {
      about: localHref("/about"),
      home: localHref("/"),
      api: localHref("/api/likes"),
      undef: localHref(undefined) ?? null
    }
  }).toEqual({ ...expected, cardinal: undefined, ordinal: undefined });
  setLocaleSource(() => DEFAULT_LOCALE);
});

test("message keys stay bit for bit", () => {
  for (const [message, key] of Object.entries<string>(keys.keys))
    expect(messageKey(message)).toBe(key);
  for (const [message, key] of Object.entries<string>(keys.samples))
    expect(messageKey(message)).toBe(key);
  for (const { title, description, source } of keys.fingerprints) {
    expect(messageKey(`${title}\n${description}`)).toBe(source);
  }
});
