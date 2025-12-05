# Step 4: Final Steps - Cleanup & Validation

## Goal
1. Remove migrated code from user-application and delete tagging-service
2. Validate clean separation between apps
3. Prepare for future vector search integration

## Pre-Cleanup Checklist

Before removing any code, verify:

- [ ] `palette-ops` app builds successfully
- [ ] API endpoints work (`/api/status`, `/api/refine/status`)
- [ ] Tag panel UI renders correctly
- [ ] Admin liked palettes query works
- [ ] Database reads work (pointing to correct D1 database)

## Steps

### 4.1 Remove from user-application

#### Delete Files

```bash
# Delete tag panel component
rm apps/user-application/src/components/palettes/palette-tags-panel.tsx

# If there are no other files in the palettes folder, remove it
# Otherwise keep the folder for other palette components
```

#### Remove Server Function

**Edit `apps/user-application/src/server-functions/palettes.ts`:**

Delete the `getPaletteTagsForSeed` function and its imports.

```typescript
// DELETE THIS ENTIRE FUNCTION:
export const getPaletteTagsForSeed = createServerFn({ method: "GET" })
  .validator((seed: string) => seed)
  .handler(async ({ data: seed }) => {
    // ... all implementation
  });

// Also remove these imports if no longer used:
import { paletteTags, paletteTagRefinements } from "@data-ops/shared/drizzle/app-schema";
```

#### Remove Query Options

**Edit `apps/user-application/src/queries/palettes.ts`:**

Delete `paletteTagsQueryOptions` if it exists.

```typescript
// DELETE:
export const paletteTagsQueryOptions = (seed: string) =>
  queryOptions({
    queryKey: ["palette-tags", seed],
    // ...
  });
```

#### Remove Route Usage

If there's a route that renders the tag panel, update or remove it.

Search for imports of `palette-tags-panel` or `paletteTagsQueryOptions`:

```bash
grep -r "palette-tags-panel" apps/user-application/src/
grep -r "paletteTagsQueryOptions" apps/user-application/src/
```

Update any routes that import these to remove the admin-only tag viewing feature.

### 4.2 Delete tagging-service

Once palette-ops is verified working:

```bash
# Remove entire tagging-service directory
rm -rf apps/tagging-service
```

### 4.3 Update Drizzle Config

**Edit `packages/data-ops/drizzle.config.local.ts`:**

Point to the new palette-ops database location:

```typescript
const config: Config = {
  out: "./src/drizzle",
  schema: ["./src/drizzle/auth-schema.ts", "./src/drizzle/app-schema.ts"],
  dialect: "sqlite",
  dbCredentials: {
    // Update path from tagging-service to palette-ops
    url: "../../apps/palette-ops/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/[hash].sqlite",
  },
  tablesFilter: ["!auth_*"],
};
```

Note: The hash filename will be generated when you first run `pnpm dev` in palette-ops.

### 4.4 Update pnpm-workspace.yaml

If your workspace file lists apps explicitly:

```yaml
packages:
  - "packages/*"
  - "apps/user-application"
  - "apps/palette-ops"       # Add
  # Remove tagging-service reference if present
```

### 4.5 Update Root package.json Scripts

If you have root-level scripts that reference tagging-service:

```json
{
  "scripts": {
    "dev:user": "pnpm --filter user-application dev",
    "dev:ops": "pnpm --filter palette-ops dev",
    // Remove any tagging-service scripts
  }
}
```

### 4.6 Update CI/CD

If you have GitHub Actions or other CI that deploys tagging-service:

1. Remove tagging-service deployment job
2. Add palette-ops deployment job (same pattern as user-application)

### 4.7 Configure Cloudflare Access

After deploying palette-ops with `wrangler deploy`:

1. Go to Cloudflare Dashboard → Zero Trust → Access → Applications
2. Click "Add an application" → Self-hosted
3. Configure:
   - **Application name**: palette-ops
   - **Session duration**: 24 hours (or preferred)
   - **Application domain**: `palette-ops.<subdomain>.workers.dev` (or custom domain)
