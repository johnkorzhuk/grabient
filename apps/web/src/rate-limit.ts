export const rateLimitConfig = {
  toggleLike: { requests: 20, window: 60 },
  contactForm: { requests: 5, window: 600 },
} as const;

export type RateLimitType = keyof typeof rateLimitConfig;

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * The live service already owns this Durable Object class and its v1
 * migration. Keeping the same class name and storage-key format preserves its
 * counters when the rewrite replaces the current Worker.
 */
export class RateLimiter {
  constructor(private state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    const type = url.searchParams.get("type") as RateLimitType | null;
    const config = type ? rateLimitConfig[type] : undefined;
    if (!key || !type || !config)
      return new Response("Missing or invalid rate-limit parameters", { status: 400 });

    const result = await this.check(
      `${type}:${key}`,
      config.requests,
      config.window,
    );
    return Response.json(result, {
      status: result.success ? 200 : 429,
      headers: {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.reset),
      },
    });
  }

  private async check(
    key: string,
    maxRequests: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const stored = await this.state.storage.get<{
      count: number;
      resetTime: number;
    }>(key);

    if (!stored || now > stored.resetTime) {
      const resetTime = now + windowSeconds * 1000;
      await this.state.storage.put(key, { count: 1, resetTime });
      return {
        success: true,
        limit: maxRequests,
        remaining: maxRequests - 1,
        reset: Math.floor(resetTime / 1000),
      };
    }

    if (stored.count >= maxRequests) {
      return {
        success: false,
        limit: maxRequests,
        remaining: 0,
        reset: Math.floor(stored.resetTime / 1000),
      };
    }

    const count = stored.count + 1;
    await this.state.storage.put(key, {
      count,
      resetTime: stored.resetTime,
    });
    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests - count,
      reset: Math.floor(stored.resetTime / 1000),
    };
  }
}

export async function checkRateLimit(
  namespace: DurableObjectNamespace | undefined,
  identifier: string,
  type: RateLimitType,
): Promise<RateLimitResult | null> {
  if (!namespace) return null;
  const stub = namespace.get(namespace.idFromName(identifier));
  const response = await stub.fetch(
    `https://rate-limiter/?key=${encodeURIComponent(identifier)}&type=${type}`,
  );
  return response.json<RateLimitResult>();
}
