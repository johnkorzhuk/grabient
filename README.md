# Grabient

A beautiful, performant gradient generator built with TanStack Start, React 19, and Cloudflare Workers.

Color gradient generation inspired by [Inigo Quilez's cosine gradient technique](https://iquilezles.org/articles/palettes/) and [thi-ng/cgg](https://github.com/thi-ng/cgg).

---

## 🚀 Quick Start

**Want to run Grabient locally in under 10 minutes?**

Check out the **[Quick Start Guide](./QUICK_START.md)** for:
- ⚡ Setup without authentication (perfect for contributors!)
- 🎨 100+ pre-seeded sample gradients
- 🛠️ Troubleshooting common issues
- 🪟 Windows/WSL2 setup instructions

```bash
# Quick Start (3 commands)
pnpm run setup:quick
pnpm run dev:user-application  # Wait for server to start
pnpm run db:seed                # In new terminal
```

Then open http://localhost:3000/

**👉 For detailed instructions, see [QUICK_START.md](./QUICK_START.md)**

---

## 📖 Full Setup

For production deployment with authentication and full features:

### Setup

```bash
pnpm run setup
```

This installs all dependencies and builds required packages.

### Development

```bash
pnpm run dev:user-application
```

See [SETUP_GUIDE.txt](./SETUP_GUIDE.txt) for complete configuration instructions.

## Deployment

### Environments

| Environment | Database | Deploy Command | Trigger |
|-------------|----------|----------------|---------|
| Local | SQLite (`.wrangler/`) | `pnpm dev:user-application` | Local dev server |
| Staging | D1 `grabient` | `pnpm deploy:staging` | Manual or non-main branches |
| Production | D1 `grabient-prod` | `pnpm deploy:production` | Push to `main` branch |

### Manual Deployment

```bash
# Deploy to staging
pnpm deploy:staging

# Deploy to production
pnpm deploy:production
```

### Cloudflare CI

Production deploys automatically when pushing to `main`. Configure in Cloudflare Dashboard:
- Build command: `pnpm run build:data-ops && pnpm run --filter user-application build`
- Deploy command: `wrangler deploy --env production`

## Database

### Seeding Local Database

After starting the dev server once (initializes D1), seed with sample data:

```bash
pnpm db:seed
```

### Seeding Staging

```bash
cd packages/data-ops
pnpm db:seed remote --db=grabient
```

### Seeding Production

```bash
cd packages/data-ops
pnpm db:seed:prod --db=grabient-prod
```

### Database Studio

```bash
pnpm db:studio
```

### Running Migrations

```bash
cd packages/data-ops

# Generate migration from schema changes
pnpm drizzle:generate

# Apply to staging
pnpm wrangler d1 migrations apply grabient --remote

# Apply to production
pnpm wrangler d1 migrations apply grabient-prod --remote
```

## Acknowledgments

Built using [saas-kit](https://github.com/backpine/saas-kit) by blackpine (ISC License).

## License

Functional Source License 1.1, Apache 2.0 Future License (FSL-1.1-ALv2).

- You can use, modify, and distribute this code
- You can build non-competing products
- You cannot build a competing commercial color palette service
- After 2 years, becomes Apache 2.0 (fully open source)

See [LICENSE.md](./LICENSE.md) for details.
