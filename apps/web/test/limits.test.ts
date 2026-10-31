import { listDurableObjectIds, runInDurableObject } from "cloudflare:test";
import { overLimit } from "@grabient/server/auth/http.ts";
import { PAUSED, setFlag } from "@grabient/server/flags/flags.ts";
import { checkLimits, type LimitCheck, limiterName } from "@grabient/server/limits/check.ts";
import { workChecks, writeRefusal } from "@grabient/server/limits/writes.ts";
import { describe, expect, it, vi } from "vitest";
import { testEnv, unique, watchLimits } from "./helpers.ts";

describe("the RateLimiter object", () => {
  it("is named by a hash and keeps counts under the limits' names alone", async () => {
    const bound = testEnv();
    const namespace = bound.RATE_LIMITER!;
    const { env } = watchLimits(bound);
    const who = unique("email-to:reader@example.test");
    for (let i = 0; i < 3; i++)
      expect((await checkLimits(env, [[who, "emailRecipient"]]))?.success).toBe(true);
    const named = namespace.idFromName(await limiterName(who));
    const ids = (await listDurableObjectIds(namespace)).map(id => id.toString());
    expect(ids).toContain(named.toString());
    expect(ids).not.toContain(namespace.idFromName(who).toString());
    const stored = await runInDurableObject(namespace.get(named), async (_, state) => [
      ...(await state.storage.list()).entries()
    ]);
    expect(stored).toHaveLength(1);
    expect(stored[0]![0]).toBe("emailRecipient");
    expect(stored[0]![1]).toMatchObject({ count: 3 });
  });

  it("refuses past a limit and keeps the count it had", async () => {
    const bound = testEnv();
    const { env } = watchLimits(bound);
    const who = unique("ask");
    const answers = [];
    for (let i = 0; i < 6; i++)
      answers.push((await checkLimits(env, [[who, "emailAsk"]]))?.success);
    expect(answers).toEqual([true, true, true, true, true, false]);
    // Another isolate asks the object, which refuses and counts nothing.
    const { env: other } = watchLimits(bound);
    expect((await checkLimits(other, [[who, "emailAsk"]]))?.success).toBe(false);
    const namespace = bound.RATE_LIMITER!;
    const stub = namespace.get(namespace.idFromName(await limiterName(who)));
    const count = await runInDurableObject(stub, (_, state) =>
      state.storage.get<{ count: number }>("emailAsk")
    );
    expect(count?.count).toBe(5);
  });
});

