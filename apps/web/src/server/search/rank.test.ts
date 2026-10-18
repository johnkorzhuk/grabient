import { decodeSnapshot, rowOf } from "@grabient/search/snapshot.ts";
import { describe, expect, test } from "vitest";
import { collectionMates, namedPalettes, paletteScores } from "./rank.ts";
import { searchFile } from "./testing.ts";

/* The names the search finds on the shipped snapshot: in one palette's titles (way A), in one collection's title and
   tags (way B), or, when neither holds every word, across a palette's own fields (way C). And the collection-mates that
   lead a palette's likes. */

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

describe("a palette's collection-mates", () => {
  const mates = (seed: string) => {
    const row = shipped.at.get(seed)!;
    const scores = paletteScores(shipped, rowOf(shipped.palettes, shipped.d, row));
    const found = collectionMates(shipped, row, scores);
    expect(found).not.toContain(row);
    expect(new Set(found).size).toBe(found.length);
    expect(found.map(i => scores[i])).toEqual(found.map(i => scores[i]).sort((a, b) => b - a));
    return found;
  };
  const titles = (rows: number[]) => rows.map(i => shipped.titles[i]);

  test("are the nearest palettes its collections hold, nearest first", () => {
    expect(titles(mates("kSPTe3fwAsOk8vq"))).toEqual([
      "Winnipeg Jets inspired color palette",
      "Vancouver Canucks inspired color palette",
      "Detroit Red Wings inspired color palette",
      "St. Louis Blues inspired color palette",
      "Calgary Flames inspired color palette",
      "Toronto Maple Leafs inspired color palette"
    ]);
  });

  test("only as near as a search of Saved asks", () => {
    expect(titles(mates("kST1cKxj3CWSzRU"))).toEqual([
      "Bronze color palette",
      "Amber gold and cream radial gradient",
      "Ochre and bronze color palette"
    ]);
  });

  test("taken from each of its collections in turn", () => {
    const row = shipped.at.get("kY4mpDazO-mUuu_fuLqXU49dvVP6")!;
    const found = mates("kY4mpDazO-mUuu_fuLqXU49dvVP6");
    const holding = shipped.names.filter(name => name.members.includes(row));
    expect([found.length, holding.length]).toEqual([6, 4]);
    for (const name of holding)
      expect(
        found.some(i => name.members.includes(i)),
        name.subject
      ).toBe(true);
  });

  test("and none where no collection holds the palette", () => {
    expect(mates("kWiWqwzCq9lYquzeObz4Ma-w")).toEqual([]);
  });
});
