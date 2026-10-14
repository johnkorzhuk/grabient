import { readFileSync } from "node:fs";
import { parseSize } from "@grabient/engine/view.ts";
import { describe, expect, test } from "vitest";
import { framePath, nextFrame, type RisingFrame } from "../../lib/orders.ts";
import { listWords } from "../../lib/words.ts";
import {
  canonicalGallery,
  galleryPlace,
  type ListParams,
  listHref,
  listIdentity,
  listSearch,
  withView
} from "./address.ts";

/* grabient4's reading of these addresses (krouter.ts), the forms its pages, links and caches were written in */
interface GoldenParams {
  style: string | "auto";
  steps: number | "auto";
  angle: number | "auto";
  size: string;
  page: number;
  limit: number;
  query?: string;
  selection?: boolean;
}
const golden = JSON.parse(
  readFileSync(new URL("fixtures/keys-routes-orders.json", import.meta.url), "utf8")
) as {
  routes: {
    address: string;
    kind: string;
    canonical?: string | null;
    to?: string;
    query?: string;
    sort?: string;
    params?: GoldenParams & { frame?: string; sort?: string };
  }[];
  searches: { params: GoldenParams; search: string }[];
  queries: { raw: string; list: string }[];
  frames: { nextFrame: [RisingFrame, RisingFrame, RisingFrame][]; framePath: string[] };
};

const paramsOf = (p: GoldenParams): ListParams => ({
  words: p.query ?? "",
  style: p.style as ListParams["style"],
  steps: p.steps,
  angle: p.angle,
  size: parseSize(p.size),
  page: p.page,
  limit: p.limit,
  selection: !!p.selection
});
const split = (address: string) => {
  const at = address.indexOf("?");
  return at < 0 ? [address, ""] : [address.slice(0, at), address.slice(at)];
};

describe("gallery addresses", () => {
  const pages = golden.routes.filter(r => ["home", "list", "search", "saved"].includes(r.kind));
  test.each(pages)("$address reads as grabient4 read it", route => {
    const [path, search] = split(route.address);
    const place = galleryPlace(path!, search!)!;
    const { frame, sort, ...params } = route.params!;
    expect(place.params).toEqual(paramsOf(params));
    if (route.kind === "list" || route.kind === "search") {
      expect(place).toMatchObject({ kind: "list", order: route.sort ?? sort });
    }
    if (frame) expect(place).toMatchObject({ frame });
    expect(canonicalGallery(route.address)).toBe(route.canonical ?? route.address);
  });

  test.each(golden.routes.filter(r => r.kind === "redirect"))("$address leads to $to", route => {
    expect(canonicalGallery(route.address)).toBe(route.to);
  });

  test.each(golden.routes.filter(r => r.kind === "notfound"))(
    "$address is no gallery page",
    route => {
      const [path, search] = split(route.address);
      expect(galleryPlace(path!, search!)).toBeNull();
      expect(canonicalGallery(route.address)).toBeNull();
    }
  );

  test.each(golden.searches)("a list's query: $search", ({ params, search }) => {
    expect(listSearch(paramsOf(params))).toBe(search);
  });

  test.each(golden.queries)("the words of $raw", ({ raw, list }) => {
    expect(listWords(raw)).toBe(list);
  });

  test("a list is the same list in any view, and another by its order, frame, words, size, page or owner", () => {
    const identity = (address: string, owner?: string) => {
      const [path, search] = split(address);
      const place = galleryPlace(path!, search!);
      if (!place || place.kind === "home") throw new Error(`${address} is no palette list`);
      return listIdentity(place, owner);
    };
    const searched = identity("/palettes?q=blue");
    expect(
      identity("/palettes?q=blue&style=radialGradient&steps=5&angle=45&size=800x600&selection")
    ).toBe(searched);
    for (const other of [
      "/palettes",
      "/palettes?q=red",
      "/palettes?q=blue&page=2",
      "/palettes?q=blue&limit=48",
      "/palettes/rising?q=blue",
      "/palettes/saved?q=blue"
    ]) {
      expect(identity(other), other).not.toBe(searched);
    }
    expect(identity("/palettes/rising/3m")).not.toBe(identity("/palettes/rising"));
    expect(identity("/palettes/saved?style=linearSwatches&steps=9", "ada")).toBe(
      identity("/palettes/saved", "ada")
    );
    expect(identity("/palettes/saved", "ada")).not.toBe(identity("/palettes/saved", "grace"));
  });

  test("a list's link keeps the words and the view, and starts at the list's first page", () => {
    const at = (address: string) => {
      const [path, search] = split(address);
      return galleryPlace(path!, search!)!.params;
    };
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
    const params = paramsOf({
      style: "auto",
      steps: 9,
      angle: "auto",
      size: "auto",
      page: 1,
      limit: 24
    });
    const linked = new URLSearchParams("style=radialGradient&steps=5&angle=45&size=800x600");
    expect(withView(params, linked)).toMatchObject({
      style: "radialGradient",
      steps: 9,
      angle: 45,
      size: { width: 800, height: 600 }
    });
    expect(withView(params)).toBe(params);
  });

  test("Rising's frames in turn, and their addresses", () => {
    for (const [frame, next, offered] of golden.frames.nextFrame) {
      expect([nextFrame(frame), nextFrame(frame, ["1w", "1y"])]).toEqual([next, offered]);
    }
    expect([framePath("/palettes/rising"), framePath("/palettes/rising", "3m")]).toEqual(
      golden.frames.framePath
    );
  });
});
