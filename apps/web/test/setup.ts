import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";

const bound = env as unknown as { DB: D1Database; TEST_MIGRATIONS: D1Migration[] };

// Applied once per file; a migration already applied is skipped.
await applyD1Migrations(bound.DB, bound.TEST_MIGRATIONS);
