# 01: Migrate palette_tags to Convex

> **Branch**: `vector-seed`
> **New App**: `apps/grabient-ops` (TanStack Start + Convex)
> **Reference**: `apps/palette-ops/` for existing business logic

## Overview

Migrate the palette_tags generation system from Cloudflare D1 to Convex, using **Convex Workflow** for durable orchestration of batch API calls.

## Architecture Change

```
BEFORE: palette-ops (Cloudflare Workers + D1)
AFTER:  grabient-ops (TanStack Start + Convex + Workflow)
```

**Benefits:**
- **Durable workflows** that survive server restarts
- **Journaling** - completed steps cached and skipped on retry
- **Automatic retries** with exponential backoff
- 50% cost savings using provider batch APIs
- Real-time progress via Convex subscriptions

---

## 1. Create grabient-ops App

### 1.1 Project Setup

```bash
# From monorepo root
mkdir -p apps/grabient-ops
cd apps/grabient-ops

# Use Convex + TanStack Start template
npm create convex@latest -- -t tanstack-start

# Install dependencies manually (do not pre-populate package.json)
pnpm add openai @anthropic-ai/sdk @google/generative-ai groq-sdk zod nanoid
pnpm add @convex-dev/workflow
```

### 1.2 Register Workflow Component

**File:** `convex/convex.config.ts`

```typescript
import { defineApp } from "convex/server";
import workflow from "@convex-dev/workflow/convex.config.js";

const app = defineApp();
app.use(workflow);
export default app;
```

**File:** `convex/workflow.ts`

```typescript
import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "./_generated/api";

export const workflow = new WorkflowManager(components.workflow, {
  defaultRetryBehavior: {
    maxAttempts: 5,
    initialBackoffMs: 1000,
    base: 2,
  },
});
```

