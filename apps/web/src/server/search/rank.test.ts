import { decodeSnapshot } from "@grabient/search/snapshot.ts";
import { expect, test } from "vitest";
import { namedPalettes } from "./rank.ts";
import { searchFile } from "./testing.ts";

/* The names the search finds on the shipped snapshot: in one palette's titles (way A), in one collection's title and
   tags (way B), or, when neither holds every word, across a palette's own fields (way C). */

const shipped = decodeSnapshot(searchFile("snapshot.bin"));
const NASHVILLE = shipped.at.get("kSPTe3fwAsOk8vq")!;
const named = (query: string) => namedPalettes(shipped, query.split(" "));

test("a palette's title names it, a slip off as well", () => {
  expect(shipped.titles[NASHVILLE]).toBe("Nashville Predators inspired palette");
  for (const query of ["nashville predators", "predators", "nashvile"])
    expect(named(query), query).toEqual({ rows: [NASHVILLE], names: [] });
});

test("a collection's title and tags name its palettes", () => {
  const thaw = shipped.names.find(name => name.subject === "alpine thaw")!;
  expect(named("crisp")).toEqual({ rows: thaw.members, names: ["alpine thaw"] });
  expect(thaw.members).toHaveLength(25);
});

test("words no one title or collection holds name the palettes whose own fields hold them between them", () => {
  for (const query of ["nhl nashville", "nashville hockey", "hockey predators", "nhl nashvile"])
    expect(named(query), query).toEqual({ rows: [NASHVILLE], names: ["nhl team"] });
  expect(named("nhl lakers")).toBeNull();
});