describe("the site's ten-minute ceilings", () => {
  it("are learned spent from one refused ask, which leaves what the object holds as it was", async () => {
    const bound = testEnv();
    const namespace = bound.RATE_LIMITER!;
    const pool = unique("page-render");
    const stub = namespace.get(namespace.idFromName(await limiterName(pool)));
    const resetTime = Date.now() + 600_000;
    await runInDurableObject(stub, (_, state) =>
      state.storage.put("pageRender", { count: 3000, resetTime })
    );
    const { env, asked } = watchLimits(bound);
    const answers = [];
    for (let i = 0; i < 3; i++) answers.push(await checkLimits(env, [[pool, "pageRender"]]));
    expect(answers.map(answer => answer?.success)).toEqual([false, false, false]);
    expect(answers[0]).toMatchObject({
      type: "pageRender",
      limit: 3000,
      reset: Math.floor(resetTime / 1000)
    });
    expect(asked).toEqual(["pageRender"]);
    expect(await runInDurableObject(stub, (_, state) => state.storage.get("pageRender"))).toEqual({
      count: 3000,
      resetTime
    });
  });

  it("start a window anew once the last has ended", async () => {
    const bound = testEnv();
    const namespace = bound.RATE_LIMITER!;
    const pool = unique("page-render");
    const stub = namespace.get(namespace.idFromName(await limiterName(pool)));
    await runInDurableObject(stub, (_, state) =>
      state.storage.put("pageRender", { count: 3000, resetTime: Date.now() - 1000 })
    );
    const { env, asked } = watchLimits(bound);
    const before = Date.now();
    expect((await checkLimits(env, [[pool, "pageRender"]]))?.success).toBe(true);
    expect(asked).toEqual(["pageRender"]);
    const stored = await runInDurableObject(stub, (_, state) =>
      state.storage.get<{ count: number; resetTime: number }>("pageRender")
    );
    expect(stored?.count).toBe(1);
    expect(stored?.resetTime).toBeGreaterThanOrEqual(before + 600_000);
  });

  it("count nothing when the object knows no such limit, as an older deploy's, and say so", async () => {
    const bound = testEnv();
    const namespace = bound.RATE_LIMITER!;
    const stub = namespace.get(namespace.idFromName(await limiterName(unique("pool"))));
    expect((await stub.fetch("https://rate-limiter/?type=pageRenderSoon")).status).toBe(400);
    // the same Worker's ask, answered by objects that know none of the ceilings: the caller draws the page
    const older = {
      idFromName: (name: string) => namespace.idFromName(name),
      get: (id: DurableObjectId) => ({
        fetch: (url: URL) => {
          const asked = new URL(url);
          asked.searchParams.set("type", "pageRenderSoon");
          return namespace.get(id).fetch(asked);
        }
      })
    } as unknown as DurableObjectNamespace;
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      await checkLimits({ DEPLOYMENT: "preview", RATE_LIMITER: older }, [
        [unique("page-render"), "pageRender"]
      ])
    ).toBeNull();
    expect(warned).toHaveBeenCalled();
    warned.mockRestore();
  });
});

