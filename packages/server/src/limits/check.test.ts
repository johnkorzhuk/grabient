import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Deployment } from "../env.ts";
import { clientAddress } from "./address.ts";
import { checkLimits, knownLimit, limiterName, mcpListLimits } from "./check.ts";
import { LIMITS, type LimitName, limitOf } from "./config.ts";
import { RateLimiter } from "./rate-limiter.ts";
import { workChecks } from "./writes.ts";

/** RateLimiter objects over in-memory storage, as the platform would run them, recording each ask as "limit+limit n".
    Each isolate is a binding object of its own over the same objects, so its memory of the limits starts empty. */
function objects(deployment?: Deployment) {
  const live = new Map<string, RateLimiter>();
  const asks: string[] = [];
  const state = () => {
    const data = new Map<string, unknown>();
    const storage = {
      get: async (keys: string[]) =>
        new Map(
          keys.flatMap(key => (data.has(key) ? [[key, structuredClone(data.get(key))]] : []))
        ),
      put: async (entries: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(entries)) data.set(key, structuredClone(value));
      }
    };
    return { storage } as unknown as DurableObjectState;
  };
  const isolate = () => ({
    DEPLOYMENT: deployment,
    RATE_LIMITER: {
      idFromName: (name: string) => name,
      get: (id: string) => ({
        fetch: async (url: URL) => {
          asks.push(
            `${url.searchParams.getAll("type").join("+")} ${url.searchParams.get("n") ?? 1}`
          );
          let object = live.get(id);
          if (!object) {
            object = new RateLimiter(state());
            live.set(id, object);
          }
          return object.fetch(new Request(url));
        }
      })
    } as unknown as DurableObjectNamespace
  });
  return { ...isolate(), asks, isolate };
}

const times = async <T>(n: number, check: () => Promise<T>): Promise<T[]> => {
  const results: T[] = [];
  for (let i = 0; i < n; i++) results.push(await check());
  return results;
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the limits", () => {
  it("keep the numbers production counts by", () => {
    const pinned: Partial<Record<LimitName, object>> = {
      toggleLike: { requests: 20, window: 60, local: true, work: true },
      toggleLikeDaily: { requests: 1000, window: 86400, work: true, lease: 8 },
      likesDaily: { requests: 20000, window: 86400, site: true, work: true, lease: 20 },
      mcpLikesDaily: { requests: 5000, window: 86400, site: true, work: true, lease: 10 },
      mcpPublishDaily: { requests: 50, window: 86400 },
      magicLinkGlobal: { requests: 50, window: 3600, site: true },
      magicLinkDaily: { requests: 300, window: 86400, site: true },
      deletionEmail: { requests: 50, window: 86400, site: true },
      emailRecipient: { requests: 6, window: 86400 },
      emailAsk: { requests: 5, window: 600 },
      authPost: { requests: 30, window: 60, local: true },
      authRead: { requests: 120, window: 60, local: true },
      avatarUpload: { requests: 10, window: 3600 },
      avatarUploadDaily: { requests: 500, window: 86400, site: true },
      usernameCheck: { requests: 120, window: 3600 },
      usernameWrite: { requests: 10, window: 3600 },
      oauthRegisterDaily: { requests: 5000, window: 86400, site: true, lease: 10 },
      oauthRefreshGrant: { requests: 48, window: 86400 },
      oauthRefreshAccount: { requests: 500, window: 86400 },
      oauthRefreshDaily: { requests: 100000, window: 86400, site: true, lease: 50 },
      connections: { requests: 60, window: 60, local: true },
      connectionsDaily: { requests: 300, window: 86400 },
      mcpChallenge: { requests: 120, window: 60, local: true },
      savedRead: { requests: 60, window: 60, local: true },
      collectionWrite: { requests: 30, window: 3600, work: true },
      collectionWriteDaily: { requests: 100, window: 86400, work: true },
      collectionWritesSite: { requests: 2000, window: 86400, site: true, work: true, lease: 5 },
      collectionItems: { requests: 300, window: 3600, work: true },
      collectionItemsDaily: { requests: 500, window: 86400, work: true },
      renderMiss: { requests: 60, window: 60, local: true },
      suggestMiss: { requests: 240, window: 60, local: true },
      pageRender: { requests: 3000, window: 600, site: true, lease: 8 },
      dataMiss: { requests: 1000, window: 600, site: true, lease: 4 },
      renderAccount: { requests: 200, window: 600, lease: 2 },
      renderSignedIn: { requests: 300, window: 600, site: true, lease: 2 },
      renderHttp3: { requests: 500, window: 600, site: true, lease: 4 },
      renderPreview: { requests: 100, window: 600, site: true, lease: 2 },
      renderLocal: { requests: 300, window: 600, local: true, fixed: true }
    };
    for (const [name, limit] of Object.entries(pinned))
      expect([name, LIMITS[name as LimitName]]).toEqual([name, limit]);
    expect(limitOf("toggleLike", true).requests).toBe(2000);
    expect(limitOf("emailAsk", true).requests).toBe(5);
  });

  it("are counted in objects named by a hash of what they count", async () => {
    const hex = createHash("sha256")
      .update("grabient-limit:email-to:ada@example.test")
      .digest("hex");
    expect(await limiterName("email-to:ada@example.test")).toBe(hex);
  });

  it("count by an IPv4 address or an IPv6 /64", () => {
    const cases: [string | null, string | null][] = [
      ["203.0.113.9", "203.0.113.9"],
      [" 203.0.113.9 ", "203.0.113.9"],
      ["2001:db8:1234:5678:9abc::1", "2001:db8:1234:5678::/64"],
      ["2001:db8::1", "2001:db8:0:0::/64"],
      ["2001:0db8:0000:0042:0000:8a2e:0370:7334", "2001:db8:0:42::/64"],
      ["::ffff:198.51.100.4", "198.51.100.4"],
      ["::1", "0:0:0:0::/64"],
      ["fe80::1%eth0", "fe80:0:0:0::/64"],
      ["garbage", "garbage"],
      [null, null]
    ];
    for (const [ip, expected] of cases) {
      const request = new Request("https://grabient.test/", {
        headers: ip === null ? {} : { "CF-Connecting-IP": ip }
      });
      expect([ip, clientAddress(request)]).toEqual([ip, expected]);
    }
  });
});

