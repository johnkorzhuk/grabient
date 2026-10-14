import { msg } from "@grabient/i18n";
import { describe, expect, test } from "vitest";
import { attempt, freshFor } from "./query.ts";

/* What a page shows of a read that failed, and how long an answer stays fresh. */

const FALLBACK = msg("Couldn't load collections.");
const failing = (reason: unknown) => () => Promise.reject(reason);

describe("a read that fails", () => {
  test("says the page's own words when it never reached the server, never the browser's", async () => {
    const network = await attempt(failing(new TypeError("Failed to fetch")), undefined, FALLBACK);
    const timeout = await attempt(
      failing(new DOMException("signal timed out", "TimeoutError")),
      undefined,
      FALLBACK
    );
    const silent = await attempt(failing(new Error()), undefined, FALLBACK);
    expect([network, timeout, silent]).toEqual(
      Array(3).fill({ failed: "Couldn't load collections." })
    );
  });
  test("says the server's words when it refused", async () => {
    expect(await attempt(failing(new Error("Too many requests.")), undefined, FALLBACK)).toEqual({
      failed: "Too many requests."
    });
  });
  test("its reader let go of is no failure", async () => {
    const left = new AbortController();
    left.abort();
    await expect(attempt(failing(new TypeError("aborted")), left.signal, FALLBACK)).rejects.toThrow(
      "aborted"
    );
  });
});

describe("freshness", () => {
  const at = 1_000_000;
  const held = (data: unknown) => ({ state: { data, dataUpdatedAt: at } });
  test("counts from the database read that made the answer", () => {
    expect(freshFor(60_000)(held({ fetchedAt: at - 20_000 }))).toBe(40_000);
  });
  test("is none for a failure, an answer cut short or a list's summary", () => {
    const stale = [
      { failed: "x" },
      { fetchedAt: at, limited: true },
      { fetchedAt: at, provisional: true }
    ];
    expect(stale.map(data => freshFor(60_000)(held(data)))).toEqual([0, 0, 0]);
  });
});
