import { describe, expect, it } from "vitest";
import { RateLimiter, rateLimitConfig } from "../src/rate-limit";

function limiter() {
  const values = new Map();
  const state = {
    storage: {
      get: async (key) => values.get(key),
      put: async (key, value) => values.set(key, value),
    },
  };
  return new RateLimiter(state);
}

function request(type = "toggleLike", key = "user:u1") {
  return new Request(
    `https://rate-limiter/?key=${encodeURIComponent(key)}&type=${type}`,
  );
}

describe("production mutation rate limiter", () => {
  it("allows the configured like-toggle budget and rejects the next request", async () => {
    const instance = limiter();
    const { requests } = rateLimitConfig.toggleLike;

    for (let n = 0; n < requests; n++) {
      const response = await instance.fetch(request());
      expect(response.status).toBe(200);
      expect(response.headers.get("X-RateLimit-Remaining")).toBe(
        String(requests - n - 1),
      );
    }

    const blocked = await instance.fetch(request());
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({
      success: false,
      remaining: 0,
    });
  });

  it("keeps different users in separate buckets", async () => {
    const instance = limiter();
    expect((await instance.fetch(request("toggleLike", "user:a"))).status).toBe(200);
    expect((await instance.fetch(request("toggleLike", "user:b"))).status).toBe(200);
  });
});
