# Handoff: DuckDB Integration for Analytics

## Background

This project uses Convex as the primary database. We've been hitting Convex limitations when running refinement jobs that need to aggregate tag data across palettes.

## The Core Problem

We have a `palette_tags` table with AI-generated tag data. When building summaries for refinement, we aggregate this data into frequency maps (e.g., `{ "warm": 3, "cool": 2 }`). These frequency maps use **tag values as object keys**.

**Convex has strict field name requirements:**
- Only printable ASCII characters (0x20-0x7E)
- No control characters, newlines, or non-ASCII

**AI-generated data is unpredictable:**
- Chinese characters (`凉` meaning "cool")
- Corrupted JSON fragments (`purple'],\n "temperature`)
- Emoji, accented characters, etc.

We've been patching sanitization functions, but this is unsustainable. New edge cases keep appearing.

## User's Decision

The user wants to **integrate DuckDB** as an analytics layer instead of continuing to patch Convex limitations. Key points from the conversation:

1. **Keep Convex for OLTP** - real-time reads/writes, subscriptions, transactional operations
2. **Use DuckDB for OLAP** - analytics, aggregations, full table scans, complex queries
3. **The consensus/frequency counting is an analytics problem** - better suited for OLAP

## What DuckDB Would Solve

1. **No field name restrictions** - DuckDB handles arbitrary strings in data
2. **Better aggregation performance** - columnar storage, optimized for GROUP BY
3. **Complex queries** - can do things Convex can't (window functions, CTEs, etc.)
4. **No 16MB read limit** - process entire tables without pagination issues

## Architecture to Research

```
┌─────────────────────────────────────┐    ┌──────────────────────────┐
│           Convex (OLTP)             │    │    DuckDB (OLAP)         │
│                                     │    │                          │
│  • palette_tags (raw data)          │───▶│  • Tag frequency analysis│
│  • palettes                         │    │  • Consensus building    │
│  • Real-time UI subscriptions       │    │  • Complex aggregations  │
│                                     │    │                          │
│  Fast for:                          │    │  Fast for:               │
│  • Single palette lookups           │    │  • "Top 100 tags"        │
│  • Storing new tag results          │    │  • "Tags by prompt ver"  │
│  • Real-time updates                │    │  • Full table analytics  │
└─────────────────────────────────────┘    └──────────────────────────┘
```

## Questions for Convex LLM

1. **Data sync pattern**: What's the best way to sync Convex data to DuckDB?
   - Periodic export to Parquet?
   - Streaming via Convex actions?
   - Use Convex's export API?

2. **Where to run DuckDB**:
   - In Convex actions (Node.js runtime)?
   - Separate service?
   - Edge function?

3. **Can DuckDB run in Convex actions?** The `'use node'` runtime has npm access - can we use `duckdb` or `@duckdb/duckdb-wasm`?

4. **Hybrid query pattern**: How to query Convex, export subset to DuckDB, run analytics, return results?

## Current Code Structure

### Key Files
- `convex/refinement.ts` - `getPalettesForRefinement`, `buildTagSummaries` (the problematic aggregation)
- `convex/refinementActions.ts` - batch submission that calls refinement queries
- `convex/consensus.ts` - attempted pre-computed consensus (also hit Convex limits)
- `convex/lib/providers.ts` - tag response schema with sanitization

### The Problematic Pattern (in refinement.ts)

```typescript
// This builds frequency maps with tag values as keys
// Convex rejects non-ASCII keys when returning from queries
function aggregateTagsFromRawData(tags) {
  const result = {
    categorical: {
      temperature: {} as Record<string, number>,  // <-- keys like "warm", "凉" cause issues
      // ...
    },
    tags: {
      mood: {} as Record<string, number>,  // <-- keys like "purple'],\n" cause issues
      // ...
    },
  }
  // ... aggregation logic
}
```

### Schema (convex/schema.ts)

```typescript
palette_tags: PaletteTags.table
  .index('by_seed_provider', ['seed', 'provider', 'model'])
  .index('by_provider', ['provider']),

palette_tag_consensus: PaletteTagConsensus.table  // Pre-computed, but also limited
  .index('by_seed', ['seed'])
  .index('by_seed_version', ['seed', 'promptVersion'])
  .index('by_prompt_version', ['promptVersion']),
```

## What Was Already Tried

1. **Pre-computed consensus table** (`palette_tag_consensus`) - Still uses Record<string, number> which hits same Convex field name limits

2. **Sanitization functions** - Added to:
   - `convex/lib/providers.ts` - `sanitizeTagString()`
   - `convex/refinement.ts` - `sanitizeKey()`
   - Both now use `[^\x20-\x7E]` to keep only ASCII, but this is fragile

3. **Multiple pagination approaches** - Hit "multiple paginated queries" error, then 16MB read limit

## Ideal Outcome

A robust solution where:
1. Raw AI-generated tags are stored in Convex as-is (in the `tags` JSON field)
2. Analytics/aggregation happens in DuckDB where there are no field name restrictions
3. Refinement jobs can query aggregated data without hitting Convex limits
4. The solution is maintainable and doesn't require constant edge-case patching

## Files to Look At

1. `convex/refinement.ts` - especially `buildTagSummaries` and `aggregateTagsFromRawData`
2. `convex/schema.ts` - current table structure
3. `convex/lib/providers.ts` - tag response schema and sanitization
