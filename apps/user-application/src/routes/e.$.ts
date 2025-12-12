import { createFileRoute } from "@tanstack/react-router";

// PostHog hosts - derived from env var or default to US region
const POSTHOG_API_HOST = import.meta.env.VITE_POSTHOG_API_HOST as string;

function getPostHogHosts() {
    // Parse the host from env var (e.g., "https://us.i.posthog.com" -> "us.i.posthog.com")
    let apiHost = "us.i.posthog.com";
    if (POSTHOG_API_HOST) {
        try {
            const url = new URL(POSTHOG_API_HOST);
            apiHost = url.host;
        } catch {
            // If it's not a full URL, use as-is
            apiHost = POSTHOG_API_HOST.replace(/^https?:\/\//, "");
        }
    }

    // Derive asset host from API host (us.i.posthog.com -> us-assets.i.posthog.com)
    const assetHost = apiHost.replace(".i.posthog.com", "-assets.i.posthog.com");

    return { apiHost, assetHost };
}

const { apiHost: POSTHOG_HOST, assetHost: POSTHOG_ASSET_HOST } = getPostHogHosts();

// Cache TTL for static assets (24 hours)
const STATIC_CACHE_TTL = 86400;

async function handlePostHogProxy(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Remove the /e prefix to get the actual PostHog path
    const pathname = url.pathname.replace(/^\/e/, "") || "/";
    const search = url.search;

    // Handle static assets (JS SDK, config, etc.)
    // /static/ - SDK and other static files
    // /array/ - External dependencies and config
    if (pathname.startsWith("/static/") || pathname.startsWith("/array/")) {
        return handleStatic(request, pathname);
    }

    // Forward all other requests to PostHog API
    return forwardRequest(request, pathname + search);
}

async function handleStatic(
    request: Request,
    pathname: string,
): Promise<Response> {
    const response = await fetch(`https://${POSTHOG_ASSET_HOST}${pathname}`, {
        method: request.method,
        headers: {
            "User-Agent": request.headers.get("User-Agent") || "",
        },
    });

    if (response.ok) {
        const newHeaders = new Headers(response.headers);
        newHeaders.set("Cache-Control", `public, max-age=${STATIC_CACHE_TTL}`);
        newHeaders.set("Access-Control-Allow-Origin", "*");

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
        });
    }

    return response;
}

async function forwardRequest(
    request: Request,
    pathWithSearch: string,
): Promise<Response> {
    const targetUrl = `https://${POSTHOG_HOST}${pathWithSearch}`;

    const headers = new Headers(request.headers);

    // Get real client IP from Cloudflare
    const clientIP =
        request.headers.get("CF-Connecting-IP") ||
        request.headers.get("X-Real-IP") ||
        "";

    if (clientIP) {
        headers.set("X-Forwarded-For", clientIP);
    }

    headers.set("Host", POSTHOG_HOST);
    headers.delete("Cookie");

    const response = await fetch(targetUrl, {
        method: request.method,
        headers,
        body:
            request.method !== "GET" && request.method !== "HEAD"
                ? request.body
                : undefined,
    });

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

export const Route = createFileRoute("/e/$")({
    server: {
        handlers: {
            GET: ({ request }) => handlePostHogProxy(request),
            POST: ({ request }) => handlePostHogProxy(request),
            OPTIONS: ({ request }) => {
                return new Response(null, {
                    status: 204,
                    headers: {
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type",
                        "Access-Control-Max-Age": "86400",
                    },
                });
            },
        },
    },
});
