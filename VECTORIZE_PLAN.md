# Vectorize Pipeline Plan

## Overview
Final transform on `staged_palettes` before vectorization, combining multiple data sources.

## Pipeline Steps

### 1. Filter staged_palettes → final_palettes (or direct to vector)
- Use paginated filtering approach (like `generated_palettes` → `staged_palettes`)
- **New filter**: Flatten colors (remove corrupted/black palettes)
- Query vector database for existing unique palettes to avoid duplicates

### 2. Vector Database Indexing Question
- Need to determine how to query Vectorize for existing palettes
- Can we temporarily index by similarity key or seed?
- Options to explore:
  - Query by metadata filter (if seed is stored)
  - Use similarity search with high threshold
  - Maintain a separate lookup table

### 3. Tag + Theme Concatenation
- For each batch, concatenate:
  - `tags` (from palette analysis)
  - `themes[]` array from `staged_palettes`
- Similar to current approach in `apps/grabient-ops/convex/vectorize.ts`

### 4. Data Source Combination
- Combine both data sources:
  - Existing refinements (current vectorize.ts approach)
  - New staged_palettes data
- Maintain consistency with existing metadata structure:
  ```typescript
  { seed, tags, style, steps, angle, likesCount, createdAt }
  ```

## Before Starting
- [ ] Iron out the feature the user has in mind (pending)
- [x] Commit current palette-tags and validation code

## Reference Files
- `apps/grabient-ops/convex/vectorize.ts` - Current vector seeding logic
- `apps/grabient-ops/convex/migrationsActions.ts` - Paginated batch processing pattern
- `packages/data-ops/src/gradient-gen/palette-tags.ts` - Tag analysis + validation
