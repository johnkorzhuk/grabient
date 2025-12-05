# Palette Tagging System Migration

> **Branch**: This work is being done in the `vector-seed` branch, not `master`.

## Overview

Migrate the admin-only palette tagging functionality from `user-application` to a new standalone app called `palette-ops` (palette operations dashboard). This creates clean separation between the public-facing app and internal tooling.

## Current Architecture (Before)

```
apps/
  user-application/          # Public app + admin tag viewer (mixed)
  tagging-service/           # API-only service for AI tagging
packages/
  data-ops/                  # Shared schemas, queries, types
```

**Problems:**
- Admin UI code in user-application adds unnecessary bundle size
- Each Cloudflare Workers app creates its own local D1 database in `.wrangler/state/v3/d1/` - no shared state between apps locally
- No clear separation of concerns

## Target Architecture (After)

```
apps/
  user-application/          # Public app ONLY - no admin features
  palette-ops/               # Internal dashboard for tagging + analysis
packages/
  data-ops/                  # Shared schemas, queries, types (unchanged)
```

**Key principles:**
1. `user-application` - Consumer-facing, reads from vector DB only (eventually)
2. `palette-ops` - Admin dashboard, owns tagging database, generates vector embeddings
3. Clear data flow: `palette-ops` writes → vector DB → `user-application` reads

## What Gets Moved

### From `user-application` → `palette-ops`

| File | Purpose |
|------|---------|
| `src/components/palettes/palette-tags-panel.tsx` | Tag analysis UI (785 lines) |
| `src/queries/palettes.ts` → `paletteTagsQueryOptions` | Tag query function |
| `src/server-functions/palettes.ts` → `getPaletteTagsForSeed` | Server function |
| Admin role check logic | Auth middleware for admin-only access |

### From `tagging-service` → `palette-ops` (merge)

| File | Purpose |
|------|---------|
| `src/lib/providers.ts` | Multi-model AI tag generation |
| `src/lib/refinement.ts` | Opus 4.5 refinement logic |
| `src/lib/prompts/index.ts` | Prompt versioning |
| `src/lib/color-data.ts` | Color data generation |
| `src/hono/app.ts` | API endpoints |

### Stays in `user-application`

- All public routes and components
- Auth system (Better Auth)
- Like/save functionality
- Palette viewing/browsing

## Deployment & Security

`palette-ops` is deployed to **Cloudflare Workers** and protected by **Cloudflare Access** (zero-trust auth). Only authorized admins can access it.

### Data Flow
```
palette-ops (deployed) → generates tags → production D1 database
                                               ↓
                                    shared with user-application
                                               ↓
user-application (deployed) ← reads tag data for vector search
```

### Cloudflare Access Setup

1. Deploy `palette-ops` to Cloudflare Workers (`wrangler deploy`)
2. In Cloudflare Dashboard → Zero Trust → Access → Applications
3. Add application:
   - **Name**: palette-ops
   - **Domain**: `palette-ops.<your-subdomain>.workers.dev` (or custom domain)
   - **Policy**: Allow only specific emails (your admin emails)
4. Users must authenticate via email OTP or SSO before reaching the app

No code changes needed - Cloudflare Access sits in front of your app.

**Docs**:
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)
- [Workers Deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/)

### Database Strategy

Both apps connect to the same production D1 database:
- `palette-ops` writes to `palette_tags` and `palette_tag_refinements`
- `user-application` reads tag data for display/search
- Same `grabient` database binding in both `wrangler.jsonc` files

### Shared Code: `@data-ops/shared`

The `packages/data-ops` package contains shared schemas, queries, and utilities. **Always check `@data-ops/shared` before writing new logic** - it likely already exists.

```typescript
// Import from the shared package
import { paletteTags, paletteTagRefinements } from "@data-ops/shared/drizzle/app-schema";
import { getDb } from "@data-ops/shared/db";
```

Key exports:
- `src/drizzle/app-schema.ts` - All table schemas (`paletteTags`, `paletteTagRefinements`, etc.)
- `src/drizzle/auth-schema.ts` - Auth-related schemas
- `src/db.ts` - Database utilities
- `src/queries/` - Reusable query functions

**Do not recreate logic that exists in `data-ops`** - import and reuse it instead.

## Migration Steps

See individual docs:
1. `01-create-palette-ops.md` - Create new app structure
2. `02-move-tagging-service.md` - Merge tagging-service code
3. `03-move-admin-ui.md` - Move admin components from user-application
4. `04-cleanup.md` - Final steps: cleanup, validation, and future work

## Key Files Reference

### Schema (stays in `packages/data-ops`)
- `src/drizzle/app-schema.ts` - `paletteTags`, `paletteTagRefinements` tables
- `src/drizzle/0011_add_palette_tags.sql` - Tags migration
- `src/drizzle/0012_add_palette_tag_refinements.sql` - Refinements migration

### Types
```typescript
// From refinement.ts - RefinedTags schema
{
  temperature: "warm" | "cool" | "neutral" | "cool-warm",
  contrast: "high" | "medium" | "low",
  brightness: "dark" | "light" | "medium" | "varied",
  saturation: "vibrant" | "muted" | "mixed",
  mood: string[],
  style: string[],
  dominant_colors: string[],
  seasonal: string[],
  associations: string[],
  embed_text: string  // For vector search
}
```

### API Endpoints (current tagging-service)
- `GET /status` - Tagging status
- `POST /generate` - Generate tags for pending palettes
- `GET /results/:seed` - Get raw tags for seed
- `GET /refine/status` - Refinement status
- `POST /refine/single/:seed` - Refine single palette
- `POST /refine/batch` - Start batch refinement (returns seedMapping)
- `GET /refine/batch/:batchId` - Check batch status
- `POST /refine/batch/:batchId/process` - Process batch results (requires seedMapping)
- `GET /refine/results/:seed` - Get refinement result

### Prompt Versions
- `CURRENT_PROMPT_VERSION` - Hash of tagging prompt (auto-generated)
- `REFINEMENT_PROMPT_VERSION` - Currently "v2" (simplified output)

## Quick Reference

```bash
# Start palette-ops dev server
pnpm --filter palette-ops dev

# Open Drizzle Studio (ensure drizzle.config.local.ts points to palette-ops database)
cd packages/data-ops && pnpm drizzle-kit studio

# Check tagging status
curl http://localhost:3001/api/status

# Check refinement status
curl http://localhost:3001/api/refine/status

# Submit batch refinement
curl -X POST http://localhost:3001/api/refine/batch -H "Content-Type: application/json" -d '{"limit": 10}'
# Returns batchId and seedMapping

# Process batch results (pass seedMapping from submission response)
curl -X POST http://localhost:3001/api/refine/batch/BATCH_ID/process -H "Content-Type: application/json" -d '{"seedMapping": {...}}'
```
