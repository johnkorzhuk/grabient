# 03: Admin UI for Workflow Management

> **Branch**: `vector-seed`
> **App**: `apps/grabient-ops` (TanStack Start + Convex)
> **Reference**: `apps/palette-ops/src/routes/index.tsx`

## Overview

The admin dashboard provides controls and visibility into the tagging and refinement workflows. With Convex, the UI uses **real-time subscriptions** instead of polling.

---

## 1. Current vs New Architecture

| Aspect | Current (palette-ops) | New (grabient-ops) |
|--------|----------------------|-------------------|
| Data fetching | Polling every 30s | Real-time subscriptions |
| Batch status | Manual polling + "Process Results" button | Automatic via workflow |
| State management | Local React state + TanStack Query | Convex `useQuery` |
| API layer | REST endpoints | Convex functions |

---

## 2. Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Grabient Ops                                    [Admin]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │   Tagging Status    │  │  Refinement Status  │          │
│  │   (real-time)       │  │  (real-time)        │          │
│  └─────────────────────┘  └─────────────────────┘          │
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │  Start Tagging      │  │  Start Refinement   │          │
│  │  (workflow control) │  │  (workflow control) │          │
│  └─────────────────────┘  └─────────────────────┘          │
│                                                             │
│  ┌──────────────────────────────────────────────┐          │
│  │            Active Workflows                   │          │
│  │            (live progress)                    │          │
│  └──────────────────────────────────────────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Status Panels

### 3.1 Tagging Status

**Displays:**
- Total seeds in database
- Current run number (e.g., "Run 3 of 8")
- Seeds completed this run / total seeds
- Seeds pending this run
- Current prompt version
- Total tokens used (aggregated from all runs)
- Tokens by provider (for cost analysis)

**Convex query:**
```typescript
// convex/tagging/status.ts
export const status = query({
  args: { targetRuns: v.number() },
  handler: async (ctx, args) => {
    // Calculate current run and progress
    return {
      totalSeeds: /* count */,
      currentRun: /* lowest incomplete run */,
      targetRuns: args.targetRuns,
      completedThisRun: /* seeds with all providers this run */,
      pendingThisRun: /* seeds missing providers this run */,
      promptVersion: CURRENT_PROMPT_VERSION,
    };
  },
});
```

**UI subscription:**
```typescript
const status = useQuery(api.tagging.status);
// Auto-updates when palette_tags table changes
```

### 3.2 Refinement Status

**Displays:**
- Seeds with complete tags (ready for refinement)
- Seeds already refined
- Seeds pending refinement
- Error count

**Convex query:**
```typescript
// convex/refinement/status.ts
export const status = query({
  handler: async (ctx) => {
    const tagged = /* seeds with complete tags */;
    const refined = await ctx.db.query("palette_tag_refined").collect();
    return {
      readyForRefinement: tagged.length,
      refined: refined.length,
      pending: tagged.length - refined.length,
      errors: /* count failed refinements */,
    };
  },
});
```

---

## 4. Workflow Controls

### 4.1 Start Tagging Panel

**Controls:**
- **Target runs** - How many times each palette should be tagged per provider (e.g., 8)
- **Batch size** - Number of seeds to process per workflow (default: 50)
- **Provider selection** - Which providers to run (default: all)
- **Start button** - Kicks off tagging workflow

**Mutation:**
```typescript
const startTagging = useMutation(api.tagging.start);

// On button click
await startTagging({
  targetRuns: 8,              // Admin-configurable
  limit: batchSize,
  providers: selectedProviders,
});
```

**Behavior:**
- Button disabled while workflow is active
- No manual "process results" step needed
- Workflow handles submit → poll → store automatically

### 4.2 Image Generation Panel

**Controls:**
- **Generate All Missing** - Generate images for all palettes without `imageUrl`
- Progress indicator showing images generated / total

**Mutation:**
```typescript
const generateImages = useMutation(api.images.generateAllMissing);

await generateImages();
```

**Note:** Images must be generated before refinement can run (refinement requires image URLs).

### 4.3 Start Refinement Panel

**Controls:**
- **Batch size** - Number of seeds to refine (default: 50)
- **Start button** - Kicks off refinement workflow

**Mutation:**
```typescript
const startRefinement = useMutation(api.refinement.start);

await startRefinement({ limit: batchSize });
```

---

## 5. Active Workflows Panel

Shows all running workflows with real-time progress.

### 5.1 Displayed Information

| Field | Description |
|-------|-------------|
| Workflow ID | Unique identifier |
| Type | `tagging` or `refinement` |
| Status | `running`, `completed`, `failed` |
| Started | Timestamp |
| Progress | Current step / total steps |
| Seeds | Number of seeds in batch |

### 5.2 Workflow Status Query

```typescript
// convex/workflows/list.ts
export const activeWorkflows = query({
  handler: async (ctx) => {
    // Query workflow component for active workflows
    return await workflow.list(ctx, { status: "running" });
  },
});
```

### 5.3 UI Component

```typescript
function ActiveWorkflows() {
  const workflows = useQuery(api.workflows.list);

  return (
    <div>
      {workflows?.map((wf) => (
        <WorkflowCard
          key={wf.id}
          id={wf.id}
          type={wf.type}
          status={wf.status}
          progress={wf.completedSteps / wf.totalSteps}
          startedAt={wf.startedAt}
        />
      ))}
    </div>
  );
}
```

### 5.4 Progress Indicators

For batch workflows, show:
- **Submitted** → **Polling** → **Processing** → **Complete**

Each step updates in real-time as the workflow progresses through journaled steps.

---

## 6. Key Differences from Current UI

### 6.1 No Manual "Process Results"

**Current:** Admin must click "Process Results" after batch completes.

**New:** Workflow automatically processes results as final step. Admin just watches progress.

### 6.2 No Polling Intervals

**Current:** UI polls `/api/status` every 30 seconds.

**New:** Convex subscriptions push updates instantly when data changes.

### 6.3 No Local Batch State

**Current:** `batchId` and `seedMapping` stored in React state. Lost on page refresh.

**New:** Workflow state persisted in Convex. Survives page refresh, browser close, even server restart.

---

## 7. Additional Views

### 7.1 Tag Viewer

Browse and inspect generated tags for individual palettes.

**Features:**
- Search by seed
- View all provider responses
- See consensus aggregation
- View refined output

### 7.2 Workflow History

View completed workflows.

**Features:**
- Filter by type, status, date
- View completion time
- See error details for failed workflows
- Re-run failed workflows

---

## 8. Implementation Checklist

- [ ] Create status queries (`tagging/status.ts`, `refinement/status.ts`)
- [ ] Create workflow list query
- [ ] Build StatusPanel components with `useQuery`
- [ ] Build control panels with `useMutation`
- [ ] Build ActiveWorkflows component
- [ ] Add Tag Viewer page
- [ ] Add Workflow History page
- [ ] Style with existing shadcn/ui components

---

## References

- `apps/palette-ops/src/routes/index.tsx` - Current dashboard implementation
- [Convex React hooks](https://docs.convex.dev/client/react)
- [useQuery](https://docs.convex.dev/client/react#usequery)
- [useMutation](https://docs.convex.dev/client/react#usemutation)
