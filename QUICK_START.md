# 🚀 Quick Start Guide

Get Grabient running locally in **under 10 minutes** without complex configuration!

This guide gets you up and running with the gradient generator **without authentication**. Perfect for:
- First-time contributors exploring the codebase
- Testing gradient generation features
- Local development without full infrastructure setup

For production deployment with auth, see [PRODUCTION.md](./PRODUCTION.md) and [SETUP_GUIDE.txt](./SETUP_GUIDE.txt).

---

## ⚡ Quick Start (5-10 minutes)

### Prerequisites

- **Node.js** v19+ (v22+ recommended)
- **pnpm** 10.14.0+
- **WSL2** (Windows users only - [Why?](#windows-users-must-use-wsl2))

### Step 1: Clone & Setup

```bash
git clone https://github.com/johnkorzhuk/grabient.git
cd grabient
pnpm run setup:quick
```

This installs dependencies and builds required packages (~2-5 minutes).

### Step 2: Start Development Server

```bash
pnpm run dev:user-application
```

**Wait for Vite to build** (~60-90 seconds on first run). You'll see:
```
VITE v7.1.2  ready in 89524 ms

➜  Local:   http://localhost:3000/
```

**Important**: Keep this terminal open! The server needs to run to create the local database.

### Step 3: Seed Database (New Terminal)

Open a **new terminal** in the same directory:

```bash
pnpm run db:seed
```

This seeds your local database with 100+ sample gradients.

### Step 4: Open & Explore

Open http://localhost:3000/ in your browser.

**You're done!** 🎉

You can now:
- Browse and create gradients
- Test the gradient generator
- Explore the codebase
- Make changes and see them live

---

## 🔐 Optional: Enable Authentication

Quick Start mode runs without authentication. To enable auth features:

### 1. Copy Environment Template

```bash
cd apps/user-application
cp .dev.vars.example .dev.vars
```

### 2. Configure Auth (Choose One)

**Option A: Minimal Setup (Generate Secret Only)**
```bash
# Generate a random secret
openssl rand -base64 32

# Add to .dev.vars:
BETTER_AUTH_SECRET=<your-generated-secret>
```

This enables basic auth structure but won't allow actual sign-ins.

**Option B: Full Setup (Google OAuth + Magic Links)**

Edit `.dev.vars` with your credentials:

```bash
# Better Auth
BETTER_AUTH_SECRET=<openssl rand -base64 32>

# Google OAuth (https://console.cloud.google.com/)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Email service (https://resend.com/)
RESEND_API_KEY=your-resend-api-key
```

See [SETUP_GUIDE.txt](./SETUP_GUIDE.txt) for detailed auth configuration.

### 3. Restart Server

```bash
# Stop the dev server (Ctrl+C in the server terminal)
pnpm run dev:user-application
```

---

## 🛠️ Troubleshooting

### HTTP 500 Error on First Load

**Symptom**: Browser shows `{"status":500,"unhandled":true,"message":"HTTPError"}`

**Causes**:
1. Database not initialized (dev server needs to run once first)
2. Database not seeded (no data to display)

**Solution**:
```bash
# Make sure dev server is running
pnpm run dev:user-application

# In new terminal, seed database
pnpm run db:seed

# Refresh browser
```

### `crypto.hash is not a function` Error

**Windows Users**: You MUST use WSL2. See [Windows Setup](#windows-users-must-use-wsl2).

**Other Users**: Update to Node.js v19+ (v22+ recommended).

### Database Errors / Query Failures

**Solution**: Seed the database:
```bash
pnpm run db:seed
```

### Port 3000 Already in Use

```bash
# Find and kill the process using port 3000
# Linux/macOS:
lsof -ti:3000 | xargs kill -9

# Windows (PowerShell):
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process

# Or use a different port:
cd apps/user-application
PORT=3001 pnpm dev
```

### Module Not Found / Import Errors

```bash
# Clear caches and reinstall
rm -rf node_modules .wrangler apps/*/node_modules apps/*/.vite
pnpm run setup:quick
```

---

## 📝 Project Structure

```
grabient/
├── apps/
│   ├── user-application/   # Main TanStack Start app (gradient UI)
│   └── data-service/       # Background jobs (optional)
├── packages/
│   └── data-ops/          # Database, auth, shared logic
├── QUICK_START.md         # This file
├── SETUP_GUIDE.txt        # Detailed production setup
└── PRODUCTION.md          # Production deployment checklist
```

---

## 💡 Common Tasks

### View Database

```bash
pnpm run db:studio
```

Opens Drizzle Studio at http://localhost:4983/

### Run Tests

```bash
pnpm test
```

### Build for Production

```bash
pnpm run build:data-ops
cd apps/user-application
pnpm run build
```

### Deploy to Cloudflare

See [PRODUCTION.md](./PRODUCTION.md) for deployment instructions.

---

## 🪟 Windows Users: Must Use WSL2

**Why?**
Grabient uses native Node modules (better-sqlite3, rollup, esbuild) that must be compiled for Linux to work with Cloudflare Workers local development environment.

### Setup WSL2

1. **Install WSL2**:
   ```powershell
   wsl --install
   ```

2. **Install Node.js in WSL**:
   ```bash
   # Inside WSL terminal
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 22
   nvm use 22
   ```

3. **Enable pnpm**:
   ```bash
   corepack enable
   corepack prepare pnpm@10.14.0 --activate
   ```

4. **Clone & Run in WSL**:
   ```bash
   # Navigate to Windows directory from WSL
   cd /mnt/c/your/project/path

   # Follow Quick Start steps above
   pnpm run setup:quick
   ```

---

## 🎯 What's Included in Quick Start Mode

### ✅ Working Features
- ✅ Gradient generator (all styles)
- ✅ Browse gradients
- ✅ Create & customize gradients
- ✅ Save gradients (locally)
- ✅ Export gradients (CSS, SVG, etc.)
- ✅ 100+ pre-seeded sample gradients

### ⚠️ Disabled Features (Without Auth)
- ❌ User sign-in/sign-up
- ❌ Saved collections (requires user account)
- ❌ Liking gradients (requires user account)
- ❌ Profile management

To enable these, follow [Optional: Enable Authentication](#-optional-enable-authentication).

---

## 🚦 Next Steps

### For Contributors

1. **Explore the Codebase**
   - Check out `apps/user-application/src/routes/` for UI components
   - Look at `packages/data-ops/` for database and business logic
   - Review `apps/user-application/src/server.ts` for serverside entry point

2. **Make Changes**
   - Vite hot-reloads on file changes
   - Check console for errors
   - Test in browser

3. **Submit a PR**
   - Create a feature branch: `git checkout -b feat/your-feature`
   - Make your changes
   - Test thoroughly
   - Submit PR with clear description

### For Production Use

1. Review [SETUP_GUIDE.txt](./SETUP_GUIDE.txt) for complete setup
2. Configure auth providers (Google OAuth, etc.)
3. Set up Cloudflare D1 database
4. Configure R2 storage
5. Follow [PRODUCTION.md](./PRODUCTION.md) checklist

---

## 📚 Additional Resources

- **Tech Stack**: TanStack Start, React 19, Cloudflare Workers, D1, Better Auth
- **Documentation**:
  - [TanStack Start](https://tanstack.com/start)
  - [Cloudflare D1](https://developers.cloudflare.com/d1/)
  - [Better Auth](https://www.better-auth.com/)
  - [Drizzle ORM](https://orm.drizzle.team/)

---

## ❓ Need Help?

- **Issues**: [GitHub Issues](https://github.com/johnkorzhuk/grabient/issues)
- **Discussions**: [GitHub Discussions](https://github.com/johnkorzhuk/grabient/discussions)
- **Full Setup**: See [SETUP_GUIDE.txt](./SETUP_GUIDE.txt)

---

## 🎉 Success!

If you made it here, you should have Grabient running locally!

**Now go create some beautiful gradients!** 🌈

---

<sub>Made with ❤️ by contributors | [License](./LICENSE.md)</sub>
