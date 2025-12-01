// packages/data-ops/config/auth.ts
import { createBetterAuth } from "../src/auth/setup";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

// For Better Auth CLI - uses local SQLite for schema generation
const sqlite = new Database(":memory:");
const db = drizzle(sqlite);

export const auth = createBetterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
});
