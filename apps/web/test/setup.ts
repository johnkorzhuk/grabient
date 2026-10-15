import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { setAccountMailer } from "@grabient/server/email/send.ts";
import { accountMailer } from "../src/server/email/letters/account.ts";

// as the Worker's entry does: sign-in sends its emails through the app's letters
setAccountMailer(accountMailer);

const bound = env as unknown as { DB: D1Database; TEST_MIGRATIONS: D1Migration[] };

// Applied once per file; a migration already applied is skipped.
await applyD1Migrations(bound.DB, bound.TEST_MIGRATIONS);
