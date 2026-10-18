import { decodeSnapshot, rowOf, type Snapshot } from "@grabient/search/snapshot.ts";
import { describe, expect, test } from "vitest";
import { collectionMates, namedPalettes, paletteScores, titled } from "./rank.ts";
import { searchFile } from "./testing.ts";

/* The names the search finds on the shipped snapshot: in one palette's titles (way A), in one collection's title and
   tags (way B), or, when neither holds every word, across a palette's own fields (way C). And the collection-mates that
   lead the palettes like a palette. */

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

describe("the words a public collection gives a palette", () => {
  /* the Nashville palette as an admin's collection might title and describe it, the description naming a word of a
     title (bruins) and of a tag (crisp) as well */
  const worded: Snapshot = {
    ...shipped,
    titles: shipped.titles.map((title, row) =>
      row === NASHVILLE ? `${title}\nSmashville gold` : title
    ),
    described: shipped.described.map((words, row) =>
      row === NASHVILLE ? "bridgestone bruins crisp preds" : words
    )
  };
  const answer = (query: string) => namedPalettes(worded, query.split(" "));

  test("a title names it alone, a slip off as well", () => {
    for (const query of ["smashville", "smashvile"])
      expect(answer(query), query).toEqual({ rows: [NASHVILLE], names: [] });
    expect(answer("smashville hockey")).toEqual({ rows: [NASHVILLE], names: ["nhl team"] });
  });

  test("a description's names name it as written, only where no title or collection answers", () => {
    for (const query of ["preds", "bridgestone", "bridgestone nhl"])
      expect(answer(query), query).toEqual({
        rows: [NASHVILLE],
        names: query.includes("nhl") ? ["nhl team"] : []
      });
    expect(answer("predz")).toBeNull();
    const thaw = shipped.names.find(name => name.subject === "alpine thaw")!;
    expect(answer("crisp")).toEqual({ rows: thaw.members, names: ["alpine thaw"] });
    const bruins = shipped.at.get("kSJAc85L2__sDv-")!;
    expect(answer("bruins")).toEqual({ rows: [bruins], names: [] });
    expect(answer("nhl lakers")).toBeNull();
  });

  test("decide the vocabulary's reading as a title does, and a description's names never do", () => {
    expect([titled(worded, ["smashville"]), titled(shipped, ["smashville"])]).toEqual([
      true,
      false
    ]);
    expect(titled(worded, ["preds"])).toBe(false);
  });
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
