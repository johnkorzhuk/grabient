import { describe, expect, test } from "vitest";
import { AS_SAVED, type ListView } from "../list/appearance.ts";
import { listBack } from "./navigation.ts";
import {
  COLLECTION_LIMIT,
  collectionParams,
  type ListPlace,
  listKey,
  listPath,
  listSearch,
  OWN_COLLECTION_LIMIT,
  ownParams,
  pageSearch,
  viewOf,
  viewWith
} from "./params.ts";

/* A collections list's and a collection page's addresses: read one way, written one way, in the lists' own view. */

const query = (text: string) => new URLSearchParams(text);
const BANDS: ListView = {
  style: "linearSwatches",
  steps: 5,
  angle: 45,
  size: { width: 1200, height: 630 }
};

describe("the view an address names", () => {
  test("is every palette's own where the address says nothing it can read", () => {
    expect(viewOf(query(""))).toEqual(AS_SAVED);
    expect(viewOf(query("style=sparkle&steps=many&angle=361&size=1x1"))).toEqual(AS_SAVED);
  });
  test("is each parameter as it stands first, steps never under three", () => {
    expect(viewOf(query("style=linearSwatches&steps=5&angle=45&size=1200x630&steps=9"))).toEqual(
      BANDS
    );
    expect(viewOf(query("steps=1")).steps).toBe(3);
  });
  test("takes from a pasted link only what the page says none of its own", () => {
    const link = query("style=radialGradient&steps=9&angle=10&size=800x600");
    expect(viewWith(BANDS, link)).toEqual(BANDS);
    expect(viewWith(AS_SAVED, link)).toEqual({
      style: "radialGradient",
      steps: 9,
      angle: 10,
      size: { width: 800, height: 600 }
    });
    expect(viewWith({ ...AS_SAVED, angle: 45 }, link)).toMatchObject({ steps: 9, angle: 45 });
    expect(viewWith(BANDS)).toBe(BANDS);
  });
});

describe("a list's address", () => {
  test("is its order's path, a frame past the week's as a last segment", () => {
    expect(listPath("popular")).toBe("/collections");
    expect(listPath("popular", "3m")).toBe("/collections");
    expect(listPath("rising")).toBe("/collections/rising");
    expect(listPath("rising", "1w")).toBe("/collections/rising");
    expect(listPath("rising", "1y")).toBe("/collections/rising/1y");
    expect(listPath("saved", "3m")).toBe("/collections/saved");
  });
  test("writes its query in one order and leaves the defaults out", () => {
    expect(listSearch({})).toBe("");
    expect(listSearch({ query: "", view: AS_SAVED, page: 1, limit: COLLECTION_LIMIT })).toBe("");
    expect(listSearch({ query: "warm sunset & sea", view: BANDS, page: 3, limit: 12 }, true)).toBe(
      "?q=warm+sunset+%26+sea&style=linearSwatches&steps=5&angle=45&size=1200x630&page=3&limit=12&selection"
    );
    expect(listSearch({ view: { ...AS_SAVED, angle: 0 } })).toBe("?angle=0");
    expect(listSearch({}, true)).toBe("?selection");
  });
  test("names the public read its page draws: Saved's is the popular one", () => {
    const place: ListPlace = {
      order: "saved",
      frame: "1w",
      query: "sea",
      page: 2,
      limit: 12,
      view: BANDS
    };
    expect(listKey(place)).toEqual({
      sort: "popular",
      frame: "1w",
      query: "sea",
      page: 2,
      limit: 12
    });
    expect(listKey({ ...place, order: "rising", frame: "1y" })).toMatchObject({
      sort: "rising",
      frame: "1y"
    });
  });
});

describe("a list's query as the API reads it", () => {
  test("keeps a known sort and gives Rising its frame", () => {
    expect(collectionParams(query(""))).toEqual({
      query: "",
      sort: "newest",
      frame: undefined,
      page: 1,
      limit: COLLECTION_LIMIT
    });
    expect(collectionParams(query("sort=rising&frame=3m&q=Sea"))).toMatchObject({
      query: "sea",
      sort: "rising",
      frame: "3m"
    });
    expect(collectionParams(query("sort=rising&frame=2d")).frame).toBe("1w");
    expect(collectionParams(query("sort=hot&frame=3m"))).toMatchObject({
      sort: "hot",
      frame: undefined
    });
    expect(collectionParams(query("sort=best")).sort).toBe("newest");
  });
  test("bounds a public page, and lets an account's own list read more at once", () => {
    expect(collectionParams(query("limit=11")).limit).toBe(COLLECTION_LIMIT);
    expect(collectionParams(query("limit=12")).limit).toBe(12);
    expect(collectionParams(query(`limit=${COLLECTION_LIMIT + 1}`)).limit).toBe(COLLECTION_LIMIT);
    expect(ownParams(query(`limit=${OWN_COLLECTION_LIMIT}`)).limit).toBe(OWN_COLLECTION_LIMIT);
    expect(ownParams(query(`limit=${OWN_COLLECTION_LIMIT + 1}`)).limit).toBe(COLLECTION_LIMIT);
    expect(collectionParams(query("page=10001&limit=1e2"))).toMatchObject({ page: 1, limit: 24 });
  });
});

describe("a collection page's address", () => {
  test("says the view, then the selection while the page shows it", () => {
    expect(pageSearch(AS_SAVED)).toBe("");
    expect(pageSearch(BANDS)).toBe("?style=linearSwatches&steps=5&angle=45&size=1200x630");
    expect(pageSearch({ ...AS_SAVED, steps: 7 }, true)).toBe("?steps=7&selection");
  });
  test("leads back to the list in the page's own order and view until a list was seen", () => {
    expect(listBack("popular", AS_SAVED)).toBe("/collections");
    expect(listBack("rising", { ...AS_SAVED, steps: 7 })).toBe("/collections/rising?steps=7");
  });
});
