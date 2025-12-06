# palette-ops

Admin dashboard for palette tagging operations. Manages AI-generated tags for validated (liked) palettes and supports tag refinement using Claude Opus 4.5.

## Overview

This internal tool generates semantic tags for color palettes using multiple LLMs, then refines the consensus output using Claude Opus 4.5. The refined tags are used for vector search in the public-facing application.

**Key capabilities:**
- Multi-model tag generation (10 providers including Groq, Google, OpenAI, Anthropic)
- Tag refinement via Claude Opus 4.5 with extended thinking
- Batch processing support via Anthropic Message Batches API
- Status monitoring and tag viewer UI

## Tech Stack

- **Framework:** TanStack Start (React meta-framework)
- **Runtime:** Cloudflare Workers with D1 database
- **Build:** Vite with Cloudflare Vite plugin
- **Data fetching:** React Query

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Dashboard with tagging/refinement status and controls |
| `/tags` | Tag viewer for browsing validated palettes and their generated tags |

## Project Structure

```
src/
  routes/
    index.tsx          # Dashboard with status panels and controls
    tags.tsx           # Tag viewer for browsing palette tags
    api/
      status.ts        # GET /api/status - tagging progress
      generate.ts      # POST /api/generate - generate tags for pending palettes
      results.$seed.ts # GET /api/results/:seed - raw tags for a seed
      refine/          # Refinement endpoints (single, batch, batch status)
  lib/
    providers.ts       # Multi-model AI provider configuration
    refinement.ts      # Opus 4.5 refinement logic
    tagging.ts         # Tag aggregation utilities
    prompts/           # Versioned prompts for tag generation
```

## Database

Uses the shared `grabient-prod` D1 database (same as user-application).

**Key tables:**
- `palette_tags` - Raw tags from each LLM provider
- `palette_tag_refinements` - Refined tags from Opus 4.5

**Configuration (`wrangler.jsonc`):**
- Uses `remote: true` to connect directly to production D1 during local development
- No local database state; changes affect production immediately

## Development

### Prerequisites

Create `.dev.vars` with API keys (see `.dev.vars.example`):

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
GROQ_API_KEY=gsk_...
```

### Running locally

```bash
pnpm dev  # Starts on port 3001
```

### Data migration

Tag data can be exported and imported between environments using wrangler commands:

```bash
# Export from production
wrangler d1 export grabient-prod --output=data-export/tags.sql --table=palette_tags

# Import to production
wrangler d1 execute grabient-prod --file=data-export/tags.sql
```

The `data-export/` directory is gitignored.

## Related Documentation

- [Palette Tagging System](/docs/palette_tagging.md) - Full architecture and pipeline documentation
- [Migration Guide](/docs/migration/00-overview.md) - How this app was created from user-application and tagging-service
