# 02: Migrate palette_tag_refined to Convex

> **Branch**: `vector-seed`
> **App**: `apps/grabient-ops` (TanStack Start + Convex)
> **Reference**: `apps/palette-ops/src/lib/refinement.ts`

## Overview

Migrate the Opus 4.5 refinement system (Stage 2) from Cloudflare Workers to Convex Workflow. This stage aggregates multi-model consensus from Stage 1 and produces canonical tags for vector embedding.

## Pipeline Position

```
Stage 1: Multi-Model Tagging (01-palette-tags.md)
  └── 10 providers → palette_tags

Stage 2: Opus 4.5 Refinement (this doc)  ◀── YOU ARE HERE
  └── Aggregate consensus + palette image → Opus 4.5 → palette_tag_refined
  └── Produces embed_text for semantic search
```

---

## 1. What Refinement Does

From `apps/palette-ops/src/lib/refinement.ts`:

1. **Aggregate** - Collect all palette_tags for a seed, count tag frequencies
2. **Generate image** - Create palette image (linearSwatches, 11 steps, 90°) and upload to R2
3. **Summarize** - Build `TagSummary` with categorical votes, tag counts, and image URL
4. **Refine** - Send to Opus 4.5 with image + extended thinking
5. **Store** - Save refined tags + `embed_text` for vectorization

**Output schema:**
```typescript
{
  temperature: "warm" | "cool" | "neutral" | "cool-warm",
  contrast: "high" | "medium" | "low",
  brightness: "dark" | "light" | "medium" | "varied",
  saturation: "vibrant" | "muted" | "mixed",
  mood: string[],           // 2-5 emotional qualities
  style: string[],          // 2-5 design movements
  dominant_colors: string[], // 1-4 from canonical list
  seasonal: string[],       // 0-2 if clearly seasonal
  associations: string[],   // 5-10 concrete nouns
  embed_text: string        // 30-50 words for vector search
}
```

### 1.2 Token Usage Tracking

Persist token usage from Anthropic batch results for cost analysis.

**Anthropic batch result structure:**
```json
{
  "custom_id": "idx_0",
  "result": {
    "type": "succeeded",
    "message": {
      "usage": {
        "input_tokens": 1250,
        "output_tokens": 450
      }
    }
  }
}
```

**Schema includes usage:**
```typescript
palette_tag_refined: defineTable({
  // ... other fields
  usage: v.optional(v.object({
    inputTokens: v.number(),
    outputTokens: v.number(),
  })),
})
```

---

## 2. Cloudflare R2 Setup

Palette images are stored in R2 and served via CDN URL to Anthropic's batch API. This avoids embedding large base64 data in batch requests.

### 2.1 Prerequisites

1. **Cloudflare account** with R2 enabled
2. **Create R2 bucket** in Cloudflare dashboard (e.g., `grabient-palette-images`)

### 2.2 Create API Token

1. Go to Cloudflare Dashboard → R2 → **Manage R2 API Tokens**
2. Click **Create API Token**
3. Set permissions: **Object Read & Write**
4. Select your bucket under **Specify bucket**
5. Click **Create API Token**
6. Save the four values shown:
   - Token Value → `R2_TOKEN`
   - Access Key ID → `R2_ACCESS_KEY_ID`
   - Secret Access Key → `R2_SECRET_ACCESS_KEY`
   - Endpoint → `R2_ENDPOINT`

### 2.3 Configure CORS

Add CORS policy to your bucket (R2 → Bucket → Settings → CORS):

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["Content-Type"]
  }
]
```

### 2.4 Install R2 Component

```bash
pnpm add @convex-dev/r2
```

**File:** `convex/convex.config.ts`
```typescript
import { defineApp } from "convex/server";
import workflow from "@convex-dev/workflow/convex.config.js";
import r2 from "@convex-dev/r2/convex.config.js";

