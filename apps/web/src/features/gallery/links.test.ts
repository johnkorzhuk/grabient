import { expect, test } from "vitest";
import { galleryPlace, listHref, withView } from "./address.ts";

/* Where a list's row and a pasted link lead: the links a page writes from its own address. */

const at = (address: string) => {
  const [path, search = ""] = address.split("?");
  return galleryPlace(path!, search && `?${search}`)!.params;
};

test("a list's link keeps the words and the view, and starts at the list's first page", () => {
  const read = at("/palettes?q=blue&style=linearSwatches&steps=5&page=3&limit=48&selection");
  expect(listHref("palettes", "popular", "1w", read)).toBe(
    "/palettes?q=blue&style=linearSwatches&steps=5&limit=48"
  );
  expect(listHref("palettes", "rising", "3m", read)).toBe(
    "/palettes/rising/3m?q=blue&style=linearSwatches&steps=5&limit=48"
  );
  expect(listHref("palettes", "saved", "1w", at("/?angle=45"))).toBe("/palettes/saved?angle=45");
  // the collections list holds 24 to a page: a larger size stays with the palettes
  expect(listHref("collections", "rising", "1w", read)).toBe(
    "/collections/rising?q=blue&style=linearSwatches&steps=5"
  );
  expect(listHref("collections", "popular", "1w", at("/palettes?limit=12"))).toBe(
    "/collections?limit=12"
  );
});

test("a pasted link's view draws the search it starts wherever the list sets none of its own", () => {
  const params = at("/palettes?steps=9");
  const linked = new URLSearchParams("style=radialGradient&steps=5&angle=45&size=800x600");
  expect(withView(params, linked)).toMatchObject({
    style: "radialGradient",
    steps: 9,
    angle: 45,
    size: { width: 800, height: 600 }
  });
  expect(withView(params)).toBe(params);
});
