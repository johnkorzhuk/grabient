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
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
}
