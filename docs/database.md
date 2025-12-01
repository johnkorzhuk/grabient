# Serverless Database Setup

*Setup Guide*

Configure your database for edge connections

## Overview

Because edge request invocations run in isolation, database connections must be proxied through an HTTP server in order to not overwhelm database connections with too many concurrent connections.

Fortunately, most popular modern database providers offer **managed solutions** that handle proxied requests automatically, making it easy to connect from serverless and edge environments:

- **[PlanetScale](https://planetscale.com/docs/vitess/tutorials/planetscale-serverless-driver)** for MySQL and PostgreSQL with their serverless driver
- **[Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres#supavisor-transaction-mode)** with Supavisor transaction mode for PostgreSQL
- **[Neon](https://neon.com/)** for PostgreSQL with built-in connection pooling
- **[Cloudflare D1](https://developers.cloudflare.com/d1/)** for SQLite with edge-native architecture
- **[Turso](https://turso.tech/)** for SQLite with edge replication

## Step 1: Choose a database

For your serverless application, you'll need to select a database provider that supports edge environments. Here are the top options:

### Recommended: PlanetScale

**PlanetScale** offers exceptional developer experience with **branching workflows**, automatic scaling, and reliable serverless connections. Their MySQL-compatible service includes **zero-downtime schema changes**.

### Budget-Friendly Options with Free Tiers

If you're on a budget, these providers offer generous free tiers:

- **Supabase** - Full-stack platform with PostgreSQL and real-time features
- **Neon** - PostgreSQL with **instant branching** and auto-scaling
- **Turso** - Global SQLite with edge replication for ultra-low latency
- **Cloudflare D1** - Serverless SQLite that runs on Cloudflare's edge network

The budget-friendly options above offer **generous free tiers** to get you started without upfront costs.

## Step 2: Configure the database connection

In the `data-ops` package within your monorepo, you'll configure your database connection to manage schemas and create shareable queries across your application. This centralized approach ensures consistent database operations throughout your project.

The configuration will be defined in the **data-ops package**, which serves as the central hub for all database-related operations, including migrations, schema management, and query definitions that can be shared across different parts of your application.

### PostgreSQL Configuration

```bash
# packages/data-ops/.env
# PostgreSQL Configuration (Supabase, Neon, etc.)
DATABASE_HOST="hostname.com/database-name"
DATABASE_USERNAME="username"
DATABASE_PASSWORD="password"
```

### MySQL Configuration

```bash
# packages/data-ops/.env
# MySQL Configuration (PlanetScale, etc.)
DATABASE_HOST="hostname.com/database-name"
DATABASE_USERNAME="username"
DATABASE_PASSWORD="password"
```

### Cloudflare D1 Configuration

```bash
# packages/data-ops/.env
# Cloudflare D1 Configuration
CLOUDFLARE_DATABASE_ID="<From Cloudflare Dashboard>"
CLOUDFLARE_ACCOUNT_ID="<From Cloudflare Dashboard>"
CLOUDFLARE_D1_TOKEN="<Create in Cloudflare Dashboard>"
```

## Step 3: Setup Drizzle Kit

Drizzle Kit helps you manage your database schema and generate TypeScript types automatically. In the `data-ops` package within your monorepo, you'll configure Drizzle Kit to connect to your database and pull existing schemas into your project.

After configuring Drizzle Kit, you can run `pnpm run drizzle:pull` to pull in existing database schemas from your database to the project. The generated schemas will be available in `src/drizzle/schema.ts`, which you can then use to create type-safe queries throughout your application.

### PostgreSQL Drizzle Configuration

```typescript
// packages/data-ops/drizzle.config.ts
import type { Config } from "drizzle-kit";
const config: Config = {
  out: "./src/drizzle",
  schema: ["./src/drizzle/auth-schema.ts"],
  dialect: "postgresql",
  dbCredentials: {
    url: `postgresql://${process.env.DATABASE_USERNAME}:${process.env.DATABASE_PASSWORD}@${process.env.DATABASE_HOST}`,
  },
  tablesFilter: ["!_cf_KV", "!auth_*"],
};

export default config satisfies Config;
```

### MySQL Drizzle Configuration

```typescript
// packages/data-ops/drizzle.config.ts
import type { Config } from "drizzle-kit";
const config: Config = {
  out: "./src/drizzle",
  schema: ["./src/drizzle/auth-schema.ts"],
  dialect: "mysql",
  dbCredentials: {
    url: `mysql://${process.env.DATABASE_USERNAME}:${process.env.DATABASE_PASSWORD}@${process.env.DATABASE_HOST}`,
  },
  tablesFilter: ["!_cf_KV", "!auth_*"],
};

export default config satisfies Config;
```

### Cloudflare D1 Drizzle Configuration

```typescript
// packages/data-ops/drizzle.config.ts
import type { Config } from "drizzle-kit";
const config: Config = {
  out: "./src/drizzle",
  schema: ["./src/drizzle/auth-schema.ts"],
  dialect: "sqlite",
  driver: "d1-http",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_D1_TOKEN!,
  },
  tablesFilter: ["!_cf_KV", "!auth_*"],
};

export default config satisfies Config;
```

## Step 4: Database Runtime Client

When working with serverless environments, database connections are typically established at runtime, during the execution of your serverless function. This approach allows for efficient management of database resources and ensures that connections are only active when needed.

To streamline database interactions within your serverless application, it's my preference to initialize your Drizzle database instance at the beginning of each serverless invocation. This practice ensures that the database connection is readily available throughout the function's execution, eliminating the need to repeatedly define and inject the database instance. By initializing the database and using the `getDb()` function, you can access your database with ease, creating type-safe queries throughout your application without the need for top-level declarations or complex dependency injection.

### TanStack Start Server Entry Integration

In TanStack Start applications, database initialization occurs in the `src/server.ts` file, which serves as the custom server entry point. This file intercepts all requests before they reach your application routes, making it the ideal location for database setup.

### PostgreSQL (Neon) Runtime Setup

**Database Setup Function:**
```typescript
// packages/data-ops/database/setup.ts
import { drizzle } from "drizzle-orm/neon-http";

let db: ReturnType<typeof drizzle>;

export function initDatabase(connection: {
  host: string;
  username: string;
  password: string;
}) {
  if (db) {
    return db;
  }
  const connectionString = `postgres://${connection.username}:${connection.password}@${connection.host}`;
  db = drizzle(connectionString);
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}
```

**Server Entry Point:**
```typescript
// src/server.ts - TanStack Start Server Entry
import { initDatabase } from "@repo/data-ops/database/setup";
import handler from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";

export default {
  fetch(request: Request) {
    // Initialize database on each request
    const db = initDatabase({
      host: env.DATABASE_HOST,
      username: env.DATABASE_USERNAME,
      password: env.DATABASE_PASSWORD,
    });

    return handler.fetch(request, {
      context: {
        fromFetch: true,
      },
    });
  },
};
```

### MySQL (PlanetScale) Runtime Setup

**Database Setup Function:**
```typescript
// packages/data-ops/database/setup.ts
import { drizzle } from "drizzle-orm/planetscale-serverless";

let db: ReturnType<typeof drizzle>;

export function initDatabase(connection: {
  host: string;
  username: string;
  password: string;
}) {
  if (db) {
    return db
  }
  db = drizzle({ connection });
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}
```

**Server Entry Point:**
```typescript
// src/server.ts - TanStack Start Server Entry
import { initDatabase } from "@repo/data-ops/database/setup";
import handler from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";

export default {
  fetch(request: Request) {
    // Initialize database on each request
    const db = initDatabase({
      host: env.DATABASE_HOST,
      username: env.DATABASE_USERNAME,
      password: env.DATABASE_PASSWORD,
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

**Database Setup Function:**
```typescript
// packages/data-ops/database/setup.ts
import { drizzle } from "drizzle-orm/d1";

let db: ReturnType<typeof drizzle>;

export function initDatabase(d1Db: D1Database) {
  if (db) {
    return db
  }
  db = drizzle(d1Db);
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}
```

**Server Entry Point:**
```typescript
// src/server.ts - TanStack Start Server Entry
import { initDatabase } from "@repo/data-ops/database/setup";
import handler from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";

export default {
  fetch(request: Request) {
    // Initialize database on each request
    const db = initDatabase(env.DB); // D1 binding

    return handler.fetch(request, {
      context: {
        fromFetch: true,
      },
    });
  },
};
```

---

# Database Queries

*Development Guide*

Create reusable, type-safe database queries for your serverless application

## Overview

The **data-ops package** serves as the centralized hub for all database operations in your monorepo. By organizing your queries here, you can create reusable, type-safe database functions that can be shared across multiple applications and services.

This approach promotes code reuse, maintains consistency across your applications, and ensures that database logic is properly tested and maintained in one location.

> **Tip:** Queries defined in the data-ops package are automatically type-safe when using Drizzle ORM, giving you excellent developer experience with autocompletion and compile-time error checking.

## Step 1: Create Your Database Queries (Optional)

Database queries are organized in the `packages/data-ops/src/queries/` directory. Each file typically groups related queries together (e.g., user operations, subscription management, etc.).

All queries use the `getDb()` function to access the database instance, ensuring consistent connection management across your serverless functions.

```typescript
// packages/data-ops/src/queries/polar.ts
import { getDb } from "@/database/setup";
import { subscriptions } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

export async function updateSubscription(data: {
  userId: string;
  status: string;
  subscriptionId: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  startedAt?: string;
  productId: string;
}) {
  const db = getDb();
  await db
    .insert(subscriptions)
    .values({
      userId: data.userId,
      status: data.status,
      subscriptionId: data.subscriptionId,
      currentPeriodStart: data.currentPeriodStart,
      currentPeriodEnd: data.currentPeriodEnd,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd,
      startedAt: data.startedAt,
      productId: data.productId,
    })
    .onConflictDoUpdate({
      target: [subscriptions.userId],
      set: {
        status: data.status,
        subscriptionId: data.subscriptionId,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        startedAt: data.startedAt,
        productId: data.productId,
      },
    });
}

export async function getSubscription(userId: string) {
  const db = getDb();
  const subscription = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  return subscription;
}
```

> **Best Practice:** Use descriptive function names and include proper TypeScript types for all parameters and return values. This makes your queries self-documenting and easier to use.

## Step 2: Export Queries in Package Configuration

To make your queries available to other packages in your monorepo, you need to configure the exports in `package.json` and build the package.

The data-ops package is already configured to export all queries under the `./queries/*` path, making them importable from other applications.

```json
// packages/data-ops/package.json
{
  "name": "@repo/data-ops",
  "exports": {
    "./queries/*": {
      "default": "./dist/queries/*.js",
      "types": "./dist/queries/*.d.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --outDir ./dist && tsc-alias"
  }
}
```

> **Important:** After creating or modifying queries, run `pnpm run build` in the data-ops package to compile the TypeScript and make the queries available to other applications.

## Step 3: Install the Data-Ops Package

Your applications need to include the data-ops package as a dependency to use the shared queries. In a monorepo setup, this is typically done using workspace references.

```json
// apps/user-application/package.json
{
  "name": "user-application",
  "dependencies": {
    "@repo/data-ops": "workspace:^"
  }
}
```

The `workspace:^` syntax tells pnpm to use the local workspace version of the package, ensuring you're always using the latest queries from your data-ops package.

## Step 4: Use Queries in Your Application

Once your queries are built and exported, you can import and use them anywhere in your application. Here are common usage patterns:

### Using in TanStack Start Server Functions

Import your queries directly into server functions for handling API requests and data operations.

```typescript
// apps/user-application/src/server/functions/payments.ts
import { createServerFn } from "@tanstack/react-start";
import {
  updateSubscription,
  getSubscription,
} from "@repo/data-ops/queries/polar";
import { protectedFunctionMiddleware } from "@/server/middleware/auth";

export const baseFunction = createServerFn().middleware([
  protectedFunctionMiddleware,
]);

export const collectSubscription = baseFunction.handler(async (ctx) => {
  const subscription = await ctx.context.polar.subscriptions.list({
    externalCustomerId: ctx.context.userId,
  });

  if (subscription.result.items.length === 0) {
    return null;
  }

  const subscriptionItem = subscription.result.items[0];

  // Use the imported query function
  await updateSubscription({
    userId: ctx.context.userId,
    subscriptionId: subscriptionItem.id,
    productId: subscriptionItem.productId,
    status: subscriptionItem.status,
    startedAt: subscriptionItem.startedAt?.toISOString(),
    currentPeriodStart: subscriptionItem.currentPeriodStart?.toISOString(),
    currentPeriodEnd: subscriptionItem.currentPeriodEnd?.toISOString(),
    cancelAtPeriodEnd: subscriptionItem.cancelAtPeriodEnd,
  });

  return subscriptionItem;
});

export const getUserSubscription = baseFunction.handler(async (ctx) => {
  // Use the imported query function
  const subscription = await getSubscription(ctx.context.userId);
  if (subscription.length === 0) {
    return null;
  }
  return subscription[0];
});
```

### Using in Server Middleware

Queries can also be used in middleware for authentication, authorization, and request preprocessing.

```typescript
// apps/user-application/src/server/middleware/user.ts
import { createMiddleware } from "@tanstack/react-start";
import { getUserByEmail } from "@repo/data-ops/queries/users";

export const userLookupMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next, context }) => {
  // Use imported query function in middleware
  const user = await getUserByEmail(context.email);

  if (!user) {
    throw new Error("User not found");
  }

  return next({
    context: {
      ...context,
      user,
    },
  });
});
```

### Using in REST API Routes & Webhooks

Import and use queries in API routes for handling webhooks, REST endpoints, and other server-side API operations.

```typescript
// apps/user-application/src/routes/api/webhook/polar.ts
import { Subscription } from "@polar-sh/sdk/models/components/subscription.js";
import { Webhooks } from "@polar-sh/tanstack-start";
import { updateSubscription } from "@repo/data-ops/queries/polar";
import { createServerFileRoute } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";

async function handleSubscription(payload: { data: Subscription }) {
  const { data } = payload;
  if (!data.customer.externalId) {
    console.error("Missing customer external ID");
    return;
  }

  // Use the imported query function in webhook handler
  await updateSubscription({
    userId: data.customer.externalId,
    subscriptionId: data.id,
    productId: data.productId,
    status: data.status,
    startedAt: data.startedAt?.toISOString(),
    currentPeriodEnd: data.currentPeriodStart?.toISOString(),
    currentPeriodStart: data.currentPeriodEnd?.toISOString(),
    cancelAtPeriodEnd: data.cancelAtPeriodEnd,
  });
}

export const ServerRoute = createServerFileRoute("/api/webhook/polar").methods({
  POST: Webhooks({
    webhookSecret: env.POLAR_WEBHOOK_SECRET,
    onSubscriptionActive: handleSubscription,
    onSubscriptionCanceled: handleSubscription,
    onSubscriptionCreated: handleSubscription,
    onSubscriptionUpdated: handleSubscription,
    onSubscriptionRevoked: handleSubscription,
    onSubscriptionUncanceled: handleSubscription,
  }),
});
```

## Benefits of Centralized Queries

### 🔄 Code Reuse
Write database queries once and use them across multiple applications and services in your monorepo.

### 🛡️ Type Safety
Drizzle ORM provides full TypeScript support with compile-time type checking and excellent autocompletion.

### 🧪 Easier Testing
Centralized queries can be easily unit tested, ensuring your database logic is reliable and well-tested.

### 📦 Maintainability
Keep all database logic in one place, making it easier to update schemas and optimize queries as your application grows.

---

**Database Setup Complete!** Your application now has a fully configured serverless database with type-safe queries, centralized schema management, and reusable database operations across your monorepo.