const app = defineApp();
app.use(workflow);
app.use(r2);
export default app;
```

### 2.5 Set Environment Variables

```bash
npx convex env set R2_TOKEN <token-value>
npx convex env set R2_ACCESS_KEY_ID <access-key-id>
npx convex env set R2_SECRET_ACCESS_KEY <secret-access-key>
npx convex env set R2_ENDPOINT <endpoint-url>
npx convex env set R2_BUCKET grabient-palette-images
```

---

## 3. Palette Image Generation

Image generation is a **separate action** that runs independently of the refinement workflow. Images should be pre-generated and uploaded to R2 before refinement begins.

### 3.1 Constants

```typescript
// convex/constants.ts
export const PALETTE_STEPS = 11;  // Number of color stops
export const PALETTE_STYLE = "linearSwatches" as const;
export const PALETTE_ANGLE = 90;  // degrees
export const PALETTE_IMAGE_WIDTH = 440;  // low-res for LLM
export const PALETTE_IMAGE_HEIGHT = 100;
```

### 3.2 Generate and Upload Action

This action can be called independently to generate images for palettes. Run it before starting refinement workflows.

```typescript
// convex/images/generate.ts
import { action } from "../_generated/server";
import { v } from "convex/values";
import { R2 } from "@convex-dev/r2";
import { Resvg } from "@cf-wasm/resvg/workerd";
import { components, internal } from "../_generated/api";
import { generateSvgGradient } from "@repo/data-ops/gradient-gen/svg";
import {
  PALETTE_STEPS,
  PALETTE_STYLE,
  PALETTE_ANGLE,
  PALETTE_IMAGE_WIDTH,
  PALETTE_IMAGE_HEIGHT
} from "../constants";

const r2 = new R2(components.r2);

export const generatePaletteImage = action({
  args: { seed: v.string(), hexColors: v.array(v.string()) },
  handler: async (ctx, args) => {
    // Generate SVG
    const svg = generateSvgGradient(
      args.hexColors,
      PALETTE_STYLE,
      PALETTE_ANGLE,
      { seed: args.seed, searchString: "" },
      null,
      { width: PALETTE_IMAGE_WIDTH, height: PALETTE_IMAGE_HEIGHT }
    );

    // Convert SVG to PNG using resvg WASM
    const resvg = await Resvg.async(svg, {
      fitTo: { mode: "width", value: PALETTE_IMAGE_WIDTH },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    // Upload to R2
    const key = `palettes/${args.seed}.png`;
    await r2.store(ctx, new Uint8Array(pngBuffer), { key, type: "image/png" });

    // Get the image URL
    const imageUrl = await r2.getUrl(key);

    // Save URL to palette record
    await ctx.runMutation(internal.images.saveImageUrl, {
      seed: args.seed,
      imageUrl,
    });

    return imageUrl;
  },
});
```

### 3.3 Batch Image Generation

Generate images for all palettes that don't have one yet:

```typescript
// convex/images/generateAll.ts
export const generateAllMissing = action({
  args: {},
  handler: async (ctx) => {
    // Query palettes without images
    // Generate and upload each one
    // Can be called from UI or scheduled
  },
});
```

> **Reference:** See `apps/user-application/src/routes/api/og.ts` for the existing resvg WASM pattern.

---

## 4. Anthropic Image Support

Anthropic supports images via URL in batch requests ([docs](https://docs.claude.com/en/docs/build-with-claude/vision)):

```json
{
  "custom_id": "idx_0",
  "params": {
    "model": "claude-opus-4-5-20251101",
    "max_tokens": 4096,
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "image",
            "source": {
              "type": "url",
              "url": "https://r2.example.com/palettes/abc123.png"
            }
          },
          {
            "type": "text",
            "text": "Analyze this palette..."
          }
        ]
      }
    ]
  }
}
```

**Limits:**
- Max 20 images per request
- Max 3.75 MB per image
- Supported formats: JPEG, PNG, GIF, WebP

---

## 5. Anthropic Batch API

Unlike Stage 1 providers, Opus 4.5 refinement uses **Anthropic's Message Batches API** for 50% cost savings.

**Key differences from OpenAI batch:**
- Results via `results_url` (JSONL download)
- Uses `custom_id` for request tracking
- Supports extended thinking (`thinking.budget_tokens`)

**Docs:** [Anthropic Message Batches](https://docs.anthropic.com/en/docs/build-with-claude/batch-processing)

---

## 6. Workflow Implementation

### 6.1 Refinement Workflow

**File:** `convex/refinement/workflows.ts`

```typescript
import { v } from "convex/values";
import { workflow } from "../workflow";
import { internal } from "../_generated/api";

