// packages/data-ops/src/database/setup.ts
import { drizzle } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";

let db: ReturnType<typeof drizzle>;

export function initDatabase(d1: D1Database) {
  if (db) {
    return db;
  }
  db = drizzle(d1);
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}