describe("a refusal", () => {
  it("answers 429 with when to try again", async () => {
    const { env } = watchLimits(testEnv());
    const who = unique("address");
    for (let i = 0; i < 5; i++) expect(await overLimit(env, [[who, "emailAsk"]])).toBeNull();
    const refused = await overLimit(env, [[who, "emailAsk"]]);
    expect(refused?.status).toBe(429);
    expect(await refused?.json()).toEqual({ error: "Too many requests. Try again later." });
    expect(Number(refused?.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(refused?.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(refused?.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(refused?.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("names the second the object's window ends, and waits no longer than until then", async () => {
    const bound = testEnv();
    const namespace = bound.RATE_LIMITER!;
    const who = unique("address");
    const stub = namespace.get(namespace.idFromName(await limiterName(who)));
    // a window that ends part of the way into a second
    const resetTime = (Math.floor(Date.now() / 1000) + 300) * 1000 + 500;
    await runInDurableObject(stub, (_, state) =>
      state.storage.put("emailAsk", { count: 5, resetTime })
    );
    const asked = Math.floor(Date.now() / 1000);
    const refused = await overLimit(bound, [[who, "emailAsk"]]);
    const reset = Math.floor(resetTime / 1000);
    expect(refused?.headers.get("X-RateLimit-Reset")).toBe(String(reset));
    expect(Number(refused?.headers.get("Retry-After"))).toBeLessThanOrEqual(reset - asked);
  });

  it("answers 503 where production has lost its limiter, in the caller's words when given", async () => {
    const env = testEnv({ DEPLOYMENT: "production", RATE_LIMITER: undefined });
    const plain = await overLimit(env, [[unique("x"), "emailAsk"]]);
    expect([plain?.status, await plain?.json()]).toEqual([
      503,
      { error: "Something went wrong. Try again." }
    ]);
    const busy = await overLimit(
      env,
      [[unique("x"), "emailAsk"]],
      "Email sign-in is busy. Try again later."
    );
    expect(await busy?.json()).toEqual({ error: "Email sign-in is busy. Try again later." });
    expect(await overLimit(env, [[unique("x"), "authPost"]])).toBeNull();
  });
});

describe("an account's write", () => {
  it("waits five minutes while an admin has saving off, counting nothing, and is counted otherwise", async () => {
    const { env, asked } = watchLimits(testEnv());
    const checks: LimitCheck[] = [[unique("fit"), ["fitVote", "fitVoteDaily"]]];
    await setFlag(env, "saving", false, unique("admin"));
    try {
      const paused = await writeRefusal(env, "user", checks);
      expect([paused?.status, paused?.headers.get("Retry-After"), await paused?.json()]).toEqual([
        503,
        "300",
        { error: "Couldn't save." }
      ]);
      expect(paused?.headers.get("Cache-Control")).toBe("private, no-store");
      expect(paused?.headers.get(PAUSED)).toBe("saving");
      expect(asked).toEqual([]);
    } finally {
      await setFlag(env, "saving", true, unique("admin"));
    }
    expect(await writeRefusal(env, "user", checks)).toBeNull();
    expect(asked).toEqual(["fitVote", "fitVoteDaily"]);
  });

  it("stops a like as any write: while saving is off, past the account's minute, and when nothing can count", async () => {
    const { env, asked } = watchLimits(testEnv());
    // a like's checks: the account's minute and day, then the site's day of hearts
    const like: LimitCheck[] = [
      [`user:${unique("liker")}`, ["toggleLike", "toggleLikeDaily"]],
      [unique("likes"), "likesDaily"]
    ];
    await setFlag(env, "saving", false, unique("admin"));
    try {
      const paused = await writeRefusal(env, "user", like);
      expect([paused?.status, paused?.headers.get("Retry-After")]).toEqual([503, "300"]);
      expect(asked).toEqual([]);
    } finally {
      await setFlag(env, "saving", true, unique("admin"));
    }
    for (let i = 0; i < 20; i++) expect(await writeRefusal(env, "user", like)).toBeNull();
    expect(new Set(asked)).toEqual(new Set(["toggleLikeDaily", "likesDaily"]));
    const over = await writeRefusal(env, "user", like);
    expect([over?.status, await over?.json()]).toEqual([
      429,
      { error: "Too many requests. Try again later." }
    ]);
    expect(Number(over?.headers.get("Retry-After"))).toBeGreaterThan(0);
    // production without its limiter counts nothing, so the like waits
    const down = testEnv({ DEPLOYMENT: "production", RATE_LIMITER: undefined });
    expect((await writeRefusal(down, "user", like))?.status).toBe(503);
  });

  it("on staging allows an admin a hundred times as much under keys of its own, and anyone else production's", async () => {
    const bound = testEnv({ DEPLOYMENT: "staging" });
    const namespace = bound.RATE_LIMITER!;
    const { env } = watchLimits(bound);
    const day = (role: string) =>
      checkLimits(env, workChecks(env, role, [[unique("user"), "toggleLikeDaily", 1001]]));
    expect((await day("admin"))?.success).toBe(true);
    expect((await day("user"))?.success).toBe(false);
    const { env: production } = watchLimits(testEnv({ DEPLOYMENT: "production" }));
    const asAdmin = workChecks(production, "admin", [[unique("user"), "toggleLikeDaily", 1001]]);
    expect((await checkLimits(production, asAdmin))?.success).toBe(false);
    // the admins' share of a site ceiling is counted in an object of its own
    const site = unique("likes");
    expect(
      (await checkLimits(env, workChecks(env, "admin", [[site, "likesDaily", 3]])))?.success
    ).toBe(true);
    const admins = namespace.get(namespace.idFromName(await limiterName(`${site}:admins`)));
    expect(
      await runInDurableObject(admins, (_, state) =>
        state.storage.get<{ count: number }>("likesDaily")
      )
    ).toMatchObject({ count: 3 });
    const ids = (await listDurableObjectIds(namespace)).map(id => id.toString());
    expect(ids).not.toContain(namespace.idFromName(await limiterName(site)).toString());
  });
});
