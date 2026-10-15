import { decodePalette } from "@grabient/engine";
import { describe, expect, test } from "vitest";
import { canonicalRedirect } from "../canonical.ts";
import { countLegacy, legacyRedirect, legacySeed, oldAddress } from "./legacy.ts";

describe("old grabient.com addresses", () => {
  test("an old seed the maps hold leads to its keyframe palette at the link's view, its editor's address too", () => {
    expect(oldAddress("/_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu/edit?steps=9&angle=120")).toEqual({
      to: "/kY4mpDazO-mUuu_fuLqXU49dvVP6?steps=9&angle=120",
      via: "mapped"
    });
    expect(legacyRedirect("/_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu")).toBe(
      "/kY4mpDazO-mUuu_fuLqXU49dvVP6"
    );
  });

  test("an lz-string id is read as grabient.com read it: to the palette its `_` form maps to, else to that form", () => {
    expect(
      legacyRedirect("/LQBgdAjALAHANGAbBECoFZ6kgJldnCAZgRxhOyJwvChH3B3UTmwgE51XwUXt6IQA")
    ).toBe("/kWiWqwzCq9lYquzeObz4Ma-w");
    // only the view rides along: a page, a limit or a selection is no old palette's
    expect(
      oldAddress("/HQVgDGA0od5TB86wIzAldnLdggZiOgDYSB2IA?page=6&style=linearSwatches&selection")
    ).toEqual({ to: "/_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKb?style=linearSwatches", via: "fitted" });
  });

  test("an old seed no map holds stands at its own address with its view, where the Worker fits it; one nothing can read stays as it is; no other rule reads either as words", () => {
    expect(
      oldAddress("/_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKa/edit?page=2&angle=30&steps=7")
    ).toEqual({ to: "/_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKa?angle=30", via: "fitted" });
    expect(oldAddress("/~abcdefg?style=radialGradient")).toEqual({ to: null, via: "fitted" });
    for (const address of [
      "/_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKa?style=radialGradient",
      "/~abcdefg?style=radialGradient"
    ]) {
      expect(legacyRedirect(address)).toBe(address);
      expect(canonicalRedirect(address, [legacyRedirect, () => "/words"])).toBeNull();
    }
  });

  test("every other address is another rule's", () => {
    for (const address of [
      "/_abc",
      "/blue",
      "/ocean-gradients",
      "/ocean-gradients-and-blues",
      "/kS7Q8Yy5S_SChv0",
      "/kS7Q8Yy5S_SChv0/edit",
      "/palettes",
      "/palettes/rising",
      "/%E0%A4%A",
      "/"
    ]) {
      expect([address, oldAddress(address), legacyRedirect(address)]).toEqual([
        address,
        null,
        null
      ]);
    }
  });

  test("a palette is never drawn with fewer steps than it has keyframes", () => {
    const seed = legacySeed("_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu")!;
    const keyframes = decodePalette(seed)!.anchors.length;
    const steps = Math.max(3, keyframes);
    const query = steps === 7 ? "" : `?steps=${steps}`;
    expect(legacyRedirect("/_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu?steps=3")).toBe(
      `/${seed}${query}`
    );
  });
});

test("each old address is counted by how it resolved, readers apart from crawlers", () => {
  const points: { blobs?: string[] }[] = [];
  const env = { USAGE: { writeDataPoint: (point: { blobs?: string[] }) => points.push(point) } };
  const reader = new Request("https://grabient.com/x", {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  const crawler = new Request("https://grabient.com/x", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }
  });
  const usage = env as unknown as Parameters<typeof countLegacy>[0];
  countLegacy(usage, reader, "/_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu");
  countLegacy(usage, crawler, "/HQVgDGA0od5TB86wIzAldnLdggZiOgDYSB2IA");
  countLegacy(usage, reader, "/blue");
  expect(points.map(point => point.blobs)).toEqual([
    ["legacy", "mapped", "reader"],
    ["legacy", "fitted", "crawler"]
  ]);
});
