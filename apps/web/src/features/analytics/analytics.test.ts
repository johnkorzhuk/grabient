import { expect, test } from "vitest";
import { accountKey, cleanPage, pageKey } from "./analytics.ts";
import { readConsent } from "./consent.ts";

test("GA4 knows an account by a 64-bit hash of its id, the same one the site always sent", () => {
  expect(accountKey("user_1")).toBe("f7a196aa74b9b772");
  expect(accountKey("Q2x8kP0vZr")).toBe("29275c5af3c44c2f");
  expect(accountKey("ñandú-é")).toBe("ebf995715861ebbe");
});

test("a page's address keeps its view and page, and a visit's first page its campaign, never a token", () => {
  expect(
    cleanPage("https://grabient.com/settings?token=secret&style=radialGradient&page=2&q=blue")
  ).toBe("https://grabient.com/settings?style=radialGradient&page=2");
  expect(
    cleanPage(
      "https://grabient.com/ja/palettes",
      "https://grabient.com/?utm_source=news&utm_medium=email&gclid=x"
    )
  ).toBe("https://grabient.com/ja/palettes?utm_source=news&utm_medium=email");
});

test("a page is counted by its address and its words, never its view or its language", () => {
  expect(pageKey("/ja/palettes", "?style=radialGradient&page=2")).toBe("/palettes");
  expect(pageKey("/palettes", "?q=blue&steps=9")).toBe("/palettes\nblue");
  expect(pageKey("/kS7Q8Yy5S_SChv0", "?angle=45")).toBe("/kS7Q8Yy5S_SChv0");
});

test("a choice the reader made stands; one never made is decided again", () => {
  const made = {
    version: 3,
    timestamp: 1,
    hasInteracted: true,
    isGdprRegion: false,
    categories: { necessary: true, analytics: false, sessionReplay: true, marketing: true }
  };
  expect(readConsent(JSON.stringify(made))).toEqual(made);
  expect(readConsent(JSON.stringify({ ...made, hasInteracted: false }))).toBeNull();
  expect(readConsent(JSON.stringify({ ...made, version: 2 }))).toBeNull();
  expect(readConsent("{not json")).toBeNull();
  /* made before Marketing had a switch: the old advertising switch, else analytics outside the strict regions */
  const { marketing: _, ...older } = made.categories;
  expect(
    readConsent(JSON.stringify({ ...made, categories: { ...older, advertising: true } }))
      ?.categories.marketing
  ).toBe(true);
  expect(
    readConsent(JSON.stringify({ ...made, categories: { ...older, analytics: true } }))?.categories
      .marketing
  ).toBe(true);
  expect(
    readConsent(
      JSON.stringify({ ...made, isGdprRegion: true, categories: { ...older, analytics: true } })
    )?.categories.marketing
  ).toBe(false);
});
