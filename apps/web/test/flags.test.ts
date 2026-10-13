import { afterEach, describe, expect, it, vi } from "vitest";
import { all, batch, first, replica, run } from "../src/server/db/d1.ts";
import type { Env } from "../src/server/env.ts";
import { flagOff, listFlags, setFlag } from "../src/server/flags/flags.ts";
import { FLAG_NAMES } from "../src/server/flags/names.ts";
import { countUsage } from "../src/server/usage/count.ts";
import { makeAdmin, testEnv, unique } from "./helpers.ts";

/** Another isolate's view of the same database: a binding object of its own, so it keeps its own copy of the flags.
    `broken` makes every query it sends fail. */
function isolate() {
  const bound = testEnv();
  const view = { broken: false };
  const DB = new Proxy(bound.DB, {
    get(target, key) {
      if (key === "prepare" && view.broken) {
        return () => {
          throw new Error("D1 is unavailable");
        };
      }
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return Object.assign(view, { env: { ...bound, DB } as Env });
}

afterEach(async () => {
  vi.useRealTimers();
  await testEnv().DB.prepare("DELETE FROM k_flags").run();
});

describe("flags", () => {
  it("are all on until an admin turns one off", async () => {
    const { env } = isolate();
    for (const name of FLAG_NAMES) expect([name, await flagOff(env, name)]).toEqual([name, false]);
    expect((await listFlags(env)).map(flag => [flag.name, flag.on])).toEqual(
      FLAG_NAMES.map(name => [name, true])
    );
  });

  it("change at once in the isolate that wrote, and say who changed them", async () => {
    const { env } = isolate();
    const admin = await makeAdmin(env);
    await run(env.DB, "UPDATE auth_user SET username = ? WHERE id = ?", "curator", admin.id);
    expect(await flagOff(env, "share-images")).toBe(false);
    await setFlag(env, "share-images", false, admin.id);
    expect(await flagOff(env, "share-images")).toBe(true);
    expect(await flagOff(isolate().env, "share-images")).toBe(true);
    const listed = (await listFlags(env)).find(flag => flag.name === "share-images");
    expect(listed).toMatchObject({ on: false, updatedBy: "curator" });
    expect(listed?.updatedAt).toBeGreaterThan(0);
    await setFlag(env, "share-images", true, admin.id);
    expect(await flagOff(env, "share-images")).toBe(false);
  });

  it("are all off while `all` is", async () => {
    const { env } = isolate();
    await setFlag(env, "all", false, unique("admin"));
    for (const name of FLAG_NAMES) expect([name, await flagOff(env, name)]).toEqual([name, true]);
  });

  it("reach another isolate within half a minute", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const reader = isolate();
    expect(await flagOff(reader.env, "mcp")).toBe(false);
    await setFlag(isolate().env, "mcp", false, unique("admin"));
    expect(await flagOff(reader.env, "mcp")).toBe(false);
    vi.advanceTimersByTime(30_001);
    expect(await flagOff(reader.env, "mcp")).toBe(true);
  });

  it("keep what was last read while the table cannot be read, and stay on if never read", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const writer = isolate();
    await setFlag(writer.env, "newsletter", false, unique("admin"));
    const reader = isolate();
    expect(await flagOff(reader.env, "newsletter")).toBe(true);
    reader.broken = true;
    vi.advanceTimersByTime(30_001);
    expect(await flagOff(reader.env, "newsletter")).toBe(true);
    const never = isolate();
    never.broken = true;
    expect(await flagOff(never.env, "newsletter")).toBe(false);
  });
});

describe("the D1 helpers", () => {
  it("read rows typed, run writes, and apply a batch whole or not at all", async () => {
    const env = testEnv();
    const name = unique("flag");
    const changed = await run(
      env.DB,
      "INSERT INTO k_flags (name, enabled, updated_at) VALUES (?, 0, ?)",
      name,
      1
    );
    expect(changed.changes).toBe(1);
    expect(
      await first<{ enabled: number }>(env.DB, "SELECT enabled FROM k_flags WHERE name = ?", name)
    ).toEqual({
      enabled: 0
    });
    await expect(
      batch(env.DB, [
        ["UPDATE k_flags SET enabled = 1 WHERE name = ?", name],
        ["INSERT INTO k_flags (name, enabled, updated_at) VALUES (?, 5, 0)", unique("bad")]
      ])
    ).rejects.toThrow();
    expect(await all(env.DB, "SELECT enabled FROM k_flags WHERE name = ?", name)).toEqual([
      { enabled: 0 }
    ]);
    const done = await batch(env.DB, [["UPDATE k_flags SET enabled = 1 WHERE name = ?", name]]);
    expect(done[0]?.meta.changes).toBe(1);
  });

  it("read through a replica session that sees what was written before it", async () => {
    const env = testEnv();
    const name = unique("seen");
    await run(env.DB, "INSERT INTO k_flags (name, enabled, updated_at) VALUES (?, 1, 0)", name);
    const session = replica(env);
    expect(await all(session, "SELECT name FROM k_flags WHERE name = ?", name)).toEqual([{ name }]);
    expect(session.getBookmark()).toBeTruthy();
  });
});

describe("usage counts", () => {
  it("write one point per event, and never fail a request", () => {
    const points: unknown[] = [];
    countUsage(
      { USAGE: { writeDataPoint: point => void points.push(point) } },
      "image",
      "card",
      "x".repeat(200)
    );
    expect(points).toEqual([
      { indexes: ["image"], blobs: ["image", "card", "x".repeat(96)], doubles: [1] }
    ]);
    expect(() => countUsage({}, "image")).not.toThrow();
    const failing = {
      writeDataPoint: () => {
        throw new Error("Analytics Engine is unavailable");
      }
    };
    expect(() => countUsage({ USAGE: failing }, "limit", "emailAsk", "client")).not.toThrow();
  });
});
