import { DurableObjectNamespace } from "@cloudflare/workers-types";

/**
 * Rate limit configuration for different endpoint types
 */
export const rateLimitConfig = {
	// Critical endpoints - most restrictive
	contactForm: { requests: 5, window: 600 }, // 5 requests per 10 minutes
	magicLink: { requests: 5, window: 60 }, // 5 requests per minute
	avatarUpload: { requests: 10, window: 3600 }, // 10 uploads per hour

	// High priority mutations
	toggleLike: { requests: 20, window: 60 }, // 20 requests per minute
	searchFeedback: { requests: 100, window: 60 }, // 100 requests per minute
	accountMutation: { requests: 30, window: 3600 }, // 30 requests per hour

	// Read operations - lenient limits
	usernameCheck: { requests: 50, window: 60 }, // 50 requests per minute
	paletteRead: { requests: 100, window: 60 }, // 100 requests per minute
	userPalettes: { requests: 30, window: 60 }, // 30 requests per minute

	// Low priority - lenient limits
	general: { requests: 120, window: 60 }, // 120 requests per minute
} as const;

export type RateLimitType = keyof typeof rateLimitConfig;

/**
 * Rate limit result
 */
export interface RateLimitResult {
	success: boolean;
	limit: number;
	remaining: number;
	reset: number;
}

/**
 * Rate limiter using Cloudflare Durable Objects
 */
export class RateLimiter {
	private state: DurableObjectState;

	constructor(state: DurableObjectState) {
		this.state = state;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const key = url.searchParams.get("key");
		const limitType = url.searchParams.get(
			"type",
		) as RateLimitType | null;

		if (!key || !limitType) {
			return new Response("Missing key or type", { status: 400 });
		}

		const config = rateLimitConfig[limitType];
		if (!config) {
			return new Response("Invalid limit type", { status: 400 });
		}

		const result = await this.checkRateLimit(
			key,
			config.requests,
			config.window,
		);

		return new Response(JSON.stringify(result), {
			status: result.success ? 200 : 429,
			headers: {
				"Content-Type": "application/json",
				"X-RateLimit-Limit": config.requests.toString(),
				"X-RateLimit-Remaining": result.remaining.toString(),
				"X-RateLimit-Reset": result.reset.toString(),
			},
		});
	}

	private async checkRateLimit(
		key: string,
		maxRequests: number,
		windowSeconds: number,
	): Promise<RateLimitResult> {
		const now = Date.now();
		const windowMs = windowSeconds * 1000;

		// Get current request data
		const data = await this.state.storage.get<{
			count: number;
			resetTime: number;
		}>(key);

		// If no data or window expired, start fresh
		if (!data || now > data.resetTime) {
			const resetTime = now + windowMs;
			await this.state.storage.put(key, {
				count: 1,
				resetTime,
			});

			return {
				success: true,
				limit: maxRequests,
				remaining: maxRequests - 1,
				reset: Math.floor(resetTime / 1000),
			};
		}

		// Check if limit exceeded
		if (data.count >= maxRequests) {
			return {
				success: false,
				limit: maxRequests,
				remaining: 0,
				reset: Math.floor(data.resetTime / 1000),
			};
		}

		// Increment counter
		const newCount = data.count + 1;
		await this.state.storage.put(key, {
			count: newCount,
			resetTime: data.resetTime,
		});

		return {
			success: true,
			limit: maxRequests,
			remaining: maxRequests - newCount,
			reset: Math.floor(data.resetTime / 1000),
		};
	}
}

/**
 * Helper function to check rate limit using the Durable Object
 */
export async function checkRateLimit(
	rateLimiter: DurableObjectNamespace,
	identifier: string,
	limitType: RateLimitType,
): Promise<RateLimitResult> {
	// Get a Durable Object ID based on the identifier
	const id = rateLimiter.idFromName(identifier);
	const stub = rateLimiter.get(id);

	// Call the rate limiter
	const response = await stub.fetch(
		`https://rate-limiter/?key=${encodeURIComponent(identifier)}&type=${limitType}`,
	);

	const result = await response.json<RateLimitResult>();
	return result;
}

/**
 * Get rate limit identifier based on request
 * Uses IP address for unauthenticated requests, user ID for authenticated
 */
export function getRateLimitIdentifier(
	request: Request,
	userId?: string | null,
): string {
	if (userId) {
		return `user:${userId}`;
	}

	// Try to get IP from Cloudflare headers
	const ip =
		request.headers.get("CF-Connecting-IP") ||
		request.headers.get("X-Real-IP") ||
		"unknown";

	return `ip:${ip}`;
}

/**
 * Middleware helper for rate limiting server functions
 */
export async function rateLimitMiddleware(
	rateLimiter: DurableObjectNamespace,
	identifier: string,
	limitType: RateLimitType,
): Promise<{ allowed: boolean; result: RateLimitResult }> {
	const result = await checkRateLimit(rateLimiter, identifier, limitType);

	return {
		allowed: result.success,
		result,
	};
}
