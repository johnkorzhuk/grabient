import process from "node:process";
import {
  bindings,
  type CloudflareConfig,
  defineConfig,
  exports,
  triggers,
  type WorkerConfig
} from "cf/config";

/* One app, three Workers and a local one. A mode inherits nothing from another, so each names every resource it
   binds: a production deploy that kept staging's bindings would serve staging's database on grabient.com.

   - development: `vite dev`, every binding simulated on this machine.
   - staging: grabient-staging on staging.grabient.com, on a snapshot of production's data.
     Its branch Previews (`cf previews deploy`) share a database of their own.
   - production: grabient-production on grabient.com.

   A Vite build without `--mode` is a production build, so the production case refuses to build unless
   GRABIENT_RELEASE says so (the `deploy:production` script sets it). Deploys pass `--no-provision`, so a binding
   whose resource is missing fails the deploy instead of creating one. */

export const DATABASES = {
  staging: { name: "grabient-staging", id: "597c5ce0-b20a-4bb4-892f-35dc508cf19b" },
  previews: { name: "grabient-staging-previews", id: "6efd4bb2-e81b-4166-b177-fec9f84a173d" },
  production: { name: "grabient-prod", id: "8902a4a8-cca3-4a34-b456-7b35ad021985" },
  development: { name: "grabient-dev", id: "00000000-0000-4000-8000-000000000000" }
} as const;

export const ORIGINS = {
  staging: "https://staging.grabient.com",
  production: "https://grabient.com"
} as const;

// grabient.com is onboarded to Email Sending, and the EMAIL binding may send from this address alone.
const EMAIL_FROM = "noreply@grabient.com";
// The newsletter goes through Resend, on a sender it has verified: Email Sending takes only the emails a reader asks for.
const NEWSLETTER_FROM = "news@grabient.com";
// The uploads bucket every deploy but production writes avatars to, and its public address.
const DEV_UPLOADS = {
  name: "grabient-uploads-dev",
  url: "https://pub-a081a47d10f74a968f0995c41036fbe4.r2.dev"
};

function base(name: string): WorkerConfig {
  return {
    name,
    compatibilityDate: "2026-10-01",
    /* The OAuth library reads another app's client metadata document only with this flag, so a fetch that a
       client_id names never reaches this zone's own origin. Node compatibility is on by default since 2026-08-04. */
    compatibilityFlags: ["global_fetch_strictly_public"],
    entrypoint: "./src/server.ts",
    // The most one invocation may spend: the heaviest request measured about 250 ms of CPU, a full search build
    // about 1.6 s at ten times today's data. D1, KV, R2 and fetch calls count as subrequests.
    limits: { cpuMs: 3000, subrequests: 2000 },
    // Static files are served without running the Worker and are free. Workers Cache would bill each of them.
    cache: { enabled: false },
    // Query strings carry sign-in and deletion tokens. Traces stay off by name: a later compatibility date turns them
    // on at full sampling for any Worker that only enables observability, and they bill with the logs.
    observability: {
      enabled: true,
      redactQueryString: true,
      issues: { enabled: true },
      logs: { enabled: true, invocationLogs: false },
      traces: { enabled: false }
    },
    // Every 10 minutes: the seeding queue, IndexNow, the star count and the search snapshot (rebuilt only when
    // something public changed). Every six hours: hot scores and database upkeep. src/server/jobs.ts matches these.
    triggers: [
      triggers.scheduled({ schedule: "*/10 * * * *" }),
      triggers.scheduled({ schedule: "5 */6 * * *" })
    ]
  };
}

function production(): CloudflareConfig {
  if (process.env.GRABIENT_RELEASE !== "production") {
    throw new Error(
      "A production build needs GRABIENT_RELEASE=production. Run `pnpm deploy:production`."
    );
  }
  return {
    worker: {
      ...base("grabient-production"),
      // grabient.com alone: a workers.dev address would serve the same Worker outside the zone's rules.
      domains: ["grabient.com", "www.grabient.com"],
      workersDev: false,
      previewUrls: false,
      // The class has stored its counters in the key-value backend since grabient.com first deployed it. A class
      // keeps its backend for life, and any change to it blocks rollbacks.
      exports: { RateLimiter: exports.durableObject({ storage: "legacy-kv" }) },
      env: {
        DEPLOYMENT: bindings.text("production"),
        PUBLIC_ORIGIN: bindings.text(ORIGINS.production),
        BETTER_AUTH_URL: bindings.text(ORIGINS.production),
        BETTER_AUTH_SECRET: bindings.secret(),
        // Served at /{key}.txt so search engines take the site's lists of new pages. Public by design.
        INDEXNOW_KEY: bindings.text("72485ec9cfd023fba2cad980920af669"),
        EMAIL_FROM: bindings.text(EMAIL_FROM),
        EMAIL: bindings.sendEmail({ allowedSenderAddresses: [EMAIL_FROM] }),
        NEWSLETTER_FROM: bindings.text(NEWSLETTER_FROM),
        R2_PUBLIC_URL: bindings.text("https://cdn.grabient.com"),
        DB: bindings.d1(DATABASES.production),
        UPLOADS: bindings.r2({ name: "grabient-uploads" }),
        SEARCH_SNAPSHOTS: bindings.r2({ name: "grabient-search-snapshots-production" }),
        CACHE: bindings.kv({ id: "f43a67e1a657473fbe09db8c94e77ed9" }),
        OAUTH_KV: bindings.kv({ id: "e4aa0161bda441c38d861fc065fe1073" }),
        RATE_LIMITER: bindings.durableObject({
          worker: "grabient-production",
          exportName: "RateLimiter"
        }),
        USAGE: bindings.analyticsEngineDataset({ name: "grabient_usage" }),
        ANALYTICS: bindings.analytics(),
        AI: bindings.ai(),
        ASSETS: bindings.assets()
      }
    }
  };
}

