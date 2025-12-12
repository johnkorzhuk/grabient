/**
 * PostHog Reverse Proxy Worker
 *
 * Proxies PostHog requests through your domain to bypass ad blockers.
 * Deploy to a subdomain like `e.yourdomain.com` for best results.
 *
 * Based on: https://posthog.com/docs/advanced/proxy/cloudflare
 */

// PostHog hosts - use US or EU based on your PostHog region
const POSTHOG_HOST = "us.i.posthog.com";
const POSTHOG_ASSET_HOST = "us-assets.i.posthog.com";

// For EU region, use:
// const POSTHOG_HOST = "eu.i.posthog.com";
// const POSTHOG_ASSET_HOST = "eu-assets.i.posthog.com";

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const pathname = url.pathname;
		const search = url.search;

		// Handle static assets (JS SDK, etc.)
		if (pathname.startsWith("/static/")) {
			return handleStatic(request, pathname, ctx);
		}

		// Forward all other requests to PostHog API
		return forwardRequest(request, pathname + search);
	},
};

/**
 * Handle static asset requests with caching
 */
async function handleStatic(
	request: Request,
	pathname: string,
	ctx: ExecutionContext
): Promise<Response> {
	const cacheKey = new Request(
		`https://${POSTHOG_ASSET_HOST}${pathname}`,
		request
	);

	const cache = caches.default;

	// Check cache first
	let response = await cache.match(cacheKey);
	if (response) {
		return response;
	}

	// Fetch from PostHog
	response = await fetch(`https://${POSTHOG_ASSET_HOST}${pathname}`, {
		method: request.method,
		headers: {
			"User-Agent": request.headers.get("User-Agent") || "",
		},
	});

	// Clone and cache successful responses
	if (response.ok) {
		const responseToCache = new Response(response.body, response);
		// Cache for 24 hours
		responseToCache.headers.set("Cache-Control", "public, max-age=86400");
		ctx.waitUntil(cache.put(cacheKey, responseToCache.clone()));
		return responseToCache;
	}

	return response;
}

/**
 * Forward API requests to PostHog
 */
async function forwardRequest(
	request: Request,
	pathWithSearch: string
): Promise<Response> {
	const url = `https://${POSTHOG_HOST}${pathWithSearch}`;

	// Build headers, preserving original IP
	const headers = new Headers(request.headers);

	// Get real client IP from Cloudflare
	const clientIP =
		request.headers.get("CF-Connecting-IP") ||
		request.headers.get("X-Real-IP") ||
		"";

	if (clientIP) {
		headers.set("X-Forwarded-For", clientIP);
	}

	// Set proper host header
	headers.set("Host", POSTHOG_HOST);

	// Remove cookies for privacy
	headers.delete("Cookie");

	const response = await fetch(url, {
		method: request.method,
		headers,
		body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
	});

	// Create response with CORS headers
	const responseHeaders = new Headers(response.headers);
	responseHeaders.set("Access-Control-Allow-Origin", "*");
	responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	responseHeaders.set("Access-Control-Allow-Headers", "Content-Type");

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: responseHeaders,
	});
}

interface Env {
	// Add any environment variables here if needed
}
