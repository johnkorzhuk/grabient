# Better Auth Setup
---
## Overview

Better Auth provides a comprehensive authentication solution that works seamlessly with serverless and edge environments. It offers built-in support for multiple authentication strategies including social providers, email/password, and session management.

The authentication system is designed with **database-agnostic architecture** and includes:

- **Social Authentication** - Support for Google, GitHub, Discord, and other OAuth providers
- **Session Management** - Secure token-based sessions with automatic refresh
- **Database Integration** - Works with PostgreSQL, MySQL, and SQLite and other providers through Drizzle ORM
- **Type Safety** - Full TypeScript support with auto-generated schemas
- **Edge Compatible** - Optimized for serverless and edge runtime environments
---

## Step 1: Configure environment variables

Set up the required environment variables for authentication. You'll need a secret key for token signing and OAuth credentials for social authentication providers.

Generate a secure secret key using: `openssl rand -base64 32`

### PostgreSQL Configuration

```bash
# packages/data-ops/.env
# Auth Environment Variables
BETTER_AUTH_SECRET="your-secret-key-here"

# Google OAuth (optional)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

### MySQL Configuration

```bash
# packages/data-ops/.env
# Auth Environment Variables
BETTER_AUTH_SECRET="your-secret-key-here"

# Google OAuth (optional)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

### Cloudflare D1 Configuration

```bash
# packages/data-ops/.env
# Auth Environment Variables
BETTER_AUTH_SECRET="your-secret-key-here"

# Google OAuth (optional)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

> **OAuth Setup:** Create OAuth applications in your provider's developer console (e.g., Google Cloud Console) and add the redirect URI: `https://your-domain.com/api/auth/callback/google`

## Step 2: Configure Better Auth CLI

Create the Better Auth configuration for the CLI. This configuration is used by the `better-auth:generate` command to create database schemas and TypeScript types.

Update your `packages/data-ops/config/auth.ts` file based on your database provider. This instance is used exclusively by the Better Auth CLI and should not be used in your application runtime.

### PostgreSQL CLI Configuration

```typescript
// packages/data-ops/config/auth.ts
import { createBetterAuth } from "../src/auth/setup";
import { initDatabase } from "../src/database/setup";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = createBetterAuth({
  database: drizzleAdapter(
    initDatabase({
      password: process.env.DATABASE_PASSWORD!,
      host: process.env.DATABASE_HOST!,
      username: process.env.DATABASE_USERNAME!,
    }),
    {
      provider: "pg",
    },
  ),
});
```

### MySQL CLI Configuration

```typescript
// packages/data-ops/config/auth.ts
import { createBetterAuth } from "../src/auth/setup";
import { initDatabase } from "../src/database/setup";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = createBetterAuth({
  database: drizzleAdapter(
    initDatabase({
      password: process.env.DATABASE_PASSWORD!,
      host: process.env.DATABASE_HOST!,
      username: process.env.DATABASE_USERNAME!,
    }),
    {
      provider: "mysql",
    },
  ),
});
```

### Cloudflare D1 CLI Configuration

```typescript
// packages/data-ops/config/auth.ts
import { createBetterAuth } from "../src/auth/setup";
import Database from "better-sqlite3";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

// For CLI use - uses dummy SQLite database
export const auth = createBetterAuth({
  database: drizzleAdapter(new Database("./config/test.sqlite"), {
    provider: "sqlite",
  }),
});
```

## Step 3: Generate authentication schemas

Use Better Auth CLI to generate the database schemas and TypeScript types. This will create the necessary authentication tables in your database and generate type-safe schema definitions.

### 1. Generate Better Auth schemas

```bash
pnpm run better-auth:generate
```

This creates `packages/data-ops/src/drizzle/auth-schema.ts` with your authentication tables

### 2. Generate Drizzle migrations

```bash
pnpm run drizzle:generate
```

This creates SQL migration files in `packages/data-ops/src/drizzle`

### 3. Run migrations (optional)

```bash
pnpm run drizzle:migrate
```

This automatically applies migrations to create the auth tables

> **Table Filtering:** Auth tables are prefixed with `auth_` and filtered out in `drizzle.config.ts` to prevent conflicts when using `drizzle:pull` for application schemas.

## Step 4: Runtime authentication setup

Configure authentication for your serverless application runtime. The `setAuth` function initializes Better Auth with your database connection and configuration during each serverless invocation.

This setup occurs in your server entry point, typically `src/server.ts`, where you initialize the database and configure authentication before handling requests.

### PostgreSQL Runtime Setup

```typescript
// src/server.ts - TanStack Start Server Entry
import { setAuth } from "@repo/data-ops/auth/server";
import { initDatabase } from "@repo/data-ops/database/setup";
import handler from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";

export default {
  fetch(request: Request) {
    const db = initDatabase({
      host: env.DATABASE_HOST,
      username: env.DATABASE_USERNAME,
      password: env.DATABASE_PASSWORD,
    });

    setAuth({
      secret: env.BETTER_AUTH_SECRET,
      socialProviders: {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      },
      adapter: {
        drizzleDb: db,
        provider: "pg",
      },
    });

    return handler.fetch(request, {
      context: {
        fromFetch: true,
      },
    });
  },
};
```

