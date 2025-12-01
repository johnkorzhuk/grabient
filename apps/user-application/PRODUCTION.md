# Production Readiness Checklist

This document tracks critical items that must be addressed before deploying to production with real users.

## 🚨 Critical - Must Fix Before Production

### Security & Configuration

- [ ] **CORS Configuration**: Update `r2-cors.json` to restrict `AllowedOrigins` from `["*"]` to your actual domain(s)
  - File: `apps/user-application/r2-cors.json`
  - Change `"AllowedOrigins": ["*"]` to `"AllowedOrigins": ["https://yourdomain.com", "https://www.yourdomain.com"]`
  - Apply changes: `wrangler r2 bucket cors put grabient-uploads --file r2-cors.json`

### Rate Limiting

- [ ] **Avatar Upload Rate Limiting**: Implement rate limiting on avatar uploads
  - Target endpoints: `generateAvatarUploadUrl`, `confirmAvatarUpload`
  - Suggested limit: 5 avatar uploads per user per hour
  - Prevents abuse and storage costs
  - Files to modify: `apps/user-application/src/server-functions/avatar.ts`

## 📋 Recommended Improvements

### Performance & Scalability

- [ ] **Database Indexing**: Review and optimize D1 database indexes for common queries
- [ ] **Caching Strategy**: Implement caching for frequently accessed data
- [ ] **CDN Configuration**: Ensure R2 public URL is properly CDN-optimized

### Monitoring & Observability

- [ ] **Error Tracking**: Set up error tracking (e.g., Sentry)
- [ ] **Performance Monitoring**: Add performance monitoring
- [ ] **Usage Analytics**: Track key metrics (avatar uploads, user signups, etc.)
- [ ] **R2 Storage Monitoring**: Set up alerts for unexpected storage growth

### Data & Backup

- [ ] **Database Backups**: Configure automated D1 backups
- [ ] **R2 Versioning**: Consider enabling R2 object versioning for critical data
- [ ] **Data Retention Policy**: Define and implement data retention policies

### Security

- [ ] **Rate Limiting (General)**: Add rate limiting to all public endpoints
- [ ] **Content Security Policy**: Configure CSP headers
- [ ] **Environment Variables**: Audit all secrets are properly stored and rotated
- [ ] **Dependency Audit**: Run `pnpm audit` and address vulnerabilities

### Email & Communication

- [ ] **Email Deliverability**: Verify Resend configuration and domain authentication
- [ ] **Email Templates**: Review and test all email templates
- [ ] **Unsubscribe Flow**: Implement email preference management

### Legal & Compliance

- [ ] **Privacy Policy**: Create and publish privacy policy
- [ ] **Terms of Service**: Create and publish terms of service
- [ ] **Cookie Consent**: Implement cookie consent if required by jurisdiction
- [ ] **GDPR Compliance**: Ensure GDPR compliance if serving EU users
  - Right to access
  - Right to deletion (already implemented via account deletion)
  - Right to data portability

## ✅ Already Implemented

- ✅ Server-side file size validation for avatar uploads (max 5MB)
- ✅ File content validation for avatar images (magic byte verification)
- ✅ Single avatar file per user (no timestamp-based keys)
- ✅ Authentication on all protected endpoints
- ✅ Content-Type validation for uploads
- ✅ URL validation to prevent injection
- ✅ Old avatar cleanup on new upload
- ✅ Image compression and optimization (WebP, 256x256, ~100KB)
- ✅ Presigned URL expiration (1 hour)
- ✅ Account deletion flow with email verification

## 🧹 Post-Production Cleanup

Once production is live and verified, delete these temporary migration files:

- [ ] `MIGRATION-CONTEXT.md` (root)
- [ ] `PRODUCTION-SECRETS.md` (root)
- [ ] `snapshot.zip` (Convex export, root)
- [ ] `packages/data-ops/src/data/prod-users.jsonl`
- [ ] `packages/data-ops/src/data/prod-accounts.jsonl`
- [ ] `packages/data-ops/src/data/clerk-to-betterauth-id-map.json`
- [ ] `packages/data-ops/src/scripts/seed-production.ts`
- [ ] `packages/data-ops/src/scripts/migrate-clerk-users.ts`
- [ ] Remove `CLERK_SECRET_KEY` from `.dev.vars`

## 🔄 Ongoing Maintenance

- [ ] Regular security updates for dependencies
- [ ] Monitor and respond to error rates
- [ ] Review and optimize slow database queries
- [ ] Clean up orphaned R2 objects (if any)
- [ ] Review and update email templates
- [ ] Test backup restoration procedures

## 📝 Notes

- This checklist should be reviewed and updated as the application evolves
- Mark items complete by changing `[ ]` to `[x]`
- Add new items as they're identified during development
- Consider automation for repetitive tasks where possible
