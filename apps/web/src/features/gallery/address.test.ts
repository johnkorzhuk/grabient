import { readFileSync } from "node:fs";
import { EFFECT_LOOK } from "@grabient/engine/effect.ts";
import { parseSize } from "@grabient/engine/view.ts";
import { describe, expect, test } from "vitest";
import { framePath, nextFrame, type RisingFrame } from "../../lib/orders.ts";
import { listWords } from "../../lib/words.ts";
import { AS_SAVED, inOrder, type ListView, viewParams } from "../list/appearance.ts";
import {
  canonicalGallery,
  galleryPlace,
  type ListParams,
  listIdentity,
  listSearch
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
  soft: 0,
  grain: 0,
  size: parseSize(p.size),
  page: p.page,
  limit: p.limit,
  selection: !!p.selection,
  effect: null
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

  test("a list playing an effect has one address: its style, angle and size, then how it plays and looks", () => {
    for (const [address, to] of [
      [
        "/palettes?bg=112233&frost=1.50&style=blob&steps=9&shape=3",
        "/palettes?style=blob&frost=1.5&bg=%23112233"
      ],
      [
        "/palettes/rising?q=sea&speed=1&fps=60&angle=45&style=glass&frost=2",
        "/palettes/rising?q=sea&style=glass&angle=45"
      ],
      ["/?page=2&speed=0&size=1200x630&style=glass", "/?style=glass&size=1200x630&speed=0&page=2"],
      ["/palettes/saved?style=blob&fps=120&bg=%23ffffff00", "/palettes/saved?style=blob&fps=120"],
      // a gradient's list reads none of an effect's parameters
      ["/palettes?style=radialGradient&speed=2&frost=1.5", "/palettes?style=radialGradient"]
    ])
      expect(canonicalGallery(address), address).toBe(to);
    expect(canonicalGallery("/palettes?style=blob&frost=1.5&bg=%23112233")).toBe(
      "/palettes?style=blob&frost=1.5&bg=%23112233"
    );
  });

  test("the app writes a list's view as the Worker does, so a reload is never redirected", () => {
    /* as the router writes a search: each value there in its order, a number as its digits, a word as it is */
    const written = (search: Record<string, unknown>) => {
      const query = new URLSearchParams();
      for (const [name, value] of Object.entries(search))
        if (value !== undefined) query.set(name, String(value));
      return `?${query}`;
    };
    const views: ListView[] = [
      { ...AS_SAVED, style: "linearSwatches", steps: 9, angle: 45 },
      {
        ...AS_SAVED,
        angle: 10,
        size: { width: 1200, height: 630 },
        effect: { kind: "glass", speed: 0.25, fps: 120, look: EFFECT_LOOK }
      },
      {
        ...AS_SAVED,
        effect: {
          kind: "blob",
          speed: 0,
          fps: 60,
          look: { shape: null, frost: 0.35, bg: "#10101480", steps: null, zoom: null, path: null }
        }
      }
    ];
    for (const view of views) {
      const address = `/palettes${written(inOrder({ q: "warm sea", page: 2 }, viewParams(view)))}`;
      expect(canonicalGallery(address)).toBe(address);
    }
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
