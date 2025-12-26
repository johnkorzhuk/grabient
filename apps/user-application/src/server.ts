// DO NOT DELETE THIS FILE!!!
// This file is a good smoke test to make sure the custom server entry is working
import { setAuth } from "@repo/data-ops/auth/server";
import { initDatabase } from "@repo/data-ops/database/setup";
import handler from "@tanstack/react-start/server-entry";
import { rateLimitConfig, type RateLimitResult, type RateLimitType } from "./core/middleware/rate-limit";

console.log("[server-entry]: using custom server entry in 'src/server.ts'");

/**
 * Rate Limiter Durable Object
 * Must be defined directly in server.ts to avoid code-splitting issues with Cloudflare Workers
 */
export class RateLimiter {
	private state: DurableObjectState;

	constructor(state: DurableObjectState) {
		this.state = state;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const key = url.searchParams.get("key");
		const limitType = url.searchParams.get("type") as RateLimitType | null;

		if (!key || !limitType) {
			return new Response("Missing key or type", { status: 400 });
		}

		const config = rateLimitConfig[limitType];
		if (!config) {
			return new Response("Invalid limit type", { status: 400 });
		}

		// Include limitType in storage key so each endpoint type has its own bucket
		const storageKey = `${limitType}:${key}`;
		const result = await this.checkRateLimit(storageKey, config.requests, config.window);

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

		const data = await this.state.storage.get<{
			count: number;
			resetTime: number;
		}>(key);

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

		if (data.count >= maxRequests) {
			return {
				success: false,
				limit: maxRequests,
				remaining: 0,
				reset: Math.floor(data.resetTime / 1000),
			};
		}

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

declare module "@tanstack/react-start" {
    interface Register {
        server: {
            requestContext: {
                db: ReturnType<typeof initDatabase>;
                fromFetch: boolean;
                env: Env;
                // Auth context from middleware (optional)
                userId?: string | null;
                email?: string | null;
                auth?: ReturnType<typeof setAuth>;
                // Geo data from Cloudflare
                isGdprRegion: boolean;
                country?: string;
            };
        };
    }
}

// GDPR applies to EEA (EU + Iceland, Liechtenstein, Norway) and UK
const GDPR_COUNTRIES = new Set([
    // EU Member States
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
    "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
    "PL", "PT", "RO", "SK", "SI", "ES", "SE",
    // EEA (non-EU)
    "IS", "LI", "NO",
    // UK (post-Brexit still has GDPR-equivalent)
    "GB",
]);

export default {
    fetch(request: Request, env: Env) {
        const db = initDatabase(env.DB);

        // Extract geo data from Cloudflare
        const cf = (request as Request<unknown, IncomingRequestCfProperties>).cf;
        const country = cf?.country;
        const isEUCountry = cf?.isEUCountry === "1";
        const isGdprRegion = isEUCountry || (country ? GDPR_COUNTRIES.has(country) : false);

        setAuth({
            secret: env.BETTER_AUTH_SECRET,
            socialProviders: {
                google: {
                    clientId: env.GOOGLE_CLIENT_ID,
                    clientSecret: env.GOOGLE_CLIENT_SECRET,
                },
            },
            adapter: {
                drizzleDb: db,
                provider: "sqlite",
            },
            polar: {
                accessToken: env.POLAR_ACCESS_TOKEN,
                webhookSecret: env.POLAR_WEBHOOK_SECRET,
                server: (env.POLAR_SERVER as "sandbox" | "production") || "sandbox",
                products: {
                    monthly: {
                        productId: env.POLAR_PRODUCT_MONTHLY,
                        slug: "pro-monthly",
                    },
                    yearly: {
                        productId: env.POLAR_PRODUCT_YEARLY,
                        slug: "pro-yearly",
                    },
                },
                successUrl: "/checkout/success?checkout_id={CHECKOUT_ID}",
            },
            sendMagicLink: async (data) => {
                try {
                    const response = await fetch(
                        "https://api.resend.com/emails",
                        {
                            method: "POST",
                            headers: {
                                Authorization: `Bearer ${env.RESEND_API_KEY}`,
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                from: env.EMAIL_FROM,
                                to: data.email,
                                subject: "Sign in to Grabient",
                                html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2>Sign in to Grabient</h2>
                  <p>Click the button below to sign in to your account:</p>
                  <a href="${data.url}"
                     style="display: inline-block; padding: 12px 24px; background-color: #0070f3;
                            color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
                    Sign In
                  </a>
                  <p style="color: #666; font-size: 14px;">
                    This link will expire in 5 minutes. If you didn't request this email, you can safely ignore it.
                  </p>
                  <p style="color: #999; font-size: 12px;">
                    Or copy and paste this URL into your browser:<br/>
                    ${data.url}
                  </p>
                </div>
              `,
                            }),
                        },
                    );

                    if (!response.ok) {
                        const error = await response.text();
                        throw new Error(`Failed to send email: ${error}`);
                    }
                } catch (error) {
                    console.error("Error sending magic link:", error);
                    throw error;
                }
            },
            sendDeleteAccountVerification: async (data, request) => {
                try {
                    const url = new URL(request?.url || "https://grabient.com");
                    const customUrl = `${url.origin}/settings?token=${data.token}`;

                    const response = await fetch(
                        "https://api.resend.com/emails",
                        {
                            method: "POST",
                            headers: {
                                Authorization: `Bearer ${env.RESEND_API_KEY}`,
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                from: env.EMAIL_FROM,
                                to: data.user.email,
                                subject: "Confirm Account Deletion - Grabient",
                                html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #dc2626;">Confirm Account Deletion</h2>
                  <p>You requested to delete your Grabient account (${data.user.email}).</p>
                  <p><strong>This action is permanent and cannot be undone.</strong></p>
                  <p>Click the button below to complete the deletion. You'll need to be logged in to confirm.</p>
                  <a href="${customUrl}"
                     style="display: inline-block; padding: 12px 24px; background-color: #dc2626;
                            color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
                    Delete My Account
                  </a>
                  <p style="color: #666; font-size: 14px;">
                    This link will expire in 24 hours.
                  </p>
                </div>
              `,
                            }),
                        },
                    );

                    if (!response.ok) {
                        const error = await response.text();
                        throw new Error(`Failed to send email: ${error}`);
                    }
                } catch (error) {
                    throw error;
                }
            },
        });
        return handler.fetch(request, {
            context: {
                db,
                fromFetch: true,
                env,
                isGdprRegion,
                country,
            },
        });
    },
};
