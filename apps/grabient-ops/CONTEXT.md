# Grabient-Ops Context

## Architecture

### Backfill Tags System

The tagging system uses provider **batch APIs** for efficient, cost-effective tag generation.

```
Dashboard "Start Backfill" button
    ↓
backfillActions:startBackfill
    ├─ For each provider (Anthropic, OpenAI, Groq):
    │   ├─ Query palettes needing tags
    │   ├─ Build batch of (palette × analysisCount) requests
    │   └─ Submit to provider batch API
    │
    └─ Returns: { batchesCreated, totalRequests }

Provider processes batch asynchronously (up to 24h)
    ↓
Dashboard "Poll" button (or scheduled cron)
    ↓
backfillActions:pollActiveBatches
    ├─ For each active batch:
    │   ├─ Check status with provider
    │   ├─ If completed, fetch results
    │   └─ Store results to palette_tags table
    │
    └─ Real-time UI updates via Convex subscriptions
```

### Key Concepts

- **tagAnalysisCount**: Config value (1-20) for how many times each palette gets tagged per provider
- **Batch APIs**: 50% cost savings, 24h processing window, no rate limit impact
- **Provider Batches**: Each provider (Anthropic, OpenAI, Groq) gets one batch per model

### Schema

```typescript
// Config singleton
config: { tagAnalysisCount: number }

// Palettes (seeded from D1)
palettes: { seed, imageUrl }

// Individual tag results
palette_tags: {
  seed, provider, model, analysisIndex,
  promptVersion, tags, error?, usage?
}

// Batch tracking
tag_batches: {
  provider, batchId, status,
  requestCount, completedCount, failedCount,
  createdAt, completedAt?, error?
}

// Refinement (Stage 2)
palette_tag_refined: { seed, tags, embedText, usage? }
```

### Files

```
convex/
├── config.ts           # Config queries/mutations
├── backfill.ts         # Batch management mutations
├── backfillActions.ts  # Node.js actions for batch APIs
├── status.ts           # Refinement status queries
├── seed.ts             # D1 import actions
├── palettes.ts         # Palette queries
└── lib/
    ├── providers.ts    # TagResponse schema
    ├── prompts.ts      # System prompt
    └── colorData.ts    # Color data generation
```

### Environment Variables

Set in Convex dashboard:
- `OPENAI_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GROQ_API_KEY`

### Providers

10 models across 4 providers:

| Provider | Models |
|----------|--------|
| Groq | llama-3.3-70b, llama-4-scout, qwen3-32b, gpt-oss-120b, gpt-oss-20b |
| Google | gemini-2.0-flash, gemini-2.5-flash-lite |
| OpenAI | gpt-4o-mini, gpt-5-nano |
| Anthropic | claude-3-5-haiku |

### Example: tagAnalysisCount=8, 182 palettes

- Total requests: 182 × 8 × 10 = 14,560 tag generations
- Per provider: 182 × 8 = 1,456 requests batched together
- Cost: 50% discount via batch APIs

### Automatic Polling

A cron job runs every 5 minutes to poll active batches:
- `convex/crons.ts` - Scheduled job definition
- `backfillActions:pollActiveBatchesInternal` - Internal action

### Migration Commands

For existing data with legacy `runNumber` field:

```bash
# Check migration status
npx convex run migrations:checkMigrationStatus

# Migrate runNumber → analysisIndex
npx convex run migrations:migrateRunNumberToAnalysisIndex

# (Optional) Clear legacy runNumber after verifying migration
npx convex run migrations:clearLegacyRunNumber
```

## What's Left

### Refinement (Stage 2)
- Aggregate tags from Stage 1
- Use Opus 4.5 with Anthropic batch API
- Generate embedText for vector search

### Google Batch API
- Currently not implemented (complex API)
- Using parallel sync calls as fallback
