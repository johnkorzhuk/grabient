import { listDurableObjectIds, runInDurableObject } from "cloudflare:test";
import { overLimit } from "@grabient/server/auth/http.ts";
import { PAUSED, setFlag } from "@grabient/server/flags/flags.ts";
import { checkLimits, type LimitCheck, limiterName } from "@grabient/server/limits/check.ts";
import { workChecks, writeRefusal } from "@grabient/server/limits/writes.ts";
import { describe, expect, it } from "vitest";
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