### MySQL Runtime Setup

```typescript
// src/server.ts - TanStack Start Server Entry
import { setAuth } from "@repo/data-ops/auth/server";
import { initDatabase } from "@repo/data-ops/database/setup";
import handler from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";

export default {
  fetch(request: Request) {
    const db = initDatabase({
      host: env.DATABASE_HOST,
      username: env.DATABASE_USERNAME,
      password: env.DATABASE_PASSWORD,
    });

    setAuth({
      secret: env.BETTER_AUTH_SECRET,
      socialProviders: {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      },
      adapter: {
        drizzleDb: db,
        provider: "mysql",
      },
    });

    return handler.fetch(request, {
      context: {
        fromFetch: true,
      },
    });
  },
};
```

### Cloudflare D1 Runtime Setup

```typescript
// src/server.ts - TanStack Start Server Entry
import { setAuth } from "@repo/data-ops/auth/server";
import { initDatabase } from "@repo/data-ops/database/setup";
import handler from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";

export default {
  fetch(request: Request) {
    const db = initDatabase(env.DB); // D1 binding

    setAuth({
      secret: env.BETTER_AUTH_SECRET,
      socialProviders: {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      },
      adapter: {
        drizzleDb: db,
        provider: "sqlite",
      },
    });

    return handler.fetch(request, {
      context: {
        fromFetch: true,
      },
    });
  },
};
```

## Step 5: API route integration

Create API routes to handle authentication requests. Better Auth provides a single handler that manages all authentication endpoints including sign-in, sign-out, callbacks, and session management.

### TanStack Start File-based API Routes

TanStack Start uses file-based routing for API endpoints. The `auth.$.tsx` route creates a catch-all API handler that processes all authentication-related requests under `/api/auth/*`.

```typescript
// src/routes/api/auth.$.tsx
import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@repo/data-ops/auth/server";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const auth = getAuth();
        return auth.handler(request);
      },
      POST: ({ request }) => {
        const auth = getAuth();
        return auth.handler(request);
      },
    },
  },
});
```

### How TanStack Start API Routes Work

**File-based Routing:**
- `auth.$.tsx` - The `$` creates a splat/catch-all route that matches `/api/auth/*`
- Automatically handles all authentication endpoints: `/api/auth/sign-in`, `/api/auth/callback/google`, `/api/auth/session`, etc.

**Server Handlers:**
- `server.handlers` - Defines HTTP methods (GET, POST) for server-side processing
- `request` parameter - Contains the full HTTP request with headers, body, and URL
- Each handler returns a Response object that TanStack Start automatically serves

**Better Auth Integration:**
- `getAuth()` - Retrieves the initialized Better Auth instance from your server setup
- `auth.handler(request)` - Single method that routes requests to appropriate Better Auth endpoints
- Handles OAuth callbacks, session validation, sign-in/out, and token refresh automatically

## Step 6: Client-side integration

Use the Better Auth client to integrate authentication into your React components. The client provides hooks and utilities for managing authentication state and user sessions.

```typescript
// apps/user-application/src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient();

export const { useSession, signIn, signOut } = authClient;

// Usage in components
export function LoginButton() {
  const { data: session } = useSession();

  if (session) {
    return (
      <button onClick={() => signOut()}>
        Sign out {session.user.name}
      </button>
    );
  }

  return (
    <button onClick={() => signIn.social({ provider: "google" })}>
      Sign in with Google
    </button>
  );
}
```

---

# Better Auth Client Integration

*Client Guide*

Implement secure authentication on the client side with React hooks

## Overview

The Better Auth React client provides a seamless integration for managing authentication state in your React application. It offers type-safe hooks, automatic session management, and optimized caching for a smooth user experience.

The client-side integration includes:

- **React Hooks** - useSession and other authentication hooks
- **Automatic Session Management** - Handles token refresh and session validation
- **Social Authentication** - Streamlined OAuth flows with redirect handling
- **Route Protection** - Easy implementation of authenticated routes
- **TypeScript Support** - Full type safety for user data and session state

## Step 1: Setting up the Better Auth React Client

Create a Better Auth client instance that communicates with your backend authentication endpoints. This client provides React hooks and methods for managing authentication state throughout your application.

The client automatically handles session management, token refresh, and provides optimized caching for authentication state.

```typescript
// src/components/auth/client.ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
```

> **Automatic Configuration:** The client automatically detects the base URL and configures endpoints based on your server setup. For custom configurations, you can pass options like `baseURL` to override defaults.

## Step 2: Implementing Login and Logout Components

Better Auth provides simple methods for social authentication and session management. The login component handles OAuth flows while the logout functionality can be integrated into user account interfaces.

