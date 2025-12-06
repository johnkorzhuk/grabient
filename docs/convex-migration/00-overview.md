# Convex Migration Overview

> **Branch**: `vector-seed`
> **New App**: `apps/grabient-ops`

## Goal

Migrate the palette tagging pipeline from Cloudflare Workers + D1 to Convex, enabling:

- Real-time progress updates
- Provider batch API support (50% cost savings)
- **Durable workflows** with automatic retries
- Type-safe database operations

## Architecture

```
BEFORE:
  apps/palette-ops (Cloudflare Workers + D1)
  └── Sequential processing, no batching, no real-time updates

AFTER:
  apps/grabient-ops (TanStack Start + Convex + Workflow)
  └── Batch APIs, durable workflows, real-time subscriptions
```

## Migration Order

Execute in this order:

1. **Create grabient-ops app** (see 01-palette-tags.md § 1.1)
2. **Seed palettes from D1** - Import admin liked palettes
3. **Generate palette images** - Run image generation action for all palettes
4. **Run imageUrl migration** - Make `imageUrl` required (not optional)
5. **Stage 1: Tagging** - Run multi-model tagging workflows
6. **Stage 2: Refinement** - Run Opus 4.5 refinement with images

## Migration Documents

| Doc | Purpose |
|-----|---------|
| [01-palette-tags.md](./01-palette-tags.md) | Stage 1: Multi-model tag generation with Convex Workflow |
| [02-palette-refinements.md](./02-palette-refinements.md) | Stage 2: Opus 4.5 refinement with Anthropic batch API |
| [03-admin-ui.md](./03-admin-ui.md) | Admin dashboard with real-time workflow controls |

## Seed Script: Import Palettes from D1

Before running any workflows, seed the Convex database with liked palettes from production D1.

### What Gets Imported

- All liked palettes from users with `role = 'admin'` in production D1
- Seeds are unique identifiers for each palette

### Seed Script Location

```
apps/grabient-ops/convex/seed/
├── importFromD1.ts     # Action to fetch and import palettes
└── palettes.ts         # Mutation to insert palettes
```

### Implementation

```typescript
// convex/seed/importFromD1.ts
import { action } from "../_generated/server";
import { internal } from "../_generated/api";

// Copy the D1 database URL and credentials from apps/palette-ops/.dev.vars
// Set as Convex environment variables:
// - D1_DATABASE_URL (or use Cloudflare API to query D1)

export const importAdminLikedPalettes = action({
  handler: async (ctx) => {
    // 1. Query production D1 for admin liked palettes
    // 2. Call mutation to insert each palette
    // Reference: apps/palette-ops wrangler.jsonc for D1 binding
  },
});
```

### Running the Seed

```bash
# After setting up grabient-ops
npx convex run seed/importFromD1:importAdminLikedPalettes
```

### Image Generation (After Seeding)

After palettes are seeded, generate images for each:

```bash
# Generate images for all palettes without imageUrl
npx convex run images/generate:generateAllMissing
```

### Make imageUrl Required

After all images are generated, run a Convex migration to make `imageUrl` required:

1. Update schema: change `imageUrl: v.optional(v.string())` to `imageUrl: v.string()`
2. Deploy: `npx convex deploy`

This ensures refinement always has an image URL available.

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        grabient-ops                              │
├─────────────────────────────────────────────────────────────────┤
│  Seed: Import admin liked palettes from D1                      │
│  └── Run once before any workflows                              │
├─────────────────────────────────────────────────────────────────┤
│  Images: Generate palette images → R2                           │
│  └── Run after seeding, before refinement                       │
├─────────────────────────────────────────────────────────────────┤
│  Stage 1: Multi-Model Tagging                                   │
│  ├── 10 LLM providers (OpenAI, Gemini, Groq, Anthropic)         │
│  ├── Batch APIs for 50% cost savings                            │
│  ├── Convex Workflow for durable orchestration                  │
│  └── Output: palette_tags table                                 │
├─────────────────────────────────────────────────────────────────┤
│  Stage 2: Opus 4.5 Refinement                                   │
│  ├── Aggregates consensus from Stage 1                          │
│  ├── Anthropic Message Batches API + palette image              │
│  ├── Extended thinking for quality refinement                   │
│  └── Output: palette_tag_refined (embed_text for vectors)       │
├─────────────────────────────────────────────────────────────────┤
│  UI: TanStack Start + Convex React                              │
│  └── Real-time workflow status via subscriptions (no polling)   │
└─────────────────────────────────────────────────────────────────┘
```

## Package Installation

**Important:** Install packages manually using pnpm commands. Do not just create a package.json with all dependencies listed.

```bash
# From apps/grabient-ops
pnpm add convex-helpers
pnpm add openai @anthropic-ai/sdk @google/generative-ai groq-sdk zod nanoid
pnpm add @convex-dev/workflow @convex-dev/r2
pnpm add @cf-wasm/resvg
```

The `convex-helpers` package provides utilities like `Table` for cleaner schema definitions. See [example-schema](./example-schema-that-is-way-too-complicated-for-what-we-need.md) for schema patterns (though grabient-ops uses a simpler schema).

See each migration doc for specific package requirements.

## Key References

### Existing Code
- `apps/palette-ops/` - Current implementation (reference for business logic)
- `apps/palette-ops/.dev.vars` - API keys to copy
- `apps/palette-ops/wrangler.jsonc` - D1 database binding
- `docs/palette_tagging.md` - System architecture
- `packages/data-ops/src/drizzle/app-schema.ts` - Current D1 schema

### Convex Docs
- [TanStack Start Quickstart](https://docs.convex.dev/quickstart/tanstack-start)
- [Workflow Component](https://www.convex.dev/components/workflow)
- [R2 Component](https://www.convex.dev/components/cloudflare-r2)
- [Schemas](https://docs.convex.dev/database/schemas)
- [Actions](https://docs.convex.dev/functions/actions)

### Provider Batch APIs
- [OpenAI Batch API](https://platform.openai.com/docs/guides/batch)
- [Google Gemini Batch API](https://ai.google.dev/gemini-api/docs/batch-api)
- [Groq Batch API](https://console.groq.com/docs/batch)
- [Anthropic Message Batches](https://docs.anthropic.com/en/docs/build-with-claude/batch-processing)

## Cleanup (After Migration)

Once grabient-ops is fully operational:

1. Deprecate `apps/palette-ops`
2. Remove D1 database references
3. Update any CI/CD pipelines
