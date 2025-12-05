# Step 2: Move Tagging Service Code

## Goal
Merge all tagging-service functionality into palette-ops, converting from Hono API to TanStack Start API routes.

## Source Files

From `apps/tagging-service/`:

| Source | Destination | Notes |
|--------|-------------|-------|
| `src/lib/providers.ts` | `src/lib/providers.ts` | Multi-model tag generation |
| `src/lib/refinement.ts` | `src/lib/refinement.ts` | Opus 4.5 refinement |
| `src/lib/color-data.ts` | `src/lib/color-data.ts` | Color analysis utilities |
| `src/lib/prompts/index.ts` | `src/lib/prompts/index.ts` | Prompt versioning |
| `src/hono/app.ts` | `src/routes/api/*` | Convert to file routes |

## Steps

### 2.1 Copy Library Files

```bash
# From monorepo root
cp apps/tagging-service/src/lib/providers.ts apps/palette-ops/src/lib/
cp apps/tagging-service/src/lib/refinement.ts apps/palette-ops/src/lib/
cp apps/tagging-service/src/lib/color-data.ts apps/palette-ops/src/lib/
mkdir -p apps/palette-ops/src/lib/prompts
cp apps/tagging-service/src/lib/prompts/index.ts apps/palette-ops/src/lib/prompts/
```

### 2.2 Update Import Paths

In each copied file, update imports:

```typescript
// Old (tagging-service)
import { paletteTags } from "@data-ops/shared/drizzle/app-schema";

// New (palette-ops) - same, no change needed if using workspace package
import { paletteTags } from "@data-ops/shared/drizzle/app-schema";
```

### 2.3 Convert API Routes

Convert Hono endpoints from `tagging-service/src/hono/app.ts` to TanStack Start API routes.

See: [TanStack Start API Routes](https://tanstack.com/start/latest/docs/framework/react/api-routes)

### 2.4 Route Mapping

| Hono Endpoint | TanStack Start File |
|---------------|---------------------|
| `GET /status` | `src/routes/api/status.ts` |
| `POST /generate` | `src/routes/api/generate.ts` |
| `GET /results/:seed` | `src/routes/api/results.$seed.ts` |
| `GET /refine/status` | `src/routes/api/refine/status.ts` |
| `POST /refine/single/:seed` | `src/routes/api/refine/single.$seed.ts` |
| `POST /refine/batch` | `src/routes/api/refine/batch.ts` |
| `GET /refine/batch/:batchId` | `src/routes/api/refine/batch.$batchId.ts` |
| `POST /refine/batch/:batchId/process` | `src/routes/api/refine/batch.$batchId.process.ts` |
| `GET /refine/results/:seed` | `src/routes/api/refine/results.$seed.ts` |

## Key Differences: Hono → TanStack Start

| Hono | TanStack Start |
|------|----------------|
| `c.env.DB` | `context.cloudflare.env.DB` |
| `c.json({...})` | `Response.json({...})` |
| `c.req.json()` | `request.json()` |
| `c.req.param("seed")` | `params.seed` |
| Route params via `/:seed` | File naming `$seed.ts` |

## Verification

```bash
cd apps/palette-ops
pnpm dev

# Test status endpoint
curl http://localhost:3001/api/status
```

## Next Step

Continue to [03-move-admin-ui.md](./03-move-admin-ui.md) to move the admin UI components.
