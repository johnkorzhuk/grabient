import { listDurableObjectIds, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { overLimit } from "../src/server/auth/http.ts";
import { checkLimits, limiterName } from "../src/server/limits/check.ts";
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
