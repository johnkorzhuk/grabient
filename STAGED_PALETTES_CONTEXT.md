# Staged Palettes Deduplication - COMPLETED

## Results
Successfully processed **44,647** generated palettes → **38,021** unique staged palettes.

### Filter Statistics
- **3,809** invalid seeds (8.5%)
- **26** dominated palettes (90%+ same color)
- **927** low contrast (<0.05)
- **609** high frequency (>1.5)
- **1,255** duplicates (2-decimal precision match)

## Implementation

### Action (`convex/migrationsActions.ts`)
The `processAndStagePalettes` action:
1. Loads all generated_palettes via pagination (2000 per page)
2. Applies 5 quality filters in memory
3. Deduplicates using 2-decimal precision similarity keys
4. Writes results to staged_palettes in batches of 100

### Run Command
```bash
npx convex run migrationsActions:processAndStagePalettes '{"clearFirst": true}'
```

### Queries (`convex/generate.ts`)
- `getStagedPalettes` - paginated query with optional tag filter
- `getStagedPalettesStats` - summary stats (total, unique tags, themes)

### UI (`src/routes/_layout/generate.refine.tsx`)
- Collapsible tags with palette preview
- Stats panel with counts and top tags
- Uses reactive queries (no action needed)

## Schema (`convex/schema.ts:272-288`)
```typescript
staged_palettes: {
  similarityKey: string,      // 2-precision key, indexed
  sourceId: Id<'generated_palettes'>,
  cycle, tag, seed, colors, style, steps, angle, modelKey,
  themes: string[],           // Aggregated from duplicates
}
```

## Clear and Re-run
```bash
# Clear in batches (run until hasMore: false)
npx convex run migrations:clearStagedPalettes '{}'

# Re-process with custom thresholds
npx convex run migrationsActions:processAndStagePalettes '{"clearFirst": false, "minContrast": 0.03, "maxFrequency": 2.0}'
```
