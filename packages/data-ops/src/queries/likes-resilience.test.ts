import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getLikeTotalsByKeys, toggleLikePaletteByKey } from "./palettes";

// Regression tests for the 2026-08-20 production incident: sporadic D1 read
// failures 500'd the like endpoints. Worst case was the toggle — the write had
// already committed when the post-commit count read threw, so the client
// rolled back its optimistic heart and the user's next click inverted their
// intent. These pin the two behaviors that prevent that: hot-path reads retry
// once, and a failed count read degrades to null instead of failing the
// request.

// A real (non-uniform) production seed; its coefficient key is itself.
const SEED = "_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu";

/**
 * Minimal drizzle stand-in: every builder method returns the same chainable,
 * and each `await` of it consumes the next scripted outcome in order.
 */
function scriptedDb(script: Array<() => Promise<unknown>>) {
  let step = 0;
  const calls: string[] = [];
  const chain: Record<string, unknown> = {};
  for (const m of [
    "select",
    "from",
    "where",
    "groupBy",
    "limit",
    "insert",
    "values",
    "onConflictDoNothing",
    "delete",
    "orderBy",
  ]) {
    chain[m] = (..._args: unknown[]) => {
      calls.push(m);
      return chain;
    };
  }
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) => {
    const s = script[step];
    step += 1;
    const p = s ? s() : Promise.reject(new Error(`scripted db exhausted at await #${step}`));
    return p.then(onFulfilled, onRejected);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: chain as any, calls, awaited: () => step };
}

const ok = (value: unknown) => () => Promise.resolve(value);
const boom = () => () => Promise.reject(new Error("D1_ERROR: internal error"));

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("getLikeTotalsByKeys", () => {
  it("retries a failed chunk read and succeeds on the second attempt", async () => {
    const { db, awaited } = scriptedDb([boom(), ok([{ key: SEED, total: 3 }])]);
    const totals = await getLikeTotalsByKeys([SEED], db);
    expect(awaited()).toBe(2);
    expect(totals.get(SEED)).toBe(3);
  });

  // The first cut of this retried once, immediately, and like-info kept 500ing:
  // an instant retry lands inside the same blip. Three spaced attempts is the
  // behavior that actually absorbs one.
  it("makes three spaced attempts before giving up", async () => {
    const { db, awaited } = scriptedDb([boom(), boom(), ok([{ key: SEED, total: 7 }])]);
    const totals = await getLikeTotalsByKeys([SEED], db);
    expect(awaited()).toBe(3);
    expect(totals.get(SEED)).toBe(7);
  });

  it("still throws when every attempt fails (a real outage stays visible)", async () => {
    const { db } = scriptedDb([boom(), boom(), boom()]);
    await expect(getLikeTotalsByKeys([SEED], db)).rejects.toThrow("D1_ERROR");
  });
});

describe("toggleLikePaletteByKey", () => {
  it("returns liked with a null count when the post-commit count read fails", async () => {
    // alias scan → palettes insert → likes insert → count read fails twice
    const { db, calls } = scriptedDb([ok([]), ok(undefined), ok(undefined), boom(), boom(), boom()]);
    const result = await toggleLikePaletteByKey("user-1", SEED, 5, "linearGradient", 45, db);
    expect(result.liked).toBe(true);
    expect(result.likesCount).toBeNull();
    // the like insert must be conflict-proof against double-fire races
    expect(calls).toContain("onConflictDoNothing");
  });

  it("returns unliked with a null count when the count read fails after a delete", async () => {
    // alias scan finds the row → delete → count read fails twice
    const { db } = scriptedDb([ok([{ paletteId: SEED }]), ok(undefined), boom(), boom(), boom()]);
    const result = await toggleLikePaletteByKey("user-1", SEED, 5, "linearGradient", 45, db);
    expect(result.liked).toBe(false);
    expect(result.likesCount).toBeNull();
  });

  it("returns the real count when everything succeeds", async () => {
    const { db } = scriptedDb([ok([]), ok(undefined), ok(undefined), ok([{ key: SEED, total: 42 }])]);
    const result = await toggleLikePaletteByKey("user-1", SEED, 5, "linearGradient", 45, db);
    expect(result.liked).toBe(true);
    expect(result.likesCount).toBe(42);
  });
});
