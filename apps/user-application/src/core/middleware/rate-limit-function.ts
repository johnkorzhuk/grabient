import { createMiddleware } from "@tanstack/react-start";
import {
	getRequest,
	setResponseStatus,
	setResponseHeader,
} from "@tanstack/react-start/server";
import type { DurableObjectNamespace } from "@cloudflare/workers-types";
import {
	checkRateLimit,
	getRateLimitIdentifier,
	type RateLimitType,
} from "./rate-limit";

interface RateLimitEnv {
	RATE_LIMITER?: DurableObjectNamespace;
}

export function rateLimitFunctionMiddleware(limitType: RateLimitType) {
	return createMiddleware({
		type: "function",
	}).server(async ({ next, context }) => {
		const request = getRequest();
		const env = context.env as unknown as RateLimitEnv;

		if (!env?.RATE_LIMITER) {
			console.warn("RATE_LIMITER binding not found - rate limiting disabled");
			return next({ context });
		}

		const userId = context.userId || null;
		const identifier = getRateLimitIdentifier(request, userId);

		try {
			const result = await checkRateLimit(
				env.RATE_LIMITER,
				identifier,
				limitType,
			);

			// Always set rate limit headers
			setResponseHeader("X-RateLimit-Limit", result.limit.toString());
			setResponseHeader("X-RateLimit-Remaining", result.remaining.toString());
			setResponseHeader("X-RateLimit-Reset", result.reset.toString());

			if (!result.success) {
				const retryAfter = Math.max(0, result.reset - Math.floor(Date.now() / 1000));
				setResponseHeader("Retry-After", retryAfter.toString());
				setResponseStatus(429);
				throw new Error(
					JSON.stringify({
						error: "Rate limit exceeded",
						retryAfter: result.reset,
						limit: result.limit,
						remaining: result.remaining,
						reset: result.reset,
					}),
				);
			}

			return next({ context });
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("{")) {
				throw error;
			}
			console.error("Rate limit check failed:", error);
			return next({ context });
		}
	});
}
