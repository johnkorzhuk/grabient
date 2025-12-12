# PostHog Reverse Proxy

Cloudflare Worker that proxies PostHog requests through your domain to bypass ad blockers.

## Why?

Ad blockers maintain lists of known analytics domains and block requests to them. A reverse proxy routes events through your own domain, which ad blockers haven't cataloged. This typically **increases event capture by 10-30%**.

## Setup

### 1. Install Dependencies

```bash
cd apps/posthog-proxy
pnpm install
```

### 2. Deploy the Worker

```bash
pnpm deploy
```

### 3. Add Custom Domain

In Cloudflare Dashboard:
1. Go to Workers & Pages → posthog-proxy
2. Click "Settings" → "Triggers" → "Custom Domains"
3. Add a subdomain like `e.yourdomain.com`

**Important**: Avoid obvious names like `analytics`, `tracking`, `posthog`, or `telemetry`. Use something neutral like `e`, `ph`, or random characters.

### 4. Update Client Configuration

In your main app's `.env` file, set:

```env
VITE_POSTHOG_API_HOST=https://e.yourdomain.com
```

Replace `e.yourdomain.com` with your actual proxy subdomain.

## Development

```bash
pnpm dev
```

This runs the worker locally on `http://localhost:8787`.

## How It Works

1. **Static assets** (`/static/*`) - Fetched from PostHog's asset server and cached for 24 hours
2. **API requests** - Forwarded to PostHog with proper headers (preserves client IP via `X-Forwarded-For`)

## Region Configuration

The worker is configured for **US region** by default. If you use PostHog EU, edit `src/index.ts`:

```typescript
// For EU region:
const POSTHOG_HOST = "eu.i.posthog.com";
const POSTHOG_ASSET_HOST = "eu-assets.i.posthog.com";
```

## Limits

| Limit | Value |
|-------|-------|
| PostHog events | Up to 1 MB |
| Session recordings | Up to 64 MB per message |
| Cloudflare Workers (paid) | No request limit (pay per use) |

The $5/month Workers plan handles all PostHog traffic without issues.
