import { expect, test } from "vitest";
import {
  homeTags,
  mixTags,
  popularSearches,
  searchSuggestionsResponse,
  suggestionsCache,
  suggestSearches
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
  expect(suggestionsCache("blu")).toEqual(golden.cache.typed);
  expect(suggestionsCache("")).toEqual(golden.cache.rest);
  expect(suggestionsCache("kS7Q8Yy5S_SChv0")).toEqual(golden.cache.seed);
  const response = await searchSuggestionsResponse(
    new Request("https://grabient.test/api/search-suggestions?q=blu&limit=3"),
    env
  );
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
  expect(
    ((await response.json()) as { suggestions: { query: string }[] }).suggestions.map(t => t.query)
  ).toEqual(golden.typed.blu.slice(0, 3));
});