4. Add policy:
   - **Policy name**: Admin access
   - **Action**: Allow
   - **Include**: Emails ending in `@yourdomain.com` (or specific email addresses)
5. Save

Users must now authenticate before accessing any route.

**Docs**: [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)

### 4.8 Clean Up Git

After verifying everything works:

```bash
# Stage removals
git add -A

# Review what's being removed
git status

# Commit the cleanup
git commit -m "chore: remove migrated code, delete tagging-service"
```

## Final Architecture

After cleanup:

```
apps/
  user-application/          # Public app - no admin tag features
  palette-ops/               # Admin dashboard - owns all tagging
packages/
  data-ops/                  # Shared schemas, queries, types
```

## Verification Checklist

- [ ] `user-application` builds without errors
- [ ] `user-application` runs without tag panel code
- [ ] `palette-ops` builds without errors
- [ ] `palette-ops` API endpoints all work
- [ ] `palette-ops` tag panel renders
- [ ] Drizzle Studio connects to correct database
- [ ] No references to deleted files in codebase

```bash
# Final verification
pnpm --filter user-application build
pnpm --filter palette-ops build

# Search for any remaining references
grep -r "tagging-service" .
grep -r "palette-tags-panel" apps/user-application/
```

---

## 4.9 Validate App Separation

**Critical**: Ensure `user-application` has no direct access to tagging tables or APIs.

### Verify No Direct Table Access

`user-application` should NOT import or query these tables directly:
- `paletteTags`
- `paletteTagRefinements`

```bash
# These should return NO results in user-application
grep -r "paletteTags" apps/user-application/src/
grep -r "paletteTagRefinements" apps/user-application/src/
grep -r "palette_tags" apps/user-application/src/
```

### Verify No Tagging API Exposure

`user-application` should NOT have any routes or server functions that:
- Generate tags
- Run refinements
- Directly read raw tag data

The only tag-related data `user-application` will access is through **vector search** (not yet implemented).

### Data Flow Reminder

```
palette-ops (admin)              user-application (public)
       │                                  │
       ▼                                  │
  palette_tags                            │
  palette_tag_refinements                 │
       │                                  │
       ▼                                  │
  [Future: Vector embeddings] ──────────► Vector search results
```

**Current state**: Tag data exists but is not exposed to users yet.
**Future state**: Vector search will provide semantic palette discovery.

---

## 4.10 Future Work: Vector Search Integration

Vector search is **not part of this migration** but is the next step. Document for future reference:

### Planned Architecture

1. `palette-ops` generates `embed_text` field during refinement
2. `embed_text` is converted to vector embeddings (Cloudflare Vectorize or similar)
3. `user-application` queries vector DB for semantic search
4. Results return palette seeds, not raw tag data

### Files to Create (Future)

| App | File | Purpose |
|-----|------|---------|
| `palette-ops` | `src/lib/embeddings.ts` | Generate embeddings from `embed_text` |
| `palette-ops` | `src/routes/api/embeddings/generate.ts` | Batch embedding generation |
| `user-application` | `src/server-functions/search.ts` | Vector search queries |
| `user-application` | `src/routes/search.tsx` | Search UI |

### Resources

- [Cloudflare Vectorize](https://developers.cloudflare.com/vectorize/)
- [Workers AI Embeddings](https://developers.cloudflare.com/workers-ai/models/embedding/)

## Rollback Plan

If something goes wrong:

1. Revert the cleanup commit: `git revert HEAD`
2. Or restore from `master` branch: `git checkout master -- apps/tagging-service`
3. The original code still exists in `master` until this branch is merged

> **Note**: This migration is being done in the `vector-seed` branch. The original `tagging-service` and admin UI code remain intact in `master` until merge.

## Summary

| Removed From | What |
|--------------|------|
| `user-application` | `palette-tags-panel.tsx`, tag server functions, tag queries |
| `apps/` | Entire `tagging-service/` directory |

| Added To | What |
|----------|------|
| `palette-ops` | All tagging API routes, admin UI, refinement logic |

The migration is complete. `palette-ops` is now the single source of truth for all palette tagging functionality.
