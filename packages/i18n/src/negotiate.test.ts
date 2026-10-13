import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { cookieLocale, negotiateLocale, preferredLocale } from "./negotiate.ts";

const golden: {
  acceptLanguage: { header: string; locale: string | null }[];
  cookie: { cookie: string; locale: string | null }[];
  preferred: { headers: Record<string, string>; locale: string | null }[];
} = JSON.parse(readFileSync(new URL("../test/fixtures/negotiate.json", import.meta.url), "utf8"));

test.each(golden.acceptLanguage)("Accept-Language: $header", ({ header, locale }) => {
  expect(negotiateLocale(header)).toBe(locale);
});

test.each(golden.cookie)("Cookie: $cookie", ({ cookie, locale }) => {
  expect(cookieLocale(cookie)).toBe(locale);
});

test.each(golden.preferred)("preferred %#", ({ headers, locale }) => {
  expect(preferredLocale(new Headers(headers))).toBe(locale);
});