export const refinementWorkflow = workflow.define({
  args: {
    seeds: v.array(v.string()),
    sourcePromptVersion: v.string(),
    refinementPromptVersion: v.string(),
  },
  handler: async (step, args) => {
    // Step 1: Build tag summaries for each seed
    const summaries = await step.runQuery(
      internal.refinement.buildSummaries,
      { seeds: args.seeds, sourcePromptVersion: args.sourcePromptVersion }
    );

    // Step 2: Submit to Anthropic batch API
    const batchId = await step.runAction(
      internal.refinement.submitBatch,
      { summaries, refinementPromptVersion: args.refinementPromptVersion }
    );

    // Step 3: Poll until complete
    let isComplete = false;
    while (!isComplete) {
      await step.runMutation(
        internal.refinement.waitStep,
        {},
        { runAfter: 60000 } // 60 seconds
      );

      const status = await step.runAction(
        internal.refinement.checkBatchStatus,
        { batchId }
      );
      isComplete = status === "ended";
    }

    // Step 4: Process results and store
    await step.runAction(
      internal.refinement.processBatchResults,
      {
        batchId,
        seeds: args.seeds,
        refinementPromptVersion: args.refinementPromptVersion,
      }
    );
  },
});
```

### 6.2 Building Tag Summaries

**File:** `convex/refinement/buildSummaries.ts`

Query that aggregates palette_tags into summaries:

```typescript
import { query } from "../_generated/server";
import { v } from "convex/values";

export const buildSummaries = query({
  args: {
    seeds: v.array(v.string()),
    sourcePromptVersion: v.string(),
  },
  handler: async (ctx, args) => {
    // For each seed, fetch all palette_tags with matching prompt version
    // Aggregate categorical votes and tag frequencies
    // Return TagSummary[] for batch submission
    // Reference: apps/palette-ops/src/lib/tagging.ts buildTagSummary()
  },
});
```

### 6.3 Anthropic Batch Actions

**File:** `convex/refinement/anthropic.ts`

```typescript
import { internalAction } from "../_generated/server";
import { v } from "convex/values";

export const submitBatch = internalAction({
  args: {
    summaries: v.any(),
    refinementPromptVersion: v.string(),
  },
  handler: async (ctx, args) => {
    // Create batch requests with Opus 4.5 + extended thinking
    // Submit to Anthropic batch API
    // Return batch ID
    // Reference: apps/palette-ops/src/lib/refinement.ts createBatchRequests()
  },
});

export const checkBatchStatus = internalAction({
  args: { batchId: v.string() },
  handler: async (ctx, args) => {
    // Poll Anthropic API for batch status
    // Reference: apps/palette-ops/src/lib/refinement.ts getBatchStatus()
  },
});

