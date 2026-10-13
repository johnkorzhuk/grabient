import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { framePath, nextFrame, type RisingFrame } from "../../lib/orders.ts";
import { listWords } from "../../lib/words.ts";
import { canonicalGallery, galleryPlace, type ListParams, listSearch } from "./address.ts";

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
  size: p.size,
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

  test("Rising's frames in turn, and their addresses", () => {
    for (const [frame, next, offered] of golden.frames.nextFrame) {
      expect([nextFrame(frame), nextFrame(frame, ["1w", "1y"])]).toEqual([next, offered]);
    }
    expect([framePath("/palettes/rising"), framePath("/palettes/rising", "3m")]).toEqual(
      golden.frames.framePath
    );
  });
});
