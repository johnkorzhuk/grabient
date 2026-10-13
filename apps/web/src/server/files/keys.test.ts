import { expect, test } from "vitest";
import golden from "./fixtures/cache-keys.json" with { type: "json" };
import { fileCacheKey } from "./keys.ts";

/** A key as the fixture writes it: path and sorted query, without the card version a picture's key adds. */
function written(address: string) {
  const url = new URL(address, "https://grabient.test");
  const key = fileCacheKey(url.pathname, url.searchParams);
  if (!key) return null;
  const query = new URLSearchParams(key.query);
  if (key.acrossBuilds) {
    expect(query.get("v")).toBe("k4");
    query.delete("v");
  }
  query.sort();
  return { key: `${key.path}${query.size ? `?${query}` : ""}`, acrossBuilds: key.acrossBuilds };
}

test("every address of one file or picture has one key, which no stray parameter enters", () => {
  for (const row of golden.keys) {
    if (row.address.startsWith("/favicon/")) continue;
    // A collection's swatch file reads no query, so a junk parameter no longer makes a key of its own.
    const want = row.address.startsWith("/ocean-gradients.ase") ? "/ocean-gradients.ase" : row.key;
    expect([row.address, written(row.address)?.key]).toEqual([row.address, want]);
  }
});

test("a picture is kept across deploys under its card version, a text file for one build", () => {
  expect(written("/kS7Q8Yy5S_SChv0.png")?.acrossBuilds).toBe(true);
  expect(written("/api/og?seed=kS7Q8Yy5S_SChv0")?.acrossBuilds).toBe(true);
  expect(written("/api/png/collection?slug=ocean-gradients")?.acrossBuilds).toBe(true);
  expect(written("/kS7Q8Yy5S_SChv0.css")?.acrossBuilds).toBe(false);
  expect(written("/ocean-gradients.md")?.acrossBuilds).toBe(false);
});

test("an old card's address shares the card's key, and other addresses are no file's", () => {
  expect(written("/og/k4/kS7Q8Yy5S_SChv0.png?style=radialGradient")?.key).toBe(
    written("/api/og?seed=kS7Q8Yy5S_SChv0&v=k4")?.key
  );
  expect(written("/kS7Q8Yy5S_SChv0.tokens.json?steps=9&junk=1")?.key).toBe(
    "/kS7Q8Yy5S_SChv0.tokens.json?steps=9"
  );
  expect(
    written("/_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu.svg?style=radialGradient&steps=12")?.key
  ).toBe("/kY4mpDazO-mUuu_fuLqXU49dvVP6.svg?steps=12&style=radialGradient");
  expect(written("/palettes")).toBeNull();
  expect(written("/kS7Q8Yy5S_SChv0")).toBeNull();
  expect(written("/api/hot")).toBeNull();
});