describe("checkLimits", () => {
  it("refuses past a limit, and an isolate that used it up refuses without asking", async () => {
    const env = objects();
    const answers = await times(6, () => checkLimits(env, [["a", "emailAsk"]]));
    expect(answers.map(answer => answer?.success)).toEqual([true, true, true, true, true, false]);
    expect(answers[5]).toMatchObject({ type: "emailAsk", limit: 5, remaining: 0 });
    expect(env.asks).toHaveLength(5);
    // Another isolate asks the object, which refuses; then it knows, and asks no more.
    const other = env.isolate();
    expect(await checkLimits(other, [["a", "emailAsk"]])).toMatchObject({
      success: false,
      type: "emailAsk"
    });
    expect(await checkLimits(other, [["a", "emailAsk"]])).toMatchObject({ success: false });
    expect(env.asks).toHaveLength(6);
  });

  it("counts several windows of one thing together, all or none", async () => {
    const env = objects();
    const both: LimitName[] = ["collectionWrite", "collectionWriteDaily"];
    expect((await checkLimits(env, [["acct", both, 30]]))?.success).toBe(true);
    const other = env.isolate();
    expect(await checkLimits(other, [["acct", both]])).toMatchObject({
      success: false,
      type: "collectionWrite"
    });
    // The object took nothing from the day for the refused request: 70 of its 100 are left.
    const third = env.isolate();
    expect((await checkLimits(third, [["acct", "collectionWriteDaily", 70]]))?.success).toBe(true);
    expect((await checkLimits(env.isolate(), [["acct", "collectionWriteDaily"]]))?.success).toBe(
      false
    );
  });

  it("takes a leased limit in blocks of one, then twice the last, up to the lease", async () => {
    const env = objects();
    await times(16, () => checkLimits(env, [["acct", "toggleLikeDaily"]]));
    expect(env.asks).toEqual([
      "toggleLikeDaily 1",
      "toggleLikeDaily 2",
      "toggleLikeDaily 4",
      "toggleLikeDaily 8",
      "toggleLikeDaily 8"
    ]);
  });

  it("refuses a leased limit early by no more than the blocks held", async () => {
    const env = objects();
    const other = env.isolate();
    // Another isolate takes all but three of the site's day.
    expect((await checkLimits(other, [["site", "collectionWritesSite", 1997]]))?.success).toBe(
      true
    );
    const answers = await times(4, () => checkLimits(env, [["site", "collectionWritesSite"]]));
    expect(answers.map(answer => answer?.success)).toEqual([true, true, true, false]);
  });

  it("knows a leased limit spent from one refused block once less is left than a request lacks, until it resets", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // the object's day begins part of the way into a second
    const begun = Date.UTC(2026, 9, 30, 12, 0, 0, 700);
    vi.setSystemTime(begun);
    const env = objects();
    // this isolate holds blocks of one and two, and spends them
    for (let i = 0; i < 3; i++)
      expect((await checkLimits(env, [["site", "collectionWritesSite"]]))?.success).toBe(true);
    // another isolate takes the rest of the site's day
    expect(
      (await checkLimits(env.isolate(), [["site", "collectionWritesSite", 1997]]))?.success
    ).toBe(true);
    const asked = env.asks.length;
    const answers = await times(3, () => checkLimits(env, [["site", "collectionWritesSite"]]));
    expect(answers.map(answer => answer?.success)).toEqual([false, false, false]);
    // the refused block of four, and no ask for exactly one after it
    expect(env.asks.slice(asked)).toEqual(["collectionWritesSite 4"]);
    // the second the object's day ends, as the object names it
    const reset = Math.floor((begun + 86_400_000) / 1000);
    expect(answers[0]?.reset).toBe(reset);
    vi.setSystemTime(reset * 1000 - 1);
    expect((await checkLimits(env, [["site", "collectionWritesSite"]]))?.success).toBe(false);
    expect(env.asks).toHaveLength(asked + 1);
    // the object's day over, it is asked again
    vi.setSystemTime(begun + 86_400_001);
    expect((await checkLimits(env, [["site", "collectionWritesSite"]]))?.success).toBe(true);
    expect(env.asks).toHaveLength(asked + 2);
  });

  it("asks for exactly what a request lacks once a block is refused with enough left for it", async () => {
    const env = objects();
    for (let i = 0; i < 3; i++) await checkLimits(env, [["site", "collectionWritesSite"]]);
    await checkLimits(env.isolate(), [["site", "collectionWritesSite", 1995]]);
    const asked = env.asks.length;
    expect((await checkLimits(env, [["site", "collectionWritesSite"]]))?.success).toBe(true);
    expect(env.asks.slice(asked)).toEqual(["collectionWritesSite 4", "collectionWritesSite 1"]);
  });

  it("counts an address's own limits before the site's, and an isolate limit without asking", async () => {
    const env = objects();
    const ok = await checkLimits(env, [
      ["auth:a", "authPost"],
      ["email-to:a", "emailRecipient"],
      ["email-sign-in", "magicLinkGlobal"]
    ]);
    expect(ok?.success).toBe(true);
    expect(env.asks).toEqual(["emailRecipient 1", "magicLinkGlobal 1"]);
  });

  it("says a ceiling reached in the logs once an hour, and counts every refusal", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const points: unknown[] = [];
    const env = { ...objects(), USAGE: { writeDataPoint: (point: unknown) => points.push(point) } };
    expect((await checkLimits(env, [["site-key", "contactGlobal", 20]]))?.success).toBe(true);
    for (let i = 0; i < 3; i++) await checkLimits(env, [["site-key", "contactGlobal"]]);
    expect(
      warn.mock.calls.filter(([line]) => line === "ceiling reached contactGlobal")
    ).toHaveLength(1);
    await checkLimits(env, [["b", "emailAsk", 6]]);
    expect(points).toEqual([
      ...Array(3).fill({
        indexes: ["limit"],
        blobs: ["limit", "contactGlobal", "site"],
        doubles: [1]
      }),
      { indexes: ["limit"], blobs: ["limit", "emailAsk", "client"], doubles: [1] }
    ]);
  });

  it("fails closed when production has no limiter, and counts in the isolate where nothing is bound", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await checkLimits({ DEPLOYMENT: "production" }, [["c", "emailAsk"]])).toBeNull();
    expect((await checkLimits({ DEPLOYMENT: "production" }, [["c", "authPost"]]))?.success).toBe(
      true
    );
    const local = { DEPLOYMENT: "development" as const };
    const answers = await times(6, () => checkLimits(local, [[`d-${Math.random()}`, "emailAsk"]]));
    expect(answers.every(answer => answer?.success)).toBe(true);
    const same = await times(6, () => checkLimits(local, [["same-address", "emailAsk"]]));
    expect(same.map(answer => answer?.success)).toEqual([true, true, true, true, true, false]);
  });

  it("fails closed when the object cannot answer", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async () => new Response("", { status: 500 }) })
    };
    const env = { RATE_LIMITER: broken as unknown as DurableObjectNamespace };
    expect(await checkLimits(env, [["e", "emailAsk"]])).toBeNull();
  });

  it("allows an admin on staging a hundred times the work, in the isolate and in the object, and nobody else", async () => {
    const production = objects("production");
    const staging = objects("staging");
    const as = (
      env: ReturnType<typeof objects>,
      role: string,
      check: Parameters<typeof checkLimits>[1][number]
    ) => checkLimits(env, workChecks(env, role, [check]));
    expect((await as(production, "admin", ["a", "toggleLike", 21]))?.success).toBe(false);
    expect((await as(staging, "user", ["u", "toggleLike", 21]))?.success).toBe(false);
    expect((await as(staging, "admin", ["a", "toggleLike", 2000]))?.success).toBe(true);
    expect((await as(staging, "user", ["u", "collectionWrite", 31]))?.success).toBe(false);
    expect((await as(staging, "admin", ["a", "collectionWrite", 3000]))?.success).toBe(true);
    expect(staging.asks).toEqual(["collectionWrite 31", "collectionWrite 3000"]);
    // the admins' share of a site ceiling is counted apart; a limit that is no work is counted as it is
    expect(workChecks(staging, "admin", [["likes", "likesDaily"]])).toEqual([
      ["likes:admins", "likesDaily", undefined, true]
    ]);
    const other: Parameters<typeof checkLimits>[1] = [["image-day", "imageRenderDaily"]];
    expect(workChecks(staging, "admin", other)[0]).toBe(other[0]);
    expect(workChecks(production, "admin", [["likes", "likesDaily"]])).toEqual([
      ["likes", "likesDaily"]
    ]);
  });

  it("tells a limit this isolate has spent, without counting it", async () => {
    const env = objects();
    expect(knownLimit(env, ["k", "mcpChallenge"])).toBeNull();
    expect((await checkLimits(env, [["k", "mcpChallenge", 119]]))?.success).toBe(true);
    expect(knownLimit(env, ["k", "mcpChallenge"])).toBeNull();
    expect((await checkLimits(env, [["k", "mcpChallenge"]]))?.success).toBe(true);
    expect(knownLimit(env, ["k", "mcpChallenge"])).toMatchObject({
      success: false,
      type: "mcpChallenge",
      limit: 120
    });
    expect(env.asks).toEqual([]);
  });

  it("keeps the isolate's own count under a fixed identifier however many new identifiers it counts meanwhile", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const unreachable = {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async () => {
          throw new Error("The object is unreachable");
        }
      })
    };
    const env = { RATE_LIMITER: unreachable as unknown as DurableObjectNamespace };
    for (let i = 0; i < 300; i++) await checkLimits(env, [["isolate", "renderLocal"]]);
    expect(knownLimit(env, ["isolate", "renderLocal"])?.type).toBe("renderLocal");
    // a day's leased count begun for each of five thousand new addresses, whose asks all fail
    for (let i = 0; i < 5000; i++)
      await checkLimits(env, [
        [`search-model:198.51.${i >> 8}.${i & 255}`, ["searchModel", "searchModelDaily"]]
      ]);
    expect(knownLimit(env, ["isolate", "renderLocal"])?.type).toBe("renderLocal");
  });

  it("answers an account's first two hundred MCP lists a day in the isolate", () => {
    const env = objects();
    const checks = Array.from({ length: 201 }, () => mcpListLimits(env, "account"));
    expect(checks[199]).toEqual([["account", "mcpList"]]);
    expect(checks[200]).toEqual([["account", ["mcpList", "mcpListDaily"]]]);
  });
});

describe("RateLimiter", () => {
  it("refuses a request that names no known limit", async () => {
    const limiter = new RateLimiter({ storage: {} } as unknown as DurableObjectState);
    for (const url of ["https://rate-limiter/", "https://rate-limiter/?type=nothing"]) {
      expect((await limiter.fetch(new Request(url))).status).toBe(400);
    }
  });
});
