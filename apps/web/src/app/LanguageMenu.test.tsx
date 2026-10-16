import { renderToString } from "@solidjs/web";
import { expect, test } from "vitest";
import { LanguageMenu } from "./LanguageMenu.tsx";

/** Each language the menu offers, by its address, and whether a crawler is sent there. */
function followed(path: string, languages?: readonly string[]) {
  const html = renderToString(() => <LanguageMenu path={() => path} languages={languages} />);
  return Object.fromEntries(
    [...html.matchAll(/<a\b[^>]*>/g)].map(([tag]) => [
      /\shref="([^"]*)"/.exec(tag)?.[1],
      !/\srel="nofollow"/.test(tag)
    ])
  );
}

test("a crawler follows the menu to each language a collection's page reads in, and to no other", () => {
  const offered = followed("/ocean-gradients", ["ja", "pt-BR"]);
  expect(Object.keys(offered)).toHaveLength(16);
  expect(
    Object.entries(offered)
      .filter(([, follow]) => follow)
      .map(([href]) => href)
      .sort()
  ).toEqual(["/ja/ocean-gradients", "/ocean-gradients", "/pt-br/ocean-gradients"]);
  expect(Object.values(followed("/ocean-gradients/rising", ["ja"]))).not.toContain(true);
});

test("a crawler follows the menu everywhere on the site's own pages, to English alone on a palette's, and nowhere on Settings", () => {
  expect(Object.values(followed("/about"))).not.toContain(false);
  const palette = followed("/kS7Q8Yy5S_SChv0?steps=9");
  expect(Object.keys(palette).filter(href => palette[href])).toEqual(["/kS7Q8Yy5S_SChv0?steps=9"]);
  expect(Object.values(followed("/settings"))).not.toContain(true);
});