function staging(): CloudflareConfig {
  return {
    worker: {
      ...base("grabient-staging"),
      domains: ["staging.grabient.com"],
      workersDev: false,
      previewUrls: true,
      exports: { RateLimiter: exports.durableObject({ storage: "sqlite" }) },
      env: {
        DEPLOYMENT: bindings.text("staging"),
        PUBLIC_ORIGIN: bindings.text(ORIGINS.staging),
        BETTER_AUTH_URL: bindings.text(ORIGINS.staging),
        BETTER_AUTH_SECRET: bindings.secret(),
        EMAIL_FROM: bindings.text(EMAIL_FROM),
        EMAIL: bindings.sendEmail({ allowedSenderAddresses: [EMAIL_FROM] }),
        NEWSLETTER_FROM: bindings.text(NEWSLETTER_FROM),
        R2_PUBLIC_URL: bindings.text(DEV_UPLOADS.url),
        DB: bindings.d1(DATABASES.staging),
        UPLOADS: bindings.r2({ name: DEV_UPLOADS.name }),
        SEARCH_SNAPSHOTS: bindings.r2({ name: "grabient-staging-snapshots" }),
        CACHE: bindings.kv({ id: "d2bf88b0e0924f3aa2df279257585f97" }),
        OAUTH_KV: bindings.kv({ id: "ea4105282c9a46269c43d9e646875815" }),
        RATE_LIMITER: bindings.durableObject({
          worker: "grabient-staging",
          exportName: "RateLimiter"
        }),
        USAGE: bindings.analyticsEngineDataset({ name: "grabient_staging_usage" }),
        ANALYTICS: bindings.analytics(),
        AI: bindings.ai(),
        ASSETS: bindings.assets()
      }
    }
  };
}

/* A branch's copy of staging, which Workers Builds deploys for every push to a branch other than staging and master.
   It reads and writes a database every Preview shares, holding the public part of staging's data, and runs no cron.
   Its secrets come from the Previews' base config. RATE_LIMITER is bound by Worker name, so Previews count against
   staging's ceilings. COOKIE_DOMAIN sets the session cookie for the name every Preview address ends in, so one
   sign-in serves every branch. */
function preview(): CloudflareConfig {
  const { triggers: _crons, ...worker } = base("grabient-staging");
  return {
    worker: {
      ...worker,
      workersDev: true,
      previewUrls: true,
      exports: { RateLimiter: exports.durableObject({ storage: "sqlite" }) },
      env: {
        DEPLOYMENT: bindings.text("preview"),
        BETTER_AUTH_SECRET: bindings.secret(),
        COOKIE_DOMAIN: bindings.text("jkorzhuk.workers.dev"),
        EMAIL_FROM: bindings.text(EMAIL_FROM),
        EMAIL: bindings.sendEmail({ allowedSenderAddresses: [EMAIL_FROM] }),
        R2_PUBLIC_URL: bindings.text(DEV_UPLOADS.url),
        DB: bindings.d1(DATABASES.previews),
        UPLOADS: bindings.r2({ name: DEV_UPLOADS.name }),
        OAUTH_KV: bindings.kv({ id: "6e967f58fd2240e3bd42641962aaae97" }),
        RATE_LIMITER: bindings.durableObject({
          worker: "grabient-staging",
          exportName: "RateLimiter"
        }),
        ASSETS: bindings.assets()
      }
    }
  };
}

// `vite dev`: every binding is simulated locally and kept under .cloudflare/state. No paid service is reached.
function development(): CloudflareConfig {
  return {
    worker: {
      ...base("grabient-dev"),
      exports: { RateLimiter: exports.durableObject({ storage: "sqlite" }) },
      env: {
        DEPLOYMENT: bindings.text("development"),
        EMAIL_FROM: bindings.text(EMAIL_FROM),
        EMAIL: bindings.sendEmail({ allowedSenderAddresses: [EMAIL_FROM] }),
        NEWSLETTER_FROM: bindings.text(NEWSLETTER_FROM),
        DB: bindings.d1(DATABASES.development),
        UPLOADS: bindings.r2({ name: "grabient-dev-uploads" }),
        SEARCH_SNAPSHOTS: bindings.r2({ name: "grabient-dev-snapshots" }),
        CACHE: bindings.kv({ id: "00000000000000000000000000000001" }),
        OAUTH_KV: bindings.kv({ id: "00000000000000000000000000000002" }),
        RATE_LIMITER: bindings.durableObject({ worker: "grabient-dev", exportName: "RateLimiter" }),
        USAGE: bindings.analyticsEngineDataset({ name: "grabient_dev_usage" }),
        ASSETS: bindings.assets()
      }
    }
  };
}

export default defineConfig(ctx => {
  if (ctx.isPreview) return preview();
  switch (ctx.mode) {
    case "production":
      return production();
    case "staging":
      return staging();
    default:
      return development();
  }
});
