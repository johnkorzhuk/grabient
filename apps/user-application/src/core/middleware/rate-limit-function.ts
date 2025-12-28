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

		// Skip rate limiting in local development - DOs don't work properly with
		// TanStack Start + Cloudflare Vite plugin in dev mode
		const isDev = process.env.NODE_ENV === "development" || 
			request.url.includes("localhost") || 
			request.url.includes("127.0.0.1");
		
		if (isDev) {
			return next({ context });
		}

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
				// CRITICAL: Prevent caching of rate limit errors
				// Without this, CDN can cache 429 responses and serve them to all users
				setResponseHeader("Cache-Control", "no-store, no-cache, must-revalidate");
				setResponseHeader("CDN-Cache-Control", "no-store");
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
			// Re-throw rate limit exceeded errors
			if (error instanceof Error && error.message.startsWith("{")) {
				throw error;
			}
			// Silently skip rate limiting if DO is unavailable (common in local dev)
			// The "no such actor class" error occurs when DO isn't properly configured
			const errorStr = String(error);
			if (errorStr.includes("no such actor class") || errorStr.includes("durableObjectReset")) {
				// Skip rate limiting in dev - DO not available
				return next({ context });
			}
			console.error("Rate limit check failed:", error);
			return next({ context });
		}
	});
}
