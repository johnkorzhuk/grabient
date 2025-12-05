# Step 3: Build Admin Dashboard UI

## Goal
Create a full admin dashboard for palette-ops with:
1. Tagging workflow UI (generate tags, run refinements)
2. Status monitoring
3. Palette tag viewer (moved from user-application)

## Source Files

From `apps/user-application/`:

| Source | Destination | Notes |
|--------|-------------|-------|
| `src/components/palettes/palette-tags-panel.tsx` | `src/components/palette-tags-panel.tsx` | Main UI (785 lines) |
| `src/queries/palettes.ts` (partial) | `src/queries/palettes.ts` | `paletteTagsQueryOptions` only |
| `src/server-functions/palettes.ts` (partial) | `src/server-functions/palettes.ts` | `getPaletteTagsForSeed` only |

## Steps

### 3.1 Copy Files from user-application

```bash
# Tag panel component
cp apps/user-application/src/components/palettes/palette-tags-panel.tsx \
   apps/palette-ops/src/components/

# Server function (extract getPaletteTagsForSeed)
# Reference: apps/user-application/src/server-functions/palettes.ts

# Query options (extract paletteTagsQueryOptions)
# Reference: apps/user-application/src/queries/palettes.ts

# Utils (will be copied again in Shadcn setup, but needed for non-UI code too)
mkdir -p apps/palette-ops/src/lib
```

### 3.2 Set Up Tailwind CSS

```bash
cd apps/palette-ops

# Install Tailwind
pnpm add -D tailwindcss postcss autoprefixer

# Copy config files
cp ../user-application/tailwind.config.ts .
cp ../user-application/postcss.config.js .

# Copy CSS variables from user-application/src/styles.css
```

See: [Tailwind CSS Docs](https://tailwindcss.com/docs/installation)

### 3.3 Set Up Shadcn UI

```bash
cd apps/palette-ops

# Initialize Shadcn (match user-application settings)
pnpx shadcn@latest init

# When prompted:
# - Style: new-york
# - Base color: zinc
# - CSS variables: yes
```

Copy existing Shadcn components from user-application:

```bash
# Copy all UI components
cp -r ../user-application/src/components/ui src/components/

# Copy components.json
cp ../user-application/components.json .

# Copy utils
cp ../user-application/src/lib/utils.ts src/lib/
```

Add new components as needed:

```bash
pnpx shadcn@latest add <component>
```

See: [Shadcn UI Docs](https://ui.shadcn.com/docs)

### 3.4 Install UI Dependencies

```bash
cd apps/palette-ops
pnpm add clsx tailwind-merge class-variance-authority lucide-react
pnpm add @radix-ui/react-slot
```

Reference `user-application/package.json` for additional Radix UI dependencies used by copied Shadcn components.

### 3.5 Adapt Components

Modify `palette-tags-panel.tsx`:
1. Accept `seed` as prop instead of using `useParams`
2. Remove admin role checks (entire app is admin-only)
3. Update import paths to local files

### 3.6 Create Dashboard UI

Build dashboard pages with:
- **Status Panel**: Display counts from `/api/status` and `/api/refine/status`
- **Tag Generation Panel**: Form to call `/api/generate` with limit
- **Refinement Panel**: Batch workflow (submit → poll status → process results)
- **Tag Viewer**: Palette list + tag panel

Reference patterns from `user-application` for TanStack Query usage.

See:
- [TanStack Query Docs](https://tanstack.com/query/latest)
- [TanStack Start Server Functions](https://tanstack.com/start/latest/docs/framework/react/server-functions)

## Dashboard Features Summary

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/` | Status overview, tag generation, batch refinement |
| Tag Viewer | `/tags` | Browse palettes, view raw tags and refinements |

### Dashboard (`/`) Features:
- **Status Panel**: Live counts of pending/tagged/refined palettes
- **Tag Generation**: Generate tags for N palettes using multi-model consensus
- **Refinement Panel**: Submit Opus 4.5 batch, monitor status, process results

### Tag Viewer (`/tags`) Features:
- Sidebar with admin-liked palettes
- Select palette to view:
  - Raw tags from each model
  - Model agreement percentages
  - Refined tags output
  - Embed text for vector search

---

## Verification

```bash
cd apps/palette-ops
pnpm dev

# Dashboard: http://localhost:3001/
# Tag Viewer: http://localhost:3001/tags
```

## Next Step

Continue to [04-cleanup.md](./04-cleanup.md) for final steps: cleanup, validation, and future work.
