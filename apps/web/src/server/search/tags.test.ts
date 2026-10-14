import { expect, test } from "vitest";
import {
  homeTags,
  mixTags,
  popularSearches,
  searchSuggestionsResponse,
  suggestionsFor,
  suggestSearches,
  tagsKey
} from "./tags.ts";
import { fixture, searchEnv } from "./testing.ts";

const golden = fixture<{
  popularNoDb: { label: string; href: string; query: string; colors: string[] }[];
  typed: Record<string, string[]>;
  mix: { plain: string[]; cut: string[]; labelled: string[] };
  homeTagsNoDb: string[];
  cache: Record<"typed" | "rest" | "seed", Record<string, string>>;
}>("tags-row.json");
const env = searchEnv();

test("the row at rest, as tags with their colors and addresses", async () => {
  const tags = await popularSearches(env, 24);
  expect(tags.map(({ label, href, query, colors }) => ({ label, href, query, colors }))).toEqual(
    golden.popularNoDb
  );
});

test("what is typed is answered by the phrases it means, begins, holds or is a letter from", async () => {
  for (const [typed, queries] of Object.entries(golden.typed)) {
    expect(
      (await suggestSearches(env, typed, 12)).map(tag => tag.query),
      typed
    ).toEqual(queries);
  }
});

test("the home's row mixes searches and collections, and no tag says a word twice", async () => {
  expect((await homeTags(env, "", 24)).map(tag => tag.label)).toEqual(golden.homeTagsNoDb);
  expect(mixTags(["s1", "s2", "s3"], ["c1", "c2"], 24)).toEqual(golden.mix.plain);
  expect(mixTags(["s1", "s2", "s3"], ["c1", "c2", "c3"], 4)).toEqual(golden.mix.cut);
  expect(
    mixTags(["red", "jade", "blue"], ["Red swatches", "Moss", "Blue gradients"], 24, tag => tag)
  ).toEqual(golden.mix.labelled);
});

test("typed answers are kept an hour, the row five minutes", async () => {
  const get = (query: string) =>
    searchSuggestionsResponse(
      new Request(`https://grabient.test/api/search-suggestions?${query}`),
      env
    );
  const kept = (response: Response) => ({ "Cache-Control": response.headers.get("Cache-Control") });
  const typed = await get("q=blu&limit=3");
  expect(kept(typed)).toEqual(golden.cache.typed);
  expect(
    ((await typed.json()) as { suggestions: { query: string }[] }).suggestions.map(t => t.query)
  ).toEqual(golden.typed.blu.slice(0, 3));
  expect(kept(await get("limit=3"))).toEqual(golden.cache.rest);
  expect(kept(await get("q=kS7Q8Yy5S_SChv0"))).toEqual(golden.cache.seed);
});

test("the edge keeps the tags by what their answer reads: the words as typed, how many, the row, the language", () => {
  const key = (query: string) => tagsKey(new URLSearchParams(query)).toString();
  expect(key("q=%20Dark%20%20BLUE&limit=99&junk=1&lang=en")).toBe("q=dark+blue&limit=24");
  expect(key("q=kS7Q8Yy5S_SChv0&both=1")).toBe("q=kS7Q8Yy5S_SChv0&limit=12");
  expect(key("both=1&lang=ja")).toBe("q=&limit=24&both=1&lang=ja");
  expect(key("both=1&limit=1")).toBe("q=&limit=2&both=1");
  expect(key("limit=junk&lang=xx")).toBe("q=&limit=12");
});

test("a tag says its words in the language asked, where Grabient translated them, and leads to the same search", async () => {
  const translated = searchEnv({
    DB: {
      prepare: (sql: string) => ({
        bind: (locale: string) => ({
          all: async () => ({
            results:
              sql.includes("kind = 'tag'") && locale === "ja" ? [{ key: "blue", title: "青" }] : []
          })
        })
      })
    } as unknown as D1Database
  });
  const tags = async (query: string) =>
    (await suggestionsFor(translated, new URLSearchParams(query))).map(tag => [
      tag.label,
      tag.href
    ]);
  expect((await tags("q=blue&limit=1&lang=ja"))[0]).toEqual(["青", "/palettes?q=blue"]);
  expect((await tags("q=blue&limit=1"))[0]).toEqual(["blue", "/palettes?q=blue"]);
  expect((await tags("q=blue&limit=1&lang=de"))[0]).toEqual(["blue", "/palettes?q=blue"]);
});
