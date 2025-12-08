# grabient-ops

Convex-powered palette tagging and refinement pipeline for Grabient.

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Initialize Convex

```bash
npx convex dev
```

This will prompt you to create a new Convex project or link to an existing one.

### 3. Configure Environment Variables

Set these in **Convex Dashboard → Settings → Environment Variables**:

#### Cloudflare D1 (for seeding palettes)

| Variable | Description |
|----------|-------------|
| `CF_ACCOUNT_ID` | Cloudflare account ID |
| `CF_API_TOKEN` | API token with D1 read permission |
| `CF_D1_DATABASE_ID` | D1 database ID (grabient-prod) |

#### Cloudflare R2 (for palette images)

| Variable | Description |
|----------|-------------|
| `R2_TOKEN` | R2 API token value |
| `R2_ACCESS_KEY_ID` | R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | R2 secret access key |
| `R2_ENDPOINT` | `https://<account_id>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | Bucket name (e.g., `grabient-uploads`) |
| `R2_PUBLIC_URL` | Public URL (e.g., `https://cdn.grabient.com`) |

#### AI Providers (for tagging)

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI (Gemini) API key |
| `GROQ_API_KEY` | Groq API key |

### 4. Create R2 API Token

1. Go to **Cloudflare Dashboard → R2 → Manage R2 API Tokens**
2. Click **Create API Token**
3. Set permissions to **Object Read & Write**
4. Select your bucket (e.g., `grabient-uploads`)
5. Copy all 4 values: Token Value, Access Key ID, Secret Access Key, Endpoint

### 5. Create D1 API Token

1. Go to **Cloudflare Dashboard → Profile → API Tokens**
2. Click **Create Token**
3. Use **Custom Token** template
4. Add permission: **Account → D1 → Read**
5. Copy the token value

## Backend: Local vs Cloud

You can run against either the Convex cloud backend or a local self-hosted backend.

### Quick Start (from repo root)

```bash
# Cloud backend
pnpm dev:grabient-ops

# Local backend (starts Docker automatically)
pnpm dev:grabient-ops:local
```

Local dashboard available at http://localhost:6791

### Manual Switching

```bash
# Switch to local (inside grabient-ops/)
pnpm use:local

# Switch to cloud (inside grabient-ops/)
pnpm use:cloud
```

### Local Backend Commands (from repo root)

| Command | Description |
|---------|-------------|
| `pnpm dev:grabient-ops:local` | Start local backend + run dev server |
| `pnpm local:start` | Start Docker containers only |
| `pnpm local:stop` | Stop Docker containers |
| `pnpm local:logs` | View container logs |

### Why Use Local?

- No billing limits
- Faster iteration (no network latency)
- Works offline
- Full data isolation for testing

## Usage

### Seeding Palettes

From the **Convex Dashboard → Functions**:

1. Run `seed:clearDatabase` to clear existing data (if needed)
2. Run `seed:importFromD1` to import admin liked palettes with images

The `importFromD1` function:
- Queries D1 for palettes liked by admin users
- Generates PNG images (800x400, linearSwatches style, 11 steps)
- Uploads images to R2
- Inserts palettes with imageUrl into Convex

Optional args:
- `batchSize`: Number of palettes per batch (default: 10)

### Queries

- `seed:getPaletteCount` - Get total palette count

## Development

```bash
# Start Convex dev server
pnpm dev

# Run TypeScript check
npx tsc --noEmit
```

## Architecture

- **Convex** - Database and serverless functions
- **@convex-dev/r2** - R2 storage component
- **@convex-dev/workflow** - Durable workflows (for tagging pipeline)
- **@resvg/resvg-wasm** - SVG to PNG conversion
- **@repo/data-ops** - Shared gradient generation utilities