export const processBatchResults = internalAction({
  args: {
    batchId: v.string(),
    seeds: v.array(v.string()),
    refinementPromptVersion: v.string(),
  },
  handler: async (ctx, args) => {
    // Fetch results from results_url
    // Parse and validate each response
    // Store via mutation to palette_tag_refined
    // Reference: apps/palette-ops/src/lib/refinement.ts getBatchResults()
  },
});
```

---

## 7. Triggering Refinement

### 7.1 Manual Trigger

**File:** `convex/refinement/start.ts`

```typescript
export const startRefinement = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Query seeds that have completed tagging but not refinement
    // Start refinement workflow
  },
});
```

### 7.2 Automatic Chaining

When tagging workflow completes, optionally trigger refinement:

```typescript
// In convex/tagging/onComplete.ts
export const handleCompletion = mutation({
  handler: async (ctx, args) => {
    if (args.result.kind === "success") {
      // Check if all providers complete for these seeds
      // If so, start refinement workflow
      await workflow.start(ctx, internal.refinement.workflows.refinementWorkflow, {
        seeds: completedSeeds,
        sourcePromptVersion: CURRENT_VERSION,
        refinementPromptVersion: REFINEMENT_VERSION,
      });
    }
  },
});
```

---

## 8. UI Integration

### 8.1 Refinement Status Subscription

```typescript
// Real-time refinement progress
const refinementStatus = useQuery(api.refinement.status);
// { totalTagged, refined, pending, errors }
```

### 8.2 Workflow Progress

```typescript
const activeWorkflows = useQuery(api.refinement.activeWorkflows);
// Shows batch submission → polling → processing stages
```

### 8.3 Dashboard Panel

Build a "Batch Refinement" panel that:
- Shows pending seed count
- Allows setting batch limit
- Displays active batch status with real-time updates
- No manual "Process Results" button needed (workflow handles it)

---

## 9. Schema

Uses the `Table` helper from `convex-helpers/server` for cleaner definitions. See [example-schema](./example-schema-that-is-way-too-complicated-for-what-we-need.md) for patterns (though grabient-ops uses a simpler schema).

**File:** `convex/schema.ts`

```typescript
import { defineSchema } from "convex/server";
import { v } from "convex/values";
import { Table } from "convex-helpers/server";

export const Palettes = Table("palettes", {
  seed: v.string(),
  // ... other palette fields
  imageUrl: v.optional(v.string()),  // R2 URL for palette image
});

export const PaletteTagRefined = Table("palette_tag_refined", {
  seed: v.string(),
  refinementPromptVersion: v.string(),
  sourcePromptVersion: v.string(),

  // Categorical
  temperature: v.string(),
  contrast: v.string(),
  brightness: v.string(),
  saturation: v.string(),

  // Tag arrays
  mood: v.array(v.string()),
  style: v.array(v.string()),
  dominant_colors: v.array(v.string()),
  seasonal: v.array(v.string()),
  associations: v.array(v.string()),

  // For vector embedding
  embed_text: v.string(),

  // Token usage from Anthropic
  usage: v.optional(v.object({
    inputTokens: v.number(),
    outputTokens: v.number(),
  })),

  createdAt: v.number(),
});

export default defineSchema({
  palettes: Palettes.table.index("by_seed", ["seed"]),
  palette_tag_refined: PaletteTagRefined.table.index("by_seed", ["seed"]),
});
```

---

## 10. Migration Steps

1. **Add schema** - Define `palette_tag_refined` table
2. **Copy prompts** - Port `REFINEMENT_SYSTEM_PROMPT` from existing code
3. **Implement buildSummaries** - Query aggregation logic
4. **Implement Anthropic actions** - Batch submit/poll/process
5. **Define workflow** - Wire up the steps
6. **Add UI components** - Real-time status and controls
7. **Test** - Verify batch processing and results
8. **Chain workflows** - Auto-trigger refinement after tagging

---

## 11. Testing Checklist

- [ ] Tag summaries build correctly from palette_tags
- [ ] Anthropic batch submission succeeds
- [ ] Polling detects completion
- [ ] Results parse and validate against schema
- [ ] Refined tags stored in database
- [ ] UI shows real-time workflow progress
- [ ] Automatic chaining works (tagging → refinement)

---

## References

### Existing Code
- `apps/palette-ops/src/lib/refinement.ts` - Refinement logic
- `apps/palette-ops/src/lib/prompts/index.ts` - System prompts
- `apps/palette-ops/src/routes/index.tsx` - Current UI (BatchRefinementPanel)

### Anthropic
- [Message Batches API](https://docs.anthropic.com/en/docs/build-with-claude/batch-processing)
- [Extended Thinking](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking)

### Convex
- [Workflow Component](https://www.convex.dev/components/workflow)
- [Actions](https://docs.convex.dev/functions/actions)
