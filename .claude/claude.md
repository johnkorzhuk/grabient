# Development Guidelines for Grabient

## Package: data-ops

The `packages/data-ops` package contains database schemas, queries, and data operations. This package is built using TypeScript and **must be rebuilt** after making changes.

### Critical Workflow: When Editing Database Queries or Schemas

Whenever you make changes to files in `packages/data-ops/src/`, you **MUST** rebuild the package before the changes take effect:

```bash
cd packages/data-ops
pnpm run build
```

**Why?** The application imports from `packages/data-ops/dist/` (compiled output), not from `src/` (source files). If you don't rebuild, your changes won't be reflected in the running application.

#### Files that require rebuild:
- `src/queries/*.ts` - All query functions
- `src/drizzle/app-schema.ts` - Database schema definitions
- `src/database/setup.ts` - Database configuration
- Any other TypeScript files in the package

### Database Schema Changes

When modifying the database schema:

1. **Edit the schema**: Make changes to `src/drizzle/app-schema.ts`
2. **Generate migration**: Run `pnpm run drizzle:generate` to create migration SQL files
3. **Apply migration**:
   - Local: `pnpx wrangler d1 execute grabient --file=./packages/data-ops/src/drizzle/XXXX_migration_name.sql --local`
   - Remote: `pnpx wrangler d1 execute grabient --file=./packages/data-ops/src/drizzle/XXXX_migration_name.sql`
4. **Rebuild the package**: `cd packages/data-ops && pnpm run build`
5. **Restart dev server**: The user-application dev server may need to be restarted to pick up changes

### Common Issues

#### Issue: "no such column" or "no such table" errors
**Cause**: Database schema changes weren't applied via migration
**Fix**: Run the migration files using wrangler d1 execute

#### Issue: Changes to queries not reflected in app
**Cause**: Forgot to rebuild the data-ops package
**Fix**: Run `cd packages/data-ops && pnpm run build`

#### Issue: SQL errors with aliases in ORDER BY
**Cause**: In Drizzle ORM with SQLite, you can't reference SELECT aliases directly in ORDER BY. You must use the same SQL expression.
**Fix**: Store the SQL expression in a variable and use it in both SELECT and ORDER BY:
```typescript
const likesCountSql = sql<number>`COALESCE(COUNT(${likes.id}), 0)`;
db.select({
  likesCount: likesCountSql,
})
.orderBy(desc(likesCountSql)) // Use the same expression, not sql`likesCount`
```

### Authentication Routes

The application uses Better Auth with middleware protection:

- Protected routes are defined in `apps/user-application/src/core/middleware/auth.ts`
- Routes starting with `/saved` require authentication
- Unauthenticated users are redirected to `/sign-in`

### Monorepo Structure

This is a pnpm monorepo. When making changes:
- Packages in `/packages` may be dependencies of apps in `/apps`
- Built packages export from their `dist/` directories
- Always rebuild packages after source changes

### Development Checklist

Before committing changes involving data-ops:
- [ ] Rebuilt the data-ops package (`pnpm run build`)
- [ ] Applied any database migrations (local and/or remote)
- [ ] Tested the changes in the running application
- [ ] Verified no SQL errors in the browser console or server logs
