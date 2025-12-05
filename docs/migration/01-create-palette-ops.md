# Step 1: Create palette-ops App

## Goal
Create the new `palette-ops` TanStack Start app that will house all palette tagging and analysis functionality.

## Tech Stack
- **TanStack Start** - Full-stack React framework with file-based routing
- **Cloudflare Workers** - Deployment target
- **D1** - Shared production database with user-application
- **Drizzle ORM** - Database queries
- **TanStack Query** - Data fetching and caching
- **Tailwind CSS** - Utility-first styling
- **Shadcn UI** - Component library (new-york style, zinc base)
- **Cloudflare Access** - Zero-trust authentication (no code changes needed)

Follow the same patterns as `user-application` - this is the same stack.

**Docs**:
- [TanStack Start](https://tanstack.com/start/latest)
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [D1 Database](https://developers.cloudflare.com/d1/)

## Security: Cloudflare Access

The app is deployed but protected by Cloudflare Access at the edge. Configure in Cloudflare Dashboard → Zero Trust → Access → Applications after deployment.

See: [Cloudflare Access Docs](https://developers.cloudflare.com/cloudflare-one/policies/access/)

## Prerequisites
- Node.js 18+
- pnpm workspace configured

## Steps

### 1.1 Create App Directory

```bash
mkdir -p apps/palette-ops
cd apps/palette-ops
```

### 1.2 Initialize with TanStack Start

Follow the [TanStack Start Getting Started](https://tanstack.com/start/latest/docs/framework/react/getting-started) guide, then add dependencies:

```bash
# Core dependencies
pnpm add @anthropic-ai/sdk @data-ops/shared @tanstack/react-query drizzle-orm zod

# Dev dependencies
pnpm add -D wrangler
```

Update scripts in `package.json` for port 3001:
```json
{
  "scripts": {
    "dev": "... --port 3001"
  }
}
```

Reference `user-application/package.json` for the exact TanStack Start setup pattern.

### 1.3 Create wrangler.jsonc

Use Workers format with `assets.directory` (not Pages `pages_build_output_dir`):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "palette-ops",
  "compatibility_date": "2024-11-01",
  "compatibility_flags": ["nodejs_compat"],
  "main": "./dist/_worker.js/index.js",
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "grabient",
      "database_id": "your-d1-database-id"
    }
  ],
  "ai": {
    "binding": "AI"
  },
  "vars": {
    "ENVIRONMENT": "development"
  }
}
```

**Deploy with**: `wrangler deploy` (not `wrangler pages deploy`)

See: [Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)

### 1.4 Create app.config.ts

Copy from `user-application/app.config.ts` and adjust as needed.

See: [TanStack Start Hosting - Cloudflare](https://tanstack.com/start/latest/docs/framework/react/hosting/cloudflare)

### 1.5 Create tsconfig.json

Copy from `user-application/tsconfig.json` - same configuration.

### 1.6 Create Directory Structure

```
apps/palette-ops/
├── src/
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   └── api/
│   │       ├── status.ts
│   │       ├── generate.ts
│   │       ├── results.$seed.ts
│   │       ├── refine/
│   │       │   ├── status.ts
│   │       │   ├── single.$seed.ts
│   │       │   ├── batch.ts
│   │       │   ├── batch.$batchId.ts
│   │       │   ├── batch.$batchId.process.ts
│   │       │   └── results.$seed.ts
│   ├── components/
│   │   ├── ui/                    (Shadcn components from user-application)
│   │   └── palette-tags-panel.tsx (from user-application)
│   ├── lib/
│   │   ├── providers.ts (from tagging-service)
│   │   ├── refinement.ts (from tagging-service)
│   │   ├── color-data.ts (from tagging-service)
│   │   └── prompts/
│   │       └── index.ts (from tagging-service)
│   ├── server-functions/
│   │   └── palettes.ts
│   └── router.tsx
├── .dev.vars
├── .vars.example
├── app.config.ts
├── package.json
├── tsconfig.json
└── wrangler.jsonc
```

### 1.7 Create .vars.example

```bash
# Required for AI tag generation
ANTHROPIC_API_KEY=sk-ant-...

# Database connection (auto-configured by wrangler)
# DB is bound via wrangler.jsonc
```

### 1.8 Create .dev.vars

Copy `.vars.example` and fill in actual values:
```bash
ANTHROPIC_API_KEY=your-actual-key
```

### 1.9 Create Routes

Follow [TanStack Start File-Based Routing](https://tanstack.com/start/latest/docs/framework/react/routing/file-based-routing) docs.

Copy and adapt from `user-application/src/routes/__root.tsx` for the root layout.

## Verification

After completing these steps:

```bash
cd apps/palette-ops
pnpm install
pnpm dev
```

Visit `http://localhost:3001` to verify the app loads.

## Next Step

Continue to [02-move-tagging-service.md](./02-move-tagging-service.md) to move the tagging service code.
