// Regression: one rendered palette exists under MANY stored seed strings.
// Globals can be stored separately or tared into coefficient rows; like
// identity must bake them into one globals-free seed.
import { describe, expect, it } from "vitest";
import { paletteCoeffKey } from "../src/palette";
import { likeCoeffKeys, mergeLikeAliases } from "../src/likes";
import {
  aggregateLikesByKey,
  getPaletteLikeInfo,
  getLikeTotalsByKeys,
} from "@repo/data-ops/queries/palettes";
import { serializeCoeffs } from "@repo/data-ops/serialization";
import { tareModifier } from "@repo/data-ops/gradient-gen/cosine";
import { DEFAULT_GLOBALS } from "@repo/data-ops/valibot-schema/grabient";

const TARE_COEFFS = [
  [0.5, 0.4, 0.6, 1],
  [0.3, 0.5, 0.4, 1],
  [1.1, 0.8, 1.2, 1],
  [0.1, 0.3, 0.7, 1],
];
const TARE_GLOBALS = [0.2, 1.4, 0.75, -0.15];
const CUSTOM_GLOBAL_SEED = serializeCoeffs(TARE_COEFFS, TARE_GLOBALS);
let tared = { coeffs: TARE_COEFFS, globals: TARE_GLOBALS };
for (let index = 0; index < 4; index += 1)
  tared = tareModifier(tared.coeffs, tared.globals, index, DEFAULT_GLOBALS[index]);
const TARED_SEED = serializeCoeffs(tared.coeffs, tared.globals);
const DECIMAL_CUSTOM_SEED = [
  ...TARE_COEFFS.flatMap((row) => row.slice(0, 3)),
  ...TARE_GLOBALS,
].join(",");
const CANONICAL = TARED_SEED;
const ALIASES = [CUSTOM_GLOBAL_SEED, DECIMAL_CUSTOM_SEED, TARED_SEED];
const OTHER = "_gEngEngEngFigFRgFMgJjgJMgJUhNtgckg6x";

describe("paletteCoeffKey", () => {
  it("unifies aligned, decimal, and tared aliases of one rendered palette", () => {
    for (const id of ALIASES) expect(paletteCoeffKey(id)).toBe(CANONICAL);
  });

  it("gives a custom-global URL and its visually identical tared URL one key", () => {
    expect(TARED_SEED).not.toBe(CUSTOM_GLOBAL_SEED);
    expect(paletteCoeffKey(CUSTOM_GLOBAL_SEED)).toBe(TARED_SEED);
    expect(paletteCoeffKey(TARED_SEED)).toBe(TARED_SEED);
  });

  it("keeps the same raw coefficients with different rendered globals apart", () => {
    const defaultGlobalSeed = serializeCoeffs(TARE_COEFFS, DEFAULT_GLOBALS);
    expect(paletteCoeffKey(defaultGlobalSeed)).not.toBe(
      paletteCoeffKey(CUSTOM_GLOBAL_SEED),
    );
  });

  it("returns null for unparseable seeds (callers fall back to the raw seed)", () => {
    expect(paletteCoeffKey("not-a-seed")).toBeNull();
  });
});

describe("likeCoeffKeys", () => {
  it("maps stored seeds to coefficient keys, deduped, order kept", () => {
    expect(likeCoeffKeys([ALIASES[0], ALIASES[2], OTHER, ALIASES[1]])).toEqual([
      CANONICAL,
      OTHER,
    ]);
  });
});

describe("mergeLikeAliases", () => {
  it("collapses alias rows to the most recent one per palette", () => {
    const likes = [
      { paletteId: ALIASES[2], createdAtMs: 3 },
      { paletteId: OTHER, createdAtMs: 2 },
      { paletteId: ALIASES[0], createdAtMs: 1 },
    ];
    const merged = mergeLikeAliases(likes);
    expect(merged).toHaveLength(2);
    expect(merged[0].paletteId).toBe(ALIASES[2]);
    expect(merged[1].paletteId).toBe(OTHER);
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
      { paletteId: ALIASES[2], userId: "u1" },
      { paletteId: CANONICAL, userId: "u1" },
      { paletteId: ALIASES[1], userId: "u2" },
    ]);
    expect(totals.get(CANONICAL)?.size).toBe(2);
  });

  it("finds a like stored under the tared seed while viewing its custom-global URL", async () => {
    // Likes stored under the TARED alias carry coeff_key = CANONICAL; a query
    // arriving via the custom-global URL must resolve to the same key. The
    // mock mimics the two bounded reads: the keyed GROUP BY total and the
    // single-row isLiked probe.
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            groupBy: async () => [{ key: CANONICAL, total: 2 }],
            limit: async () => [{ userId: "u1" }],
          }),
        }),
      }),
    };
    await expect(getPaletteLikeInfo(CUSTOM_GLOBAL_SEED, "u1", db)).resolves.toEqual({
      likesCount: 2,
      isLiked: true,
    });
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
    let total = 1;
    let reads = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            groupBy: async () => {
              reads += 1;
              return [{ key: CANONICAL, total }];
            },
          }),
        }),
      }),
    };

    expect((await getLikeTotalsByKeys([CANONICAL], db)).get(CANONICAL)).toBe(1);
    total = 2;
    expect((await getLikeTotalsByKeys([CANONICAL], db)).get(CANONICAL)).toBe(2);
    expect(reads).toBe(2);
  });

  it("returns nothing for an empty key list without touching the database", async () => {
    const db = {
      select: () => {
        throw new Error("must not query");
      },
    };
    expect((await getLikeTotalsByKeys([], db)).size).toBe(0);
  });
});
