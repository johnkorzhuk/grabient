# Production Deployment Checklist

Minimal checklist for production deployments. Check items as you configure them.

## Environment Variables

### Required Secrets (set via Cloudflare dashboard or `wrangler secret put`)
- [ ] `BETTER_AUTH_SECRET` - Generate new secret for production
- [ ] `GOOGLE_CLIENT_ID` - Production OAuth credentials
- [ ] `GOOGLE_CLIENT_SECRET` - Production OAuth credentials
- [ ] `RESEND_API_KEY` - Email service API key
- [ ] `R2_ACCESS_KEY_ID` - R2 bucket access (if using presigned URLs)
- [ ] `R2_SECRET_ACCESS_KEY` - R2 bucket secret (if using presigned URLs)

### Public Variables (set in `wrangler.jsonc` vars)
- [ ] `EMAIL_FROM` - Production sender email
- [ ] `R2_PUBLIC_URL` - Production R2 public URL or custom domain
- [ ] `R2_ACCOUNT_ID` - Cloudflare account ID

## Cloudflare Configuration

### R2 Storage
- [ ] Create production R2 bucket
- [ ] Configure CORS policy with production domains:
  ```json
  [
    {
      "AllowedOrigins": ["https://yourdomain.com"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["Content-Type", "Content-Length"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
  ```
- [ ] Enable public access (or configure custom domain)
- [ ] Add R2 binding to `wrangler.jsonc`:
  ```json
  "r2_buckets": [
    {
      "binding": "AVATARS",
      "bucket_name": "production-bucket-name"
    }
  ]
  ```

### D1 Database
- [ ] Create production D1 database
- [ ] Update `database_id` in `wrangler.jsonc`
- [ ] Run migrations: `pnpm db:migrate`

### OAuth Providers
- [ ] Add production callback URLs to Google OAuth console:
  - `https://yourdomain.com/api/auth/callback/google`
- [ ] Update authorized domains

### Domain & DNS
- [ ] Configure custom domain in Cloudflare Workers
- [ ] Set up DNS records
- [ ] Enable SSL/TLS (Full or Full Strict)

## Security

- [ ] Rotate `BETTER_AUTH_SECRET` (never reuse dev secret)
- [ ] Review CORS origins (remove localhost)
- [ ] Verify OAuth redirect URIs match production
- [ ] Set CSP headers if needed
- [ ] Review rate limits in `src/core/middleware/rate-limit.ts`:
  - Contact form: 5 per 10 min
  - Magic link: 5 per min
  - Avatar upload: 10 per hour
  - Toggle like: 20 per min
  - Account mutation: 30 per hour

## Email

- [ ] Verify production domain in Resend
- [ ] Test magic link emails work
- [ ] Test account deletion emails work
- [ ] Update email templates with production branding/links

## Pre-Deploy

- [ ] Run `pnpm build` locally to verify
- [ ] Test critical flows in staging if available
- [ ] Review recent commits
- [ ] Backup database if migrating

## Deploy

```bash
pnpm build
wrangler deploy
```

## Post-Deploy

- [ ] Test authentication flow (magic link + Google OAuth)
- [ ] Test profile updates (username, avatar)
- [ ] Verify R2 uploads work
- [ ] Check email delivery
- [ ] Monitor error logs
- [ ] Test on mobile devices

## Monitoring

- [ ] Set up Cloudflare Workers analytics
- [ ] Configure error tracking (Sentry, etc.)
- [ ] Monitor R2 storage usage
- [ ] Monitor D1 database size
- [ ] Set up uptime monitoring

---

**Note**: This is a living document. Add items as you discover production requirements.
