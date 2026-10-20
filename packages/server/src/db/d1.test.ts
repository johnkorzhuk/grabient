import { afterEach, describe, expect, it, vi } from "vitest";
import { all, type Db, first } from "./d1.ts";

/** A database whose answers are taken in turn: an Error is thrown, anything else is the rows. Counts its asks. */
function database(...answers: unknown[]) {
  const asks: string[] = [];
  const next = async () => {
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    return answer;
  };
  const db = {
    prepare: (query: string) => ({
      bind: () => ({
        all: async () => {
          asks.push(query);
          return { results: await next() };
        },
        first: async () => {
          asks.push(query);
          return next();
        }
      })
    })
  } as unknown as Db;
  return { db, asks };
}

const lost = () => new Error("D1_ERROR: Network connection lost.");

afterEach(() => {
  vi.useRealTimers();
});

describe("a read D1 could not make", () => {
  it("is asked once more a moment later when the connection dropped or the database restarted", async () => {
    vi.useFakeTimers();
    const dropped = database(lost(), [{ n: 1 }]);
    const read = all(dropped.db, "SELECT n FROM t");
    await vi.advanceTimersByTimeAsync(300);
    expect(await read).toEqual([{ n: 1 }]);
    expect(dropped.asks).toHaveLength(2);

    const restarted = database(new Error("D1_ERROR: D1 DB reset because its code was updated."), {
      n: 2
    });
    const one = first(restarted.db, "WITH x AS (SELECT 2 AS n) SELECT n FROM x");
    await vi.advanceTimersByTimeAsync(300);
    expect(await one).toEqual({ n: 2 });
  });

  it("fails when the second ask fails too", async () => {
    vi.useFakeTimers();
    const twice = database(lost(), lost());
    const read = all(twice.db, "SELECT n FROM t");
    const failed = expect(read).rejects.toThrow("Network connection lost");
    await vi.advanceTimersByTimeAsync(300);
    await failed;
    expect(twice.asks).toHaveLength(2);
  });

  it("is not asked again of a busy database, nor is a write", async () => {
    const busy = database(
      new Error("D1_ERROR: D1 DB is overloaded. Requests queued for too long.")
    );
    await expect(all(busy.db, "SELECT n FROM t")).rejects.toThrow("overloaded");
    expect(busy.asks).toHaveLength(1);

    const written = database(lost());
    await expect(all(written.db, "INSERT INTO t (n) VALUES (1) RETURNING n")).rejects.toThrow(
      "Network connection lost"
    );
    const withWrite = database(lost());
    await expect(
      first(withWrite.db, "WITH x AS (SELECT 1 AS n) UPDATE t SET n = 1 RETURNING n")
    ).rejects.toThrow("Network connection lost");
    expect([written.asks.length, withWrite.asks.length]).toEqual([1, 1]);
  });
});
