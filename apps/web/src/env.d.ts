declare module "*.css" {
  const text: string;
  export default text;
}

declare module "*/manifest.json" {
  const manifest: Record<string, { file: string; css?: string[] }>;
  export default manifest;
}

interface Env {
  DB: D1Database;
  UPLOADS: R2Bucket;
  AI?: Ai;
  VECTORIZE?: VectorizeIndex;
  SEARCH_CACHE?: KVNamespace;
  OG_IMAGE_CACHE?: KVNamespace;
  RATE_LIMITER?: DurableObjectNamespace;
  PUBLIC_ORIGIN?: string;
  R2_PUBLIC_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  TURNSTILE_SECRET_KEY: string;
  TURNSTILE_SITE_KEY?: string;
}
