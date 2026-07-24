// Regression: one palette exists under MANY stored seed strings (legacy ids
// embed view params, v3 ids embed non-default globals). Like identity must
// unify them — these are real aliases observed in the production likes table.
import { describe, expect, it } from "vitest";
import { paletteCoeffKey } from "../src/palette";
import { likeCoeffKeys, mergeLikeAliases } from "../src/likes";
import {
  aggregateLikesByKey,
  getLikesKeyTotals,
} from "@repo/data-ops/queries/palettes";

const CANONICAL = "_gJDgH1gIagIjgL4gJtgDZgFrgDFgAAgguhBd";
const ALIASES = [
  "HQVg7AnANKAMCMMQGYAcSAsYZgGyxlwCZFgTthldkZ4JsCjhYIMoNh5UIg",
  "HQVg7AnANKAMCMMQGYAcSAsYZgGyxlwCZFgTthldkZ4JsCjhYIMoNh5VpPwp5msAgOQZSsIhCA",
  "HQVg7AnANKAMCMMQGYAcSAsYZgGyxlwCZFgTthldkZ4JsCjhYIMoNh5VoBaWT2CCjxmybE1iSofMniA",
  "HQVg7AnANKAMCMMQGYAcSAsYZgGyxlwCZFgTthldkZ4JsCjhYIMoNh5VpnYQkI0eMzBsAtLE7cgA",
  CANONICAL,
];

describe("paletteCoeffKey", () => {
  it("unifies every stored alias of a palette to one coefficient key", () => {
    for (const id of ALIASES) expect(paletteCoeffKey(id)).toBe(CANONICAL);
  });

  it("returns null for unparseable seeds (callers fall back to the raw seed)", () => {
    expect(paletteCoeffKey("not-a-seed")).toBeNull();
  });
});

describe("likeCoeffKeys", () => {
  it("maps stored seeds to coefficient keys, deduped, order kept", () => {
    const other = "_gEngEngEngFigFRgFMgJjgJMgJUhNtgckg6x";
    expect(likeCoeffKeys([ALIASES[0], ALIASES[2], other, ALIASES[1]])).toEqual([
      CANONICAL,
      other,
    ]);
  });
});

describe("mergeLikeAliases", () => {
  it("collapses alias rows to the most recent one per palette", () => {
    const likes = [
      { paletteId: ALIASES[2], createdAtMs: 3 },
      { paletteId: "_gEngEngEngFigFRgFMgJjgJMgJUhNtgckg6x", createdAtMs: 2 },
      { paletteId: ALIASES[0], createdAtMs: 1 },
    ];
    const merged = mergeLikeAliases(likes);
    expect(merged).toHaveLength(2);
    expect(merged[0].paletteId).toBe(ALIASES[2]);
    expect(merged[1].paletteId).toBe("_gEngEngEngFigFRgFMgJjgJMgJUhNtgckg6x");
  });
});

describe("aggregateLikesByKey", () => {
  it("sums distinct users across every alias of a palette", () => {
    const totals = aggregateLikesByKey([
      { paletteId: ALIASES[0], userId: "u1" },
      { paletteId: ALIASES[1], userId: "u2" },
      { paletteId: CANONICAL, userId: "u3" },
    ]);
    expect(totals.get(CANONICAL)?.size).toBe(3);
  });

  it("counts a user who liked multiple aliases only once", () => {
    const totals = aggregateLikesByKey([
      { paletteId: ALIASES[0], userId: "u1" },
      { paletteId: ALIASES[3], userId: "u1" },
      { paletteId: CANONICAL, userId: "u1" },
      { paletteId: ALIASES[1], userId: "u2" },
    ]);
    expect(totals.get(CANONICAL)?.size).toBe(2);
  });

  it("keeps different palettes apart and falls back to raw id for unparseable seeds", () => {
    const totals = aggregateLikesByKey([
      { paletteId: ALIASES[0], userId: "u1" },
      { paletteId: "legacy-unparseable-id", userId: "u1" },
      { paletteId: "legacy-unparseable-id", userId: "u2" },
    ]);
    expect(totals.get(CANONICAL)?.size).toBe(1);
    expect(totals.get("legacy-unparseable-id")?.size).toBe(2);
  });

  it("re-reads durable rows instead of serving a stale per-isolate total", async () => {
    let rows = [{ paletteId: CANONICAL, userId: "u1" }];
    let reads = 0;
    const db = {
      select: () => ({
        from: async () => {
          reads += 1;
          return rows;
        },
      }),
    };

    expect((await getLikesKeyTotals(db)).get(CANONICAL)?.size).toBe(1);
    rows = [
      { paletteId: CANONICAL, userId: "u1" },
      { paletteId: ALIASES[0], userId: "u2" },
    ];
    expect((await getLikesKeyTotals(db)).get(CANONICAL)?.size).toBe(2);
    expect(reads).toBe(2);
  });
});
