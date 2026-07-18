import { defineConfig } from "drizzle-kit";

// App-local config: this app owns its own D1 database (grabient-dc) and
// migration history. Deliberately does NOT reuse packages/data-ops
// drizzle.config.ts, which points at the production database.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