### Google OAuth Login Component

The login component uses `authClient.signIn.social()` to initiate OAuth flows with redirect handling.

```typescript
// src/components/auth/google-login.tsx
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "./client";

export function GoogleLogin() {
  const handleGoogleSignIn = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/app",
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
          <CardDescription>Sign in to your account to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleGoogleSignIn}
            className="w-full h-12 text-base"
            variant="outline"
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              {/* Google icon SVG paths */}
            </svg>
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

### Account Dialog with Logout

The account dialog demonstrates session state management and logout functionality using `useSession` hook.

```typescript
// src/components/auth/account-dialog.tsx
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { authClient } from "./client";
import { LogOut, Palette } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

interface AccountDialogProps {
  children: React.ReactNode;
}

export function AccountDialog({ children }: AccountDialogProps) {
  const { data: session } = authClient.useSession();

  const signOut = async () => {
    await authClient.signOut();
  };

  if (!session) {
    return null;
  }

  const user = session.user;
  const fallbackText = user.name
    ? user.name.charAt(0).toUpperCase()
    : user.email?.charAt(0).toUpperCase() || "U";

  return (
    <Dialog>
      {children}
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center pb-4">
          <DialogTitle>Account</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center space-y-6 py-6">
          <Avatar className="h-20 w-20">
            <AvatarImage
              src={user.image || undefined}
              alt={user.name || "User"}
            />
            <AvatarFallback className="text-2xl font-semibold">
              {fallbackText}
            </AvatarFallback>
          </Avatar>
          <div className="text-center space-y-1">
            {user.name && (
              <div className="text-lg font-semibold">{user.name}</div>
            )}
            {user.email && (
              <div className="text-sm text-muted-foreground">{user.email}</div>
            )}
          </div>
          <div className="flex flex-col gap-4 w-full mt-6">
            <div className="flex items-center justify-between w-full py-3 px-4 rounded-lg border bg-card">
              <span className="text-sm font-medium flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Theme
              </span>
              <ThemeToggle />
            </div>
            <Button
              onClick={signOut}
              variant="outline"
              size="lg"
              className="w-full gap-2"
            >
              <LogOut className="h-5 w-5" />
              Sign Out
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

> **Session Management:** The `useSession` hook automatically manages authentication state, handles token refresh, and provides real-time updates when the session changes.

## Step 3: Protecting Routes with Authentication

Better Auth provides two approaches for route protection: client-side authentication checks and server-side rendering (SSR) protection. Both patterns ensure users must be authenticated to access certain areas of your application.

Choose the appropriate method based on your security requirements and user experience needs.

### Client-side Route Protection

```typescript
// src/routes/_authed/route.tsx
import { authClient } from "@/components/auth/client";
import { GoogleLogin } from "@/components/auth/google-login";
import { Sidebar } from "@/components/common/sidebar";
import { Header } from "@/components/common/header";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed")({
  component: RouteComponent,
});

function RouteComponent() {
  const session = authClient.useSession();

  return (
    <>
      {session.isPending ? (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div>Loading...</div>
        </div>
      ) : session.data ? (
        <div className="flex h-screen bg-background">
          <Sidebar />
          <div className="flex flex-col flex-1 overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto p-6">
              <Outlet />
            </main>
          </div>
        </div>
      ) : (
        <GoogleLogin />
      )}
    </>
  );
}
```

# Server-side (SSR) Route Protection

```typescript
// src/routes/_authed/route.tsx
import { GoogleLogin } from "@/components/auth/google-login";
import { Header } from "@/components/common/header";
import { Sidebar } from "@/components/common/sidebar";
import { userSession } from "@/server/functions/auth";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async () => {
    const session = await userSession();
    if (!session) {
      throw new Error("USER_NOT_AUTHENTICATED");
    }
  },
  component: RouteComponent,
  errorComponent: ({ error }) => {
    if (error.message === "USER_NOT_AUTHENTICATED") {
      return <GoogleLogin />;
    }
  },
});

function RouteComponent() {
  return (
    <>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}
```

### Key Differences Between Approaches

**Client-side:**
- Authentication check happens in the browser
- Loading state while checking session
- Better for dynamic user experiences
- Requires handling pending states

**Server-side (SSR):**
- Authentication validated on server
- No loading state - immediate auth decision
- Better security and SEO
- Uses `beforeLoad` and error handling

### Layout Components

- `<Sidebar />` - Navigation component with user profile
- `<Header />` - Top bar with notifications and sign out
- `<Outlet />` - Renders child routes within the layout

> **Important Notes:** All routes under `/_authed` will automatically inherit authentication protection. For SSR logout functionality, you'll need additional logic to redirect or refresh the page after sign out, as the server-side session validation won't automatically re-run.

---

**Authentication Setup Complete!** Your application now has a fully configured authentication system with social login, session management, database integration, and route protection. Users can sign in securely using their preferred OAuth providers with a polished user experience.
