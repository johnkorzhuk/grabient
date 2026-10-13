import { afterEach, expect, test } from "vitest";
import type { Locale } from "./locales.ts";
import { contextKey, messageKey } from "./message-key.ts";
import {
  addCatalog,
  addCatalogLoader,
  inLocale,
  msg,
  rich,
  setLocaleSource,
  t,
  translate
} from "./runtime.ts";

const PALETTES = "{count, plural, one {# palette} other {# palettes}}";
let reader: Locale = "en";
setLocaleSource(() => reader);
afterEach(() => {
  reader = "en";
});

addCatalog("ja", {
  [messageKey("Copy link")]: "リンクをコピー",
  [messageKey(PALETTES)]: "{count, plural, other {# 個のパレット}}",
  [messageKey(contextKey("Saved", "order"))]: "保存済み順",
  [messageKey("Read the <link>terms</link>.")]: "<link>規約</link>をお読みください。"
});

test("t speaks the reader's language and falls back to formatted English", () => {
  expect(t("Copy link")).toBe("Copy link");
  reader = "ja";
  expect(t("Copy link")).toBe("リンクをコピー");
  expect(t(PALETTES, { count: 1234 })).toBe("1,234 個のパレット");
  // untranslated: English, counted the English way
  expect(t("{count, plural, one {# stop} other {# stops}}", { count: 1 })).toBe("1 stop");
});

test("a context picks its own translation", () => {
  reader = "ja";
  expect(t(msg("Saved", "order"), { $context: "order" })).toBe("保存済み順");
  expect(t("Saved")).toBe("Saved");
});

test("translate and inLocale name a language for one call", () => {
  expect(translate("ja", "Copy link")).toBe("リンクをコピー");
  reader = "ja";
  expect(inLocale("en", () => t("Copy link"))).toBe("Copy link");
  expect(t("Copy link")).toBe("リンクをコピー");
});

test("rich moves the page's parts with the translated words", () => {
  reader = "ja";
  expect(rich("Read the <link>terms</link>.", { link: words => ({ link: words }) })).toEqual([
    { link: ["規約"] },
    "をお読みください。"
  ]);
});

test("a catalog loader runs once, when its language is first asked for", () => {
  let loads = 0;
  addCatalogLoader("ko", () => {
    loads++;
    return { [messageKey("Copy link")]: "링크 복사" };
  });
  expect(loads).toBe(0);
  reader = "ko";
  expect(t("Copy link")).toBe("링크 복사");
  expect(t("Copy link")).toBe("링크 복사");
  expect(loads).toBe(1);
});