**Docs:**
- [Convex Workflow Component](https://www.convex.dev/components/workflow)
- [Durable Workflows Article](https://stack.convex.dev/durable-workflows-and-strong-guarantees)

### 1.3 Copy Shared Libraries

```bash
mkdir -p apps/grabient-ops/src/lib/prompts
cp apps/palette-ops/src/lib/color-data.ts apps/grabient-ops/src/lib/
cp apps/palette-ops/src/lib/prompts/index.ts apps/grabient-ops/src/lib/prompts/
```

---

## 2. Provider Batching Strategy

| Provider | Batch API | Cost Savings |
|----------|-----------|--------------|
| OpenAI | ✅ | 50% |
| Google Gemini | ✅ | 50% |
| Groq | ✅ | 50% |
| Anthropic (Haiku) | ✅ | 50% |

**Sources:**
- [OpenAI Batch API](https://platform.openai.com/docs/guides/batch)
- [Google Gemini Batch API](https://ai.google.dev/gemini-api/docs/batch-api)
- [Groq Batch API](https://console.groq.com/docs/batch)
- [Anthropic Message Batches](https://docs.anthropic.com/en/docs/build-with-claude/batch-processing)

---

## 3. Run Tracking System

### 3.1 The Problem

Each palette needs to be tagged by each provider **multiple times** (configurable via UI). This provides:
- Multiple data points for consensus aggregation
- Variation in tag generation (high temperature)
- Robustness against provider inconsistencies

### 3.2 Schema with Token Usage

Uses the `Table` helper from `convex-helpers/server` for cleaner definitions. See [example-schema](./example-schema-that-is-way-too-complicated-for-what-we-need.md) for patterns (though grabient-ops uses a simpler schema).

```typescript
// convex/schema.ts
import { defineSchema } from "convex/server";
import { v } from "convex/values";
import { Table } from "convex-helpers/server";

export const Palettes = Table("palettes", {
  seed: v.string(),
  imageUrl: v.optional(v.string()),  // R2 URL for palette image
  createdAt: v.number(),
});

export const PaletteTags = Table("palette_tags", {
  seed: v.string(),
  provider: v.string(),
  model: v.string(),
  runNumber: v.number(),        // Which run (1-N)
  promptVersion: v.string(),
  tags: v.any(),
  error: v.optional(v.string()),

  // Token usage (normalized across providers)
  usage: v.optional(v.object({
    inputTokens: v.number(),
    outputTokens: v.number(),
  })),

  createdAt: v.number(),
});

export default defineSchema({
  palettes: Palettes.table.index("by_seed", ["seed"]),
  palette_tags: PaletteTags.table
    .index("by_seed_run_provider", ["seed", "runNumber", "provider"])
    .index("by_run", ["runNumber"]),
});
```

### 3.3 Token Usage by Provider

Each batch API returns usage in the results. Extract and normalize to `{ inputTokens, outputTokens }`.

**OpenAI** ([docs](https://platform.openai.com/docs/api-reference/batch)):
```json
{
  "custom_id": "request-1",
  "response": {
    "body": {
      "usage": {
        "prompt_tokens": 25,
        "completion_tokens": 150,
        "total_tokens": 175
      }
    }
  }
}
```

**Anthropic** ([docs](https://docs.anthropic.com/en/docs/build-with-claude/batch-processing)):
```json
{
  "custom_id": "request-1",
  "result": {
    "type": "succeeded",
    "message": {
      "usage": {
        "input_tokens": 25,
        "output_tokens": 150
      }
    }
  }
}
```

**Google Gemini** ([docs](https://ai.google.dev/gemini-api/docs/batch-api)):
```json
{
  "response": {
    "usageMetadata": {
      "promptTokenCount": 25,
      "candidatesTokenCount": 150,
      "totalTokenCount": 175
    }
  }
}
```

**Groq** ([docs](https://console.groq.com/docs/batch)):
```json
{
  "custom_id": "request-1",
  "response": {
    "body": {
      "usage": {
        "prompt_tokens": 25,
        "completion_tokens": 150,
        "total_tokens": 175
      }
    }
  }
}
```

> **Note:** Refer to each provider's SDK types as the source of truth: `openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `groq-sdk`.

### 3.4 Normalizing Usage

```typescript
// convex/tagging/utils.ts
function normalizeUsage(provider: string, rawUsage: any): Usage {
  switch (provider) {
    case "openai":
    case "groq":
      return {
        inputTokens: rawUsage.prompt_tokens,
        outputTokens: rawUsage.completion_tokens,
      };
    case "anthropic":
      return {
        inputTokens: rawUsage.input_tokens,
        outputTokens: rawUsage.output_tokens,
      };
    case "google":
      return {
        inputTokens: rawUsage.promptTokenCount,
        outputTokens: rawUsage.candidatesTokenCount,
      };
    default:
      return { inputTokens: 0, outputTokens: 0 };
  }
}
```

### 3.5 How Runs Work

```
Run 1: All palettes × All providers (first pass)
Run 2: All palettes × All providers (second pass)
...
Run N: All palettes × All providers (Nth pass)
```

Admin sets target run count in UI (e.g., 8). System continues until all palettes reach that count.

**Determining current run:**
```typescript
// convex/tagging/runs.ts
export const getCurrentRun = query({
  handler: async (ctx) => {
    // Find the lowest run where not all seeds have all providers
    // Or start a new run if all complete
  },
});
```

### 3.6 Workflow vs Run Tracking

| Concern | Handled By |
|---------|------------|
| **Resuming after crash** | Workflow journaling (automatic) |
| **Which palettes need work** | Run tracking in database |
| **Which providers done for a seed** | Query `palette_tags` by seed + runNumber |
| **When to start new run** | Check if all seeds have all providers for current run |

**Key insight:** Workflows handle *durability within a batch*. Run tracking handles *progress across multiple batches*.

---

## 4. Workflow Implementation

### 4.1 How Workflows Work

From the [Convex article](https://stack.convex.dev/durable-workflows-and-strong-guarantees):

> The system operates via **journaling**, which records inputs and outputs of each step. When execution resumes after failure, previously completed steps are cached and skipped.

Key constraints:
- Workflow handlers must be **deterministic**
- All logic must be delegated to Convex functions via `step.run*`
- Use `step.runQuery`, `step.runMutation`, `step.runAction`

### 4.2 Batch Tagging Workflow

**File:** `convex/tagging/workflows.ts`

```typescript
import { v } from "convex/values";
import { workflow } from "../workflow";
import { internal } from "../_generated/api";

// Workflow for processing a batch of seeds through one provider
export const batchTaggingWorkflow = workflow.define({
  args: {
    seeds: v.array(v.string()),
    provider: v.string(),
    model: v.string(),
    promptVersion: v.string(),
  },
  handler: async (step, args) => {
    // Step 1: Submit batch to provider API
    const batchId = await step.runAction(
      internal.tagging.providers.submitBatch,
      {
        seeds: args.seeds,
        provider: args.provider,
        model: args.model,
      }
    );

    // Step 2: Poll until complete (each poll is a journaled step)
    let isComplete = false;
    while (!isComplete) {
      await step.runMutation(
        internal.tagging.providers.waitStep,
        {},
        { runAfter: 60000 } // 60 seconds
      );

      const status = await step.runAction(
        internal.tagging.providers.checkBatchStatus,
        { batchId, provider: args.provider }
      );
      isComplete = status === "completed";
    }

    // Step 3: Fetch results and store
    await step.runAction(
      internal.tagging.providers.processBatchResults,
      {
        batchId,
        provider: args.provider,
        model: args.model,
        promptVersion: args.promptVersion,
        seeds: args.seeds,
      }
    );
  },
});

```

### 4.3 Starting Workflows

**File:** `convex/tagging/start.ts`

```typescript
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { workflow } from "../workflow";
import { internal } from "../_generated/api";

export const startTagging = mutation({
  args: {
    seeds: v.array(v.string()),
    provider: v.string(),
    model: v.string(),
    promptVersion: v.string(),
  },
  handler: async (ctx, args) => {
    // All providers support batch APIs for 50% cost savings
    const workflowId = await workflow.start(
      ctx,
      internal.tagging.workflows.batchTaggingWorkflow,
      args,
      { onComplete: internal.tagging.onComplete.handleCompletion }
    );

    return workflowId;
  },
});
```

### 4.4 Handling Completion

**File:** `convex/tagging/onComplete.ts`

```typescript
import { mutation } from "../_generated/server";
import { vWorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";

export const handleCompletion = mutation({
  args: {
    workflowId: vWorkflowId,
    result: v.any(),
  },
  handler: async (ctx, args) => {
    if (args.result.kind === "success") {
      console.log(`Workflow ${args.workflowId} completed successfully`);
    } else if (args.result.kind === "error") {
      console.error(`Workflow ${args.workflowId} failed:`, args.result.error);
    }
  },
});
```

---

## 5. Provider Actions

**File:** `convex/tagging/providers.ts`

Implement the actual API calls as internal actions. Reference existing logic in `apps/palette-ops/src/lib/providers.ts`.

### 5.1 Temperature Setting

Use **high temperature** for all tagging calls to encourage diverse, creative tag generation. Note that temperature ranges differ by provider:

| Provider | Range | Recommended |
|----------|-------|-------------|
| Anthropic | 0.0 - 1.0 | 0.8 |
| OpenAI | 0.0 - 2.0 | 1.6 |
| Google Gemini | 0.0 - 2.0 | 1.6 |
| Groq | 0.0 - 2.0 | 1.6 |

> **Note:** 0.8 on Anthropic's 0-1 scale is equivalent to 1.6 on the 0-2 scale used by other providers.

```typescript
// Example for OpenAI/Groq/Gemini (0-2 range)
const response = await openai.chat.completions.create({
  model: args.model,
  temperature: 1.6, // Equivalent to 0.8 on 0-1 scale
  messages: [...],
});

// Example for Anthropic (0-1 range)
const response = await anthropic.messages.create({
  model: args.model,
  temperature: 0.8,
  messages: [...],
});
```

**Why high temperature?**
- Tags benefit from creative associations
- Multi-model consensus filters out noise anyway
- Low temperature produces repetitive, generic tags

**Note:** Some reasoning models (e.g., GPT-o series) don't support the temperature parameter.

### 5.2 Key Functions

- `submitBatch` - Upload JSONL and create batch job (provider-specific format)
- `checkBatchStatus` - Poll provider API for completion
- `processBatchResults` - Fetch results and store via mutation
- `waitStep` - Empty mutation used for `runAfter` delays

---

## 6. UI Integration

### 6.1 Pipeline Flow

The tagging system is **Stage 1** of a two-stage pipeline:

```
Stage 1: Multi-Model Tagging (this doc)
  └── 10 LLM providers generate tags for each palette
  └── Results stored in palette_tags table
  └── UI: "Tag Generation" panel

Stage 2: Opus 4.5 Refinement (02-palette-refinements.md)
  └── Aggregates consensus from Stage 1
  └── Opus 4.5 refines into canonical tags + embed_text
  └── Results stored in palette_tag_refined table
  └── UI: "Batch Refinement" panel
```

### 6.2 Current UI Architecture

The existing `apps/palette-ops` dashboard (see `src/routes/index.tsx`) has:

| Panel | Purpose | API Pattern |
|-------|---------|-------------|
| **Tagging Status** | Shows run progress | Polling via `useQuery` |
| **Refinement Status** | Shows refinement progress | Polling via `useQuery` |
| **Tag Generation** | Triggers multi-model tagging | `useMutation` → `/api/generate` |
| **Batch Refinement** | Submit/poll/process Opus batch | Manual polling with `refetchInterval` |

### 6.3 Convex UI Improvements

With Convex, replace polling with **real-time subscriptions**:

```typescript
// BEFORE: Polling every 30s
const { data } = useQuery({
  queryKey: ["tagging-status"],
  queryFn: () => fetch("/api/status"),
  refetchInterval: 30000,
});

// AFTER: Real-time subscription
const status = useQuery(api.tagging.status);
// Auto-updates when any workflow step completes
```

**Key changes:**
- No manual polling intervals
- `useQuery` from `convex/react` (not TanStack Query) for reactive data
- Workflow status updates instantly as steps complete
- `onComplete` handler can trigger Stage 2 automatically

### 6.4 Dashboard Components

Build a new dashboard in `apps/grabient-ops` with:

1. **WorkflowList** - Active/completed workflows with real-time status
2. **TaggingPanel** - Start tagging workflows for selected seeds
3. **StatusCards** - Aggregate counts (pending, completed, failed)
4. **ProviderProgress** - Per-provider completion status

All components use `useQuery` subscriptions for live updates.

---

## 7. Environment Variables

Set in Convex Dashboard → Settings → Environment Variables:

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GOOGLE_API_KEY` | Google Gemini API key |
| `GROQ_API_KEY` | Groq API key |

---

## 8. Migration Steps

1. **Create grabient-ops** - `npm create convex@latest -- -t tanstack-start`
2. **Install Workflow** - `pnpm add @convex-dev/workflow`
3. **Register component** - `convex/convex.config.ts`
4. **Create WorkflowManager** - `convex/workflow.ts`
5. **Define schema** - `convex/schema.ts`
6. **Define workflows** - `convex/tagging/workflows.ts`
7. **Implement actions** - Port from `apps/palette-ops/src/lib/providers.ts`
8. **Build UI** - Dashboard with workflow status subscriptions
9. **Migrate data** - Export from D1, import to Convex
10. **Test** - Verify all providers and workflows
11. **Deprecate palette-ops**

---

## 9. Testing Checklist

- [ ] Workflow component registered correctly
- [ ] Schema deploys without errors
- [ ] Batch workflows complete (all providers: OpenAI, Anthropic, Groq, Gemini)
- [ ] Workflows survive server restart (test by stopping `convex dev`)
- [ ] Retries work on transient failures
- [ ] `onComplete` handler fires correctly
- [ ] UI can subscribe to workflow status

---

## Next Step

Continue to [02-palette-refinements.md](./02-palette-refinements.md) to migrate the Opus 4.5 refinement system.

---

## References

### Convex
- [Workflow Component](https://www.convex.dev/components/workflow)
- [Durable Workflows Article](https://stack.convex.dev/durable-workflows-and-strong-guarantees)
- [TanStack Start Quickstart](https://docs.convex.dev/quickstart/tanstack-start)

### Provider Batch APIs
- [OpenAI Batch API](https://platform.openai.com/docs/guides/batch)
- [Google Gemini Batch API](https://ai.google.dev/gemini-api/docs/batch-api)
- [Groq Batch API](https://console.groq.com/docs/batch)

### Existing Code
- `apps/palette-ops/src/lib/providers.ts` - Provider implementations
- `apps/palette-ops/src/lib/tagging.ts` - Orchestration logic
- `packages/data-ops/src/drizzle/app-schema.ts` - Current schema
