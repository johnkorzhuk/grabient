export type Deployment = "development" | "preview" | "staging" | "production";

/* The Worker's bindings, as cloudflare.config.ts declares them per mode. A binding a mode leaves out is optional
   here, and the code that needs it answers as if its feature were off. */
export interface Env {
  DEPLOYMENT: Deployment;
  /** The origin in canonicals, sitemaps and share links. A Preview and local development use the request's. */
  PUBLIC_ORIGIN?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_SECRET?: string;
  /** The name every Preview address ends in, so one sign-in serves every branch's Preview. */
  COOKIE_DOMAIN?: string;
  INDEXNOW_KEY?: string;
  EMAIL_FROM: string;
  EMAIL?: SendEmail;
  NEWSLETTER_FROM?: string;
  R2_PUBLIC_URL?: string;
  /** How many seconds a connected app's access token lasts, where a deploy shortens it (oauth/server.ts). */
  OAUTH_ACCESS_TTL?: string;

  DB: D1Database;
  UPLOADS?: R2Bucket;
  SEARCH_SNAPSHOTS?: R2Bucket;
  CACHE?: KVNamespace;
  OAUTH_KV?: KVNamespace;
  RATE_LIMITER?: DurableObjectNamespace;
  USAGE?: AnalyticsEngineDataset;
  ANALYTICS?: { query(options: { query: string; params?: unknown[] }): Promise<unknown> };
  AI?: Ai;
  ASSETS: Fetcher;

  // Secrets that may be unset: each feature that needs one is off without it.
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  GITHUB_TOKEN?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** The tokens two directories ask the site to serve, set on the day without a code change. */
  OPENAI_APPS_CHALLENGE?: string;
  MCP_REGISTRY_AUTH?: string;
  /** The one address the app reviewers' account signs in with by password (the MCP directories' review). */
  REVIEWER_EMAIL?: string;
}
