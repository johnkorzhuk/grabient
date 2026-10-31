import { all, batch, first, replica, run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOff, flagOffKnown, listFlags, setFlag } from "@grabient/server/flags/flags.ts";
import { FLAG_NAMES, STARTS_OFF } from "@grabient/server/flags/names.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeAdmin, testEnv, unique } from "./helpers.ts";

/** Another isolate's view of the same database: a binding object of its own, so it keeps its own copy of the flags.
    `broken` makes every query it sends fail, and `stuck` every query it sends never come back, as one whose request
    was cancelled. */
function isolate() {
  const bound = testEnv();
  const view = { broken: false, stuck: false };
  const DB = new Proxy(bound.DB, {
    get(target, key) {
      if (key === "prepare" && view.broken) {
        return () => {
          throw new Error("D1 is unavailable");
        };
      }
      if (key === "prepare" && view.stuck) {
        return () => ({ bind: () => ({ all: () => new Promise(() => {}) }) });
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
  it("are on until an admin turns one off, but for the newsletter, which waits for an admin to turn it on", async () => {
    const { env } = isolate();
    expect(STARTS_OFF).toEqual(["newsletter"]);
    for (const name of FLAG_NAMES)
      expect([name, await flagOff(env, name)]).toEqual([name, STARTS_OFF.includes(name)]);
    expect((await listFlags(env)).map(flag => [flag.name, flag.on])).toEqual(
      FLAG_NAMES.map(name => [name, !STARTS_OFF.includes(name)])
    );
  });

  it("let an admin turn one that starts off on for every isolate, and off again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const reader = isolate();
    expect(await flagOff(reader.env, "newsletter")).toBe(true);
    const { env } = isolate();
    await setFlag(env, "newsletter", true, unique("admin"));
    expect(await flagOff(env, "newsletter")).toBe(false);
    expect((await listFlags(env)).find(flag => flag.name === "newsletter")?.on).toBe(true);
    vi.advanceTimersByTime(30_001);
    expect(await flagOff(reader.env, "newsletter")).toBe(false);
    await setFlag(env, "newsletter", false, unique("admin"));
    expect(await flagOff(env, "newsletter")).toBe(true);
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

  it("keep what was last read while the table cannot be read, and stay as they start if never read", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const writer = isolate();
    await setFlag(writer.env, "share-images", false, unique("admin"));
    await setFlag(writer.env, "newsletter", true, unique("admin"));
    const reader = isolate();
    expect(await flagOff(reader.env, "share-images")).toBe(true);
    expect(await flagOff(reader.env, "newsletter")).toBe(false);
    reader.broken = true;
    vi.advanceTimersByTime(30_001);
    expect(await flagOff(reader.env, "share-images")).toBe(true);
    expect(await flagOff(reader.env, "newsletter")).toBe(false);
    // an outage never turns a feature off, nor on one that waits for an admin
    const never = isolate();
    never.broken = true;
    expect(await flagOff(never.env, "share-images")).toBe(false);
    expect(await flagOff(never.env, "newsletter")).toBe(true);
  });

  it("never wait on a read another request began, which may never come back", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const writer = isolate();
    await setFlag(writer.env, "share-images", false, unique("admin"));
    const reader = isolate();
    expect(await flagOff(reader.env, "share-images")).toBe(true);
    vi.advanceTimersByTime(30_001);
    reader.stuck = true;
    void flagOff(reader.env, "share-images");
    reader.stuck = false;
    // while that read is out, the isolate answers from what it read
    await setFlag(writer.env, "share-images", true, unique("admin"));
    expect(await flagOff(reader.env, "share-images")).toBe(true);
    // until it has been out ten seconds, when the next request reads them itself
    vi.advanceTimersByTime(10_001);
    expect(await flagOff(reader.env, "share-images")).toBe(false);
    // in an isolate that has not read them, each request reads them itself
    const cold = isolate();
    cold.stuck = true;
    void flagOff(cold.env, "share-images");
    cold.stuck = false;
    expect(await flagOff(cold.env, "share-images")).toBe(false);
  });

  it("are known at once as the isolate read them last, and read again behind the request once for all", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const writer = isolate();
    await setFlag(writer.env, "share-images", false, unique("admin"));
    const reader = isolate();
    const behind: Promise<unknown>[] = [];
    const keep = (work: Promise<unknown>) => void behind.push(work);
    // an isolate that has not read them takes each as it starts, and reads them behind the request, once
    expect(flagOffKnown(reader.env, "share-images", keep)).toBe(false);
    expect(flagOffKnown(reader.env, "newsletter", keep)).toBe(true);
    expect(behind).toHaveLength(1);
    await Promise.all(behind.splice(0));
    expect(flagOffKnown(reader.env, "share-images", keep)).toBe(true);
    expect(behind).toHaveLength(0);
    // past half a minute, a read that never comes back holds no request, and another is made once it has been out ten
    await setFlag(writer.env, "share-images", true, unique("admin"));
    vi.advanceTimersByTime(30_001);
    reader.stuck = true;
    expect(flagOffKnown(reader.env, "share-images", keep)).toBe(true);
    reader.stuck = false;
    expect(flagOffKnown(reader.env, "share-images", keep)).toBe(true);
    expect(behind).toHaveLength(1);
    vi.advanceTimersByTime(10_001);
    expect(flagOffKnown(reader.env, "share-images", keep)).toBe(true);
    expect(behind).toHaveLength(2);
    await behind[1];
    expect(flagOffKnown(reader.env, "share-images", keep)).toBe(false);
  });

  it("leave a request's own read to the request while one begun behind another's answer is out", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const writer = isolate();
    const reader = isolate();
    expect(await flagOff(reader.env, "share-images")).toBe(false);
    await setFlag(writer.env, "share-images", false, unique("admin"));
    vi.advanceTimersByTime(30_001);
    // the read behind an answer never comes back
    reader.stuck = true;
    expect(flagOffKnown(reader.env, "share-images", () => {})).toBe(false);
    reader.stuck = false;
    // the next request reads the flags itself, as it would with no read behind
    expect(await flagOff(reader.env, "share-images")).toBe(true);
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
